import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { eventHistory, events, reminders } from "@unidash/db/schema";
import { getAppSession } from "../../../../../../lib/session";
import { hasValidCsrf } from "../../../../../../lib/csrf";
import { buildDefaultReminders } from "../../../../../../lib/reminder-defaults";

export const dynamic = "force-dynamic";
const rowSchema = z.object({
  sourceRef: z.string().regex(/^moodle:event:\d+$/).max(120), title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable(), kind: z.enum(["QUIZ", "ASSIGNMENT"]),
  startsAt: z.iso.datetime(), subjectCode: z.string().max(100).nullable().default(null),
}).strict();
const schema = z.object({ trusted: z.literal(true), records: z.array(rowSchema).max(100) }).strict()
  .refine((value) => new Set(value.records.map((row) => row.sourceRef)).size === value.records.length);
function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to import Moodle scan records.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const raw = await request.text().catch(() => "");
  if (raw.length > 96_000) return error(413, "PAYLOAD_TOO_LARGE", "The Moodle scan is too large.", requestId);
  let input: z.infer<typeof schema>;
  try { input = schema.parse(JSON.parse(raw)); }
  catch { return error(400, "INVALID_INPUT", "Only a complete, trusted Moodle extension scan can be imported.", requestId); }
  try {
    const result = await db.transaction(async (tx) => {
      let created = 0; let updated = 0; let unchanged = 0;
      for (const record of input.records) {
        const startsAt = new Date(record.startsAt);
        if (startsAt <= new Date()) continue;
        const [existing] = await tx.select().from(events).where(and(eq(events.userId, session.user.id), eq(events.source, "MOODLE"), eq(events.sourceRef, record.sourceRef))).for("update").limit(1);
        if (!existing) {
          const [row] = await tx.insert(events).values({ userId: session.user.id, label: "Moodle deadline", title: record.title,
            description: record.description, kind: record.kind, subjectCode: record.subjectCode, source: "MOODLE", sourceRef: record.sourceRef,
            naturalKey: record.sourceRef, status: "CONFIRMED", startsAt, isDeadline: true, isAllDay: false,
            progress: "NOT_STARTED", submissionState: "UNKNOWN", origin: "SOURCE", confidence: 90,
          }).onConflictDoNothing({ target: [events.userId, events.source, events.sourceRef] }).returning({ id: events.id });
          if (!row) continue;
          const defaults = buildDefaultReminders(record.kind, startsAt, null);
          if (defaults.length) await tx.insert(reminders).values(defaults.map((reminder) => ({ userId: session.user.id, eventId: row.id, remindAt: reminder.remindAt, offsetLabel: reminder.offsetLabel, channel: "IN_APP", state: "PENDING", isDefault: true })));
          created++; continue;
        }
        if (existing.deletedAt) continue;
        const locked = new Set(Array.isArray(existing.lockedFields) ? existing.lockedFields.filter((field): field is string => typeof field === "string") : []);
        const changes: { field: string; before: unknown; after: unknown }[] = [];
        const values = { title: record.title, description: record.description, kind: record.kind, subjectCode: record.subjectCode, startsAt };
        const update: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(values)) {
          if (locked.has(field)) continue;
          const oldValue = existing[field as keyof typeof existing];
          const before = oldValue instanceof Date ? oldValue.toISOString() : oldValue;
          const after = value instanceof Date ? value.toISOString() : value;
          if (JSON.stringify(before) !== JSON.stringify(after)) { update[field] = value; changes.push({ field, before, after }); }
        }
        if (!changes.length) { unchanged++; continue; }
        update.updatedAt = new Date();
        await tx.update(events).set(update).where(and(eq(events.id, existing.id), eq(events.userId, session.user.id), eq(events.source, "MOODLE")));
        await tx.insert(eventHistory).values(changes.map((change) => ({ eventId: existing.id, source: "MOODLE", field: change.field, oldValue: change.before, newValue: change.after, summary: `Moodle updated ${change.field}` })));
        if (changes.some((change) => change.field === "startsAt")) {
          await tx.update(reminders).set({ state: "CANCELLED" }).where(and(eq(reminders.userId, session.user.id), eq(reminders.eventId, existing.id), eq(reminders.state, "PENDING")));
          const defaults = buildDefaultReminders(record.kind, startsAt, null);
          if (defaults.length) await tx.insert(reminders).values(defaults.map((reminder) => ({ userId: session.user.id, eventId: existing.id, remindAt: reminder.remindAt, offsetLabel: reminder.offsetLabel, channel: "IN_APP", state: "PENDING", isDefault: true })));
        }
        updated++;
      }
      return { created, updated, unchanged };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch { return error(500, "MOODLE_IMPORT_FAILED", "Could not save Moodle deadlines from this scan.", requestId); }
}
