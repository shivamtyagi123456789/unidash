import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { events, tasks } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../../lib/csrf";
import { getAppSession } from "../../../../../../lib/session";
import { logger } from "../../../../../../lib/logger";

const paramsSchema = z.object({ id: z.uuid() }).strict();
const bodySchema = z.object({ title: z.string().trim().min(1).max(200), dueAt: z.iso.datetime().nullable().optional(), sortOrder: z.number().int().min(-10000).max(10000).optional() }).strict();
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
  if (!body.success) return Response.json({ error: { code: "VALIDATION_FAILED", message: "Check the task details.", details: body.error.issues, requestId } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const [event] = await db.select({ id: events.id }).from(events).where(and(eq(events.id, params.data.id), eq(events.userId, session.user.id), isNull(events.deletedAt))).limit(1);
    if (!event) return error(404, "NOT_FOUND", "Event was not found.", requestId);
    const [item] = await db.insert(tasks).values({
      userId: session.user.id, parentType: "EVENT", parentId: event.id, title: body.data.title,
      dueAt: body.data.dueAt ? new Date(body.data.dueAt) : null, sortOrder: body.data.sortOrder ?? 0,
    }).returning();
    return Response.json({ item: { ...item, dueAt: item.dueAt?.toISOString() ?? null, doneAt: null } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to create event task");
    return error(500, "INTERNAL", "Could not save the task.", requestId);
  }
}
