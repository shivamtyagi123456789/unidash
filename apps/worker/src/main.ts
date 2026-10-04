import { PgBoss } from "pg-boss";
import pino from "pino";
import dotenv from "dotenv";
import { resolve } from "node:path";
import { readServerEnvironment } from "@unidash/config/env";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const environment = readServerEnvironment();
const connectionString = environment.WORKER_DATABASE_URL ?? environment.DATABASE_URL;

if (!connectionString) {
  throw new Error("Set WORKER_DATABASE_URL before starting the worker.");
}

// The shared DB client reads DATABASE_URL at module load. Honor the worker-specific
// connection string before importing it so queueing and reminder processing share the configured DB.
process.env.DATABASE_URL = connectionString;

const logger = pino({
  level: environment.LOG_LEVEL,
  redact: {
    paths: ["*.password", "*.token", "*.secret", "*.authorization", "*.cookie", "*.connectionString"],
    censor: "[REDACTED]",
  },
});

const boss = new PgBoss({ connectionString });
boss.on("error", (error) => logger.error({ err: error }, "Queue engine error"));

await boss.start();
const { pool } = await import("@unidash/db/client");
logger.info("Background worker is online; no source connectors or external notification providers are enabled.");

async function dispatchInAppReminders() {
  const client = await pool.connect();
  let dispatched = 0;
  try {
    for (let index = 0; index < 100; index += 1) {
      await client.query("BEGIN");
      try {
        // Lock the event first, matching the event→reminder order used by API mutations.
        const eventResult = await client.query<{
          id: string; user_id: string; title: string; starts_at: Date; status: string;
          progress: string; deleted_at: Date | null; hidden_at: Date | null;
        }>(
          `SELECT e.id, e.user_id, e.title, e.starts_at, e.status, e.progress, e.deleted_at, e.hidden_at
           FROM events e
           WHERE EXISTS (
             SELECT 1 FROM reminders due
             WHERE due.user_id = e.user_id AND due.event_id = e.id
               AND due.state = 'PENDING' AND due.channel = 'IN_APP' AND due.remind_at <= now()
               AND NOT EXISTS (
                 SELECT 1 FROM notification_log sent_in_app
                 WHERE sent_in_app.user_id = due.user_id AND sent_in_app.reminder_id = due.id
                   AND sent_in_app.channel = 'IN_APP' AND sent_in_app.status = 'SENT'
                   AND sent_in_app.sent_at >= due.remind_at
               )
           )
           ORDER BY e.starts_at, e.id
           LIMIT 1
           FOR UPDATE OF e SKIP LOCKED`,
        );
        const event = eventResult.rows[0];
        if (!event) {
          await client.query("COMMIT");
          break;
        }

        const reminderResult = await client.query<{ id: string; remind_at: Date; offset_label: string | null; channel: string }>(
          `SELECT r.id, r.remind_at, r.offset_label, r.channel FROM reminders r
           WHERE r.user_id = $1 AND r.event_id = $2
             AND r.state = 'PENDING' AND r.channel = 'IN_APP' AND r.remind_at <= now()
             AND NOT EXISTS (
               SELECT 1 FROM notification_log sent_in_app
               WHERE sent_in_app.user_id = r.user_id AND sent_in_app.reminder_id = r.id
                 AND sent_in_app.channel = 'IN_APP' AND sent_in_app.status = 'SENT'
                 AND sent_in_app.sent_at >= r.remind_at
             )
           ORDER BY r.remind_at, r.id
           LIMIT 1
           FOR UPDATE SKIP LOCKED`,
          [event.user_id, event.id],
        );
        const reminder = reminderResult.rows[0];
        if (!reminder) {
          await client.query("COMMIT");
          continue;
        }

        const now = new Date();
        const eventIsActive = event.status !== "CANCELLED" && event.progress !== "DONE" && event.progress !== "SKIPPED"
          && !event.deleted_at && !event.hidden_at && event.starts_at > now;
        if (!eventIsActive) {
          await client.query("UPDATE reminders SET state = 'SKIPPED' WHERE id = $1 AND user_id = $2", [reminder.id, event.user_id]);
          await client.query("COMMIT");
          continue;
        }

        // Snoozing advances remind_at; treating each scheduled instant as its own
        // idempotency generation allows the snoozed reminder to surface again.
        const dedupeKey = `reminder:${reminder.id}:${reminder.remind_at.toISOString()}:${event.starts_at.toISOString()}`;
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO feed_items (user_id, kind, source, severity, event_id, title, body, payload, dedupe_key)
           VALUES ($1, 'REMINDER', 'SYSTEM', 'IMPORTANT', $2, $3, $4, $5::jsonb, $6)
           ON CONFLICT (user_id, dedupe_key) DO NOTHING
           RETURNING id`,
          [event.user_id, event.id, `Reminder: ${event.title}`,
            reminder.offset_label ?? `Event starts at ${event.starts_at.toISOString()}.`,
            JSON.stringify({ reminderId: reminder.id, eventId: event.id, startsAt: event.starts_at.toISOString() }), dedupeKey],
        );
        const feedId = inserted.rows[0]?.id ?? (await client.query<{ id: string }>(
          "SELECT id FROM feed_items WHERE user_id = $1 AND dedupe_key = $2",
          [event.user_id, dedupeKey],
        )).rows[0]?.id;
        if (!feedId) throw new Error("Could not resolve the idempotent reminder feed item.");

        await client.query(
          `INSERT INTO notification_log (user_id, feed_item_id, reminder_id, channel, status, attempts, sent_at)
           VALUES ($1, $2, $3, 'IN_APP', 'SENT', 1, now())
           ON CONFLICT (feed_item_id, channel) DO NOTHING`,
          [event.user_id, feedId, reminder.id],
        );
        await client.query(
          "UPDATE reminders SET state = 'SENT', sent_at = now() WHERE id = $1 AND user_id = $2",
          [reminder.id, event.user_id],
        );
        await client.query("COMMIT");
        dispatched += 1;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    if (dispatched > 0) logger.info({ count: dispatched }, "In-app reminders added to the feed");
  } finally {
    client.release();
  }
}

let dispatchRunning = false;
const reminderTimer = setInterval(() => {
  if (dispatchRunning) return;
  dispatchRunning = true;
  void dispatchInAppReminders()
    .catch((error) => logger.error({ err: error }, "In-app reminder dispatch failed"))
    .finally(() => { dispatchRunning = false; });
}, 30_000);
dispatchRunning = true;
void dispatchInAppReminders()
  .catch((error) => logger.error({ err: error }, "Initial in-app reminder dispatch failed"))
  .finally(() => { dispatchRunning = false; });

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(reminderTimer);
  logger.info({ signal }, "Stopping background worker");
  while (dispatchRunning) await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  await boss.stop();
  await pool.end();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
