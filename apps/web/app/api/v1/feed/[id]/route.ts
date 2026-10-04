import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { feedItems } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../lib/csrf";
import { getAppSession } from "../../../../../lib/session";
import { logger } from "../../../../../lib/logger";

const paramsSchema = z.object({ id: z.uuid() }).strict();
const patchSchema = z.object({ read: z.boolean().optional(), pinned: z.boolean().optional(), archived: z.boolean().optional() })
  .strict().refine((value) => Object.keys(value).length > 0, "At least one feed state is required.");

export const dynamic = "force-dynamic";

function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const current = await getAppSession(request.headers);
  if (!current) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "Request verification failed.", requestId);

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return error(400, "VALIDATION_FAILED", "Feed item ID is invalid.", requestId);
  let body: unknown;
  try { body = await request.json(); } catch { return error(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId); }
  const patch = patchSchema.safeParse(body);
  if (!patch.success) return error(400, "VALIDATION_FAILED", "Feed state is invalid.", requestId);

  const now = new Date();
  const values = {
    ...(patch.data.read !== undefined ? { readAt: patch.data.read ? now : null } : {}),
    ...(patch.data.pinned !== undefined ? { pinnedAt: patch.data.pinned ? now : null } : {}),
    ...(patch.data.archived !== undefined ? { archivedAt: patch.data.archived ? now : null } : {}),
  };
  try {
    const [row] = await db.update(feedItems).set(values)
      .where(and(eq(feedItems.id, params.data.id), eq(feedItems.userId, current.user.id))).returning();
    if (!row) return error(404, "NOT_FOUND", "Feed item was not found.", requestId);
    return Response.json({ item: row }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    logger.error({ requestId }, "Failed to update feed item");
    return error(500, "INTERNAL", "Could not update the feed item.", requestId);
  }
}
