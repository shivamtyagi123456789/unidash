import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { events, tasks } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../../../lib/csrf";
import { getAppSession } from "../../../../../../../lib/session";
import { logger } from "../../../../../../../lib/logger";

const paramsSchema = z.object({ id: z.uuid(), taskId: z.uuid() }).strict();
const bodySchema = z.object({
  title: z.string().trim().min(1).max(200), dueAt: z.iso.datetime().nullable(),
  done: z.boolean(), sortOrder: z.number().int().min(-10000).max(10000),
}).partial().strict().refine((v) => Object.keys(v).length > 0, "Provide at least one task field.");
export const dynamic = "force-dynamic";
function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; taskId: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return error(400, "VALIDATION_FAILED", "The event or task ID is invalid.", requestId);
  let input: unknown;
  try { input = await request.json(); } catch { return error(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId); }
  const body = bodySchema.safeParse(input);
  if (!body.success) return Response.json({ error: { code: "VALIDATION_FAILED", message: "Check the task fields.", details: body.error.issues, requestId } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const [item] = await db.select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt, doneAt: tasks.doneAt, sortOrder: tasks.sortOrder })
      .from(tasks).innerJoin(events, and(eq(tasks.parentId, events.id), eq(tasks.parentType, "EVENT")))
      .where(and(eq(tasks.id, params.data.taskId), eq(tasks.parentId, params.data.id), eq(tasks.userId, session.user.id),
        eq(events.userId, session.user.id), isNull(events.deletedAt))).limit(1);
    if (!item) return error(404, "NOT_FOUND", "Task was not found.", requestId);
    const values: Partial<typeof tasks.$inferInsert> = {};
    if (body.data.title !== undefined) values.title = body.data.title;
    if (Object.hasOwn(body.data, "dueAt")) values.dueAt = body.data.dueAt ? new Date(body.data.dueAt) : null;
    if (body.data.done !== undefined) values.doneAt = body.data.done ? new Date() : null;
    if (body.data.sortOrder !== undefined) values.sortOrder = body.data.sortOrder;
    const [updated] = await db.update(tasks).set(values).where(and(eq(tasks.id, item.id), eq(tasks.userId, session.user.id))).returning();
    if (!updated) return error(404, "NOT_FOUND", "Task was not found.", requestId);
    return Response.json({ item: { ...updated, dueAt: updated.dueAt?.toISOString() ?? null, doneAt: updated.doneAt?.toISOString() ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to update event task");
    return error(500, "INTERNAL", "Could not update the task.", requestId);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; taskId: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return error(400, "VALIDATION_FAILED", "The event or task ID is invalid.", requestId);
  try {
    const [ownedTask] = await db.select({ id: tasks.id }).from(tasks)
      .innerJoin(events, and(eq(tasks.parentId, events.id), eq(tasks.parentType, "EVENT")))
      .where(and(eq(tasks.id, params.data.taskId), eq(tasks.parentId, params.data.id), eq(tasks.userId, session.user.id),
        eq(events.userId, session.user.id), isNull(events.deletedAt))).limit(1);
    if (!ownedTask) return error(404, "NOT_FOUND", "Task was not found.", requestId);
    const [deleted] = await db.delete(tasks).where(and(eq(tasks.id, params.data.taskId), eq(tasks.parentId, params.data.id),
      eq(tasks.parentType, "EVENT"), eq(tasks.userId, session.user.id))).returning({ id: tasks.id });
    if (!deleted) return error(404, "NOT_FOUND", "Task was not found.", requestId);
    return Response.json({ id: deleted.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to delete event task");
    return error(500, "INTERNAL", "Could not delete the task.", requestId);
  }
}
