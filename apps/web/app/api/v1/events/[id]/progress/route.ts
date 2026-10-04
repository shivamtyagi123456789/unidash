import { and, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { eventHistory, events, reminders } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../../lib/csrf";
import { logger } from "../../../../../../lib/logger";
import { getAppSession } from "../../../../../../lib/session";

const paramsSchema = z.object({ id: z.uuid() }).strict();
const bodySchema = z.object({ progress: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "SKIPPED"]) }).strict();
const ifMatchSchema = z.iso.datetime();

export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string, requestId: string, details?: unknown) {
  return Response.json({ error: { code, message, ...(details ? { details } : {}), requestId } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const current = await getAppSession(request.headers);
  if (!current) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return jsonError(403, "FORBIDDEN", "The request could not be verified.", requestId);

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return jsonError(400, "VALIDATION_FAILED", "The event ID is invalid.", requestId);

  const matchHeader = request.headers.get("if-match");
  const match = matchHeader ? ifMatchSchema.safeParse(matchHeader.replace(/^"|"$/g, "")) : null;
  if (!match?.success) {
    return jsonError(400, "VALIDATION_FAILED", "Send the event updatedAt value in If-Match.", requestId);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonError(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId);
  }
  const body = bodySchema.safeParse(input);
  if (!body.success) return jsonError(400, "VALIDATION_FAILED", "Check the progress value and try again.", requestId, body.error.issues);

  try {
    return await db.transaction(async (tx) => {
    const scope = and(
      eq(events.id, params.data.id),
      eq(events.userId, current.user.id),
      isNull(events.deletedAt),
    );
    const [existing] = await tx.select({ updatedAt: events.updatedAt, progress: events.progress }).from(events).where(scope).for("update").limit(1);
    if (!existing) return jsonError(404, "NOT_FOUND", "Event was not found.", requestId);
    if (existing.updatedAt.toISOString() !== match.data) {
      return jsonError(409, "CONFLICT", "This event changed elsewhere. Refresh and try again.", requestId);
    }

    const updatedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));
    const [updated] = await tx.update(events)
      .set({ progress: body.data.progress, updatedAt })
      .where(and(scope, eq(events.updatedAt, existing.updatedAt)))
      .returning({ progress: events.progress, updatedAt: events.updatedAt });
    if (!updated) return jsonError(409, "CONFLICT", "This event changed elsewhere. Refresh and try again.", requestId);
    if (body.data.progress === "DONE" || body.data.progress === "SKIPPED") {
      await tx.update(reminders).set({ state: "SKIPPED", snoozedUntil: null })
        .where(and(eq(reminders.eventId, params.data.id), eq(reminders.userId, current.user.id),
          inArray(reminders.state, ["PENDING", "SNOOZED"])));
    }
    if (existing.progress !== updated.progress) {
      await tx.insert(eventHistory).values({
        eventId: params.data.id, changedAt: updated.updatedAt, source: "MANUAL", field: "progress",
        oldValue: existing.progress, newValue: updated.progress, summary: "Progress updated manually",
      });
    }

    return Response.json({
      progress: updated.progress,
      updatedAt: updated.updatedAt.toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) {
    logger.error({ requestId, err: error }, "Failed to update event progress");
    return jsonError(500, "INTERNAL", "Could not update event progress.", requestId);
  }
}
