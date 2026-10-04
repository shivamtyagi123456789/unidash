import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { reminders } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../lib/csrf";
import { getAppSession } from "../../../../../lib/session";
import { logger } from "../../../../../lib/logger";

const paramsSchema = z.object({ id: z.uuid() }).strict();
export const dynamic = "force-dynamic";
function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return error(400, "VALIDATION_FAILED", "The reminder ID is invalid.", requestId);
  try {
    const scope = and(eq(reminders.id, params.data.id), eq(reminders.userId, session.user.id));
    const [existing] = await db.select({ state: reminders.state }).from(reminders).where(scope).limit(1);
    if (!existing) return error(404, "NOT_FOUND", "Reminder was not found.", requestId);
    if (existing.state !== "PENDING" && existing.state !== "SNOOZED") return error(409, "CONFLICT", "Only pending reminders can be removed.", requestId);
    const [item] = await db.update(reminders).set({ state: "CANCELLED", snoozedUntil: null })
      .where(and(scope, inArray(reminders.state, ["PENDING", "SNOOZED"]))).returning({ id: reminders.id, state: reminders.state });
    if (!item) return error(409, "CONFLICT", "The reminder changed elsewhere. Refresh and try again.", requestId);
    return Response.json({ id: item.id, state: item.state }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to remove reminder");
    return error(500, "INTERNAL", "Could not remove the reminder.", requestId);
  }
}
