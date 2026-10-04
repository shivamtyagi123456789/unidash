import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { eventHistory, events } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../../lib/csrf";
import { logger } from "../../../../../../lib/logger";
import { getAppSession } from "../../../../../../lib/session";

const paramsSchema = z.object({ id: z.uuid() }).strict();
const bodySchema = z.object({ hidden: z.boolean() }).strict();
const ifMatchSchema = z.iso.datetime();

export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, {
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
  const header = request.headers.get("if-match");
  const match = header ? ifMatchSchema.safeParse(header.replace(/^"|"$/g, "")) : null;
  if (!match?.success) return jsonError(400, "VALIDATION_FAILED", "Send the event updatedAt value in If-Match.", requestId);

  let body: unknown;
  try { body = await request.json(); } catch {
    return jsonError(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "VALIDATION_FAILED", "Set hidden to true or false.", requestId);

  try {
    return await db.transaction(async (tx) => {
    const scope = and(eq(events.id, params.data.id), eq(events.userId, current.user.id), isNull(events.deletedAt));
    const [existing] = await tx.select({
      source: events.source,
      hiddenAt: events.hiddenAt,
      updatedAt: events.updatedAt,
    }).from(events).where(scope).for("update").limit(1);
    if (!existing) return jsonError(404, "NOT_FOUND", "Event was not found.", requestId);
    if (existing.source === "MANUAL") {
      return jsonError(409, "CONFLICT", "Manual events are deleted from their event details; only source events can be hidden.", requestId);
    }
    if (existing.updatedAt.toISOString() !== match.data) {
      return jsonError(409, "CONFLICT", "This event changed elsewhere. Refresh and try again.", requestId);
    }

    if (Boolean(existing.hiddenAt) === parsed.data.hidden) {
      return Response.json({ hidden: parsed.data.hidden, hiddenAt: existing.hiddenAt?.toISOString() ?? null, updatedAt: existing.updatedAt.toISOString() }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const updatedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));
    const hiddenAt = parsed.data.hidden ? updatedAt : null;
    const [updated] = await tx.update(events).set({ hiddenAt, updatedAt })
      .where(and(scope, eq(events.updatedAt, existing.updatedAt)))
      .returning({ hiddenAt: events.hiddenAt, updatedAt: events.updatedAt });
    if (!updated) return jsonError(409, "CONFLICT", "This event changed elsewhere. Refresh and try again.", requestId);
    await tx.insert(eventHistory).values({
      eventId: params.data.id, changedAt: updated.updatedAt, source: "MANUAL", field: "hiddenAt",
      oldValue: existing.hiddenAt?.toISOString() ?? null,
      newValue: updated.hiddenAt?.toISOString() ?? null,
      summary: parsed.data.hidden ? "Event hidden" : "Event restored",
    });
    return Response.json({
      hidden: Boolean(updated.hiddenAt),
      hiddenAt: updated.hiddenAt?.toISOString() ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) {
    logger.error({ requestId, err: error }, "Failed to update event visibility");
    return jsonError(500, "INTERNAL", "Could not update event visibility.", requestId);
  }
}
