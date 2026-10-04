import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { events, reminders } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../../lib/csrf";
import { getAppSession } from "../../../../../../lib/session";
import { logger } from "../../../../../../lib/logger";

const paramsSchema = z.object({ id: z.uuid() }).strict();
const bodySchema = z.object({
  remindAt: z.iso.datetime(), offsetLabel: z.string().trim().max(40).nullable().optional(),
  channel: z.literal("IN_APP").default("IN_APP"),
}).strict();
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
  if (!params.success) return error(400, "VALIDATION_FAILED", "The event ID is invalid.", requestId);
  let input: unknown;
  try { input = await request.json(); } catch { return error(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId); }
  const body = bodySchema.safeParse(input);
  if (!body.success) return Response.json({ error: { code: "VALIDATION_FAILED", message: "Check the reminder details.", details: body.error.issues, requestId } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const remindAt = new Date(body.data.remindAt);
  if (remindAt <= new Date()) return error(400, "VALIDATION_FAILED", "Reminder time must be in the future.", requestId);
  try {
    return await db.transaction(async (tx) => {
    const [event] = await tx.select({ id: events.id, startsAt: events.startsAt, status: events.status, progress: events.progress }).from(events)
      .where(and(eq(events.id, params.data.id), eq(events.userId, session.user.id), isNull(events.deletedAt), isNull(events.hiddenAt))).for("update").limit(1);
    if (!event) return error(404, "NOT_FOUND", "Event was not found.", requestId);
    if (event.status === "CANCELLED" || event.progress === "DONE" || event.progress === "SKIPPED") {
      return error(409, "CONFLICT", "A reminder cannot be added to a cancelled or completed event.", requestId);
    }
    if (remindAt >= event.startsAt) return error(400, "VALIDATION_FAILED", "Reminder time must be before the event.", requestId);
    const [item] = await tx.insert(reminders).values({
      userId: session.user.id, eventId: event.id, remindAt, offsetLabel: body.data.offsetLabel ?? null,
      channel: body.data.channel, state: "PENDING", isDefault: false,
    }).onConflictDoNothing().returning();
    if (!item) return error(409, "CONFLICT", "A reminder already exists at that time for this channel.", requestId);
    return Response.json({ item: { ...item, remindAt: item.remindAt.toISOString() } }, { status: 201, headers: { "Cache-Control": "no-store" } });
    });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to create event reminder");
    return error(500, "INTERNAL", "Could not save the reminder.", requestId);
  }
}
