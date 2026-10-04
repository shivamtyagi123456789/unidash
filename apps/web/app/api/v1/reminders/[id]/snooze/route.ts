import { and, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { events, reminders, userSettings } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../../lib/csrf";
import { getAppSession } from "../../../../../../lib/session";
import { logger } from "../../../../../../lib/logger";

const paramsSchema = z.object({ id: z.uuid() }).strict();
const bodySchema = z.object({
  preset: z.enum(["15m", "1h", "tomorrow_morning"]).optional(),
  until: z.iso.datetime().optional(),
}).strict().refine((v) => Number(v.preset !== undefined) + Number(v.until !== undefined) === 1,
  "Choose one snooze preset or a specific time.");

function tomorrowMorning(now: Date, timezone: string) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(dateParts.find((part) => part.type === type)?.value);
  const target = Date.UTC(get("year"), get("month") - 1, get("day") + 1, 7, 30);
  let candidate = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
    const represented = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
    candidate += target - represented;
  }
  return new Date(candidate);
}

export const dynamic = "force-dynamic";
function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return error(400, "VALIDATION_FAILED", "The reminder ID is invalid.", requestId);
  let input: unknown;
  try { input = await request.json(); } catch { return error(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId); }
  const body = bodySchema.safeParse(input);
  if (!body.success) return Response.json({ error: { code: "VALIDATION_FAILED", message: "Choose one snooze time.", details: body.error.issues, requestId } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    return await db.transaction(async (tx) => {
      const [reference] = await tx.select({ eventId: reminders.eventId }).from(reminders)
        .where(and(eq(reminders.id, params.data.id), eq(reminders.userId, session.user.id))).limit(1);
      if (!reference) return error(404, "NOT_FOUND", "Reminder was not found.", requestId);
      const [event] = await tx.select({ startsAt: events.startsAt, status: events.status, progress: events.progress })
        .from(events).where(and(eq(events.id, reference.eventId), eq(events.userId, session.user.id),
          isNull(events.deletedAt), isNull(events.hiddenAt))).for("update").limit(1);
      if (!event) return error(404, "NOT_FOUND", "Reminder was not found.", requestId);
      const [existing] = await tx.select({ id: reminders.id, remindAt: reminders.remindAt, state: reminders.state })
        .from(reminders).where(and(eq(reminders.id, params.data.id), eq(reminders.userId, session.user.id),
          eq(reminders.eventId, reference.eventId))).for("update").limit(1);
      if (!existing) return error(404, "NOT_FOUND", "Reminder was not found.", requestId);
      if (existing.state !== "PENDING" && existing.state !== "SNOOZED") return error(409, "CONFLICT", "Only pending reminders can be snoozed.", requestId);
      if (event.status === "CANCELLED" || event.progress === "DONE" || event.progress === "SKIPPED") {
        return error(409, "CONFLICT", "A reminder cannot be snoozed for a cancelled or completed event.", requestId);
      }
      const [settings] = await tx.select({ timezone: userSettings.timezone }).from(userSettings)
        .where(eq(userSettings.userId, session.user.id)).limit(1);
      const now = new Date();
      const remindAt = body.data.until ? new Date(body.data.until)
        : body.data.preset === "15m" ? new Date(now.getTime() + 15 * 60_000)
          : body.data.preset === "1h" ? new Date(now.getTime() + 60 * 60_000)
            : tomorrowMorning(now, settings?.timezone ?? "Asia/Kolkata");
      if (remindAt <= now) return error(400, "VALIDATION_FAILED", "Snooze time must be in the future.", requestId);
      if (remindAt >= event.startsAt) return error(400, "VALIDATION_FAILED", "Snooze time must be before the event.", requestId);
      const [updated] = await tx.update(reminders).set({ remindAt, snoozedUntil: remindAt, state: "PENDING" })
        .where(and(eq(reminders.id, existing.id), eq(reminders.userId, session.user.id),
          eq(reminders.remindAt, existing.remindAt), inArray(reminders.state, ["PENDING", "SNOOZED"])))
        .returning({ id: reminders.id, remindAt: reminders.remindAt, snoozedUntil: reminders.snoozedUntil, state: reminders.state });
      if (!updated) return error(409, "CONFLICT", "The reminder changed elsewhere. Refresh and try again.", requestId);
      return Response.json({ item: { ...updated, remindAt: updated.remindAt.toISOString(), snoozedUntil: updated.snoozedUntil?.toISOString() ?? null } }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
    if (code === "23505") return error(409, "CONFLICT", "A reminder already exists at that time for this channel.", requestId);
    logger.error({ requestId, err }, "Failed to snooze reminder");
    return error(500, "INTERNAL", "Could not snooze the reminder.", requestId);
  }
}
