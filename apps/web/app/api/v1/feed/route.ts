import { and, desc, eq, isNotNull, isNull, lt, or, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { feedItems } from "@unidash/db/schema";
import { getAppSession } from "../../../../lib/session";
import { logger } from "../../../../lib/logger";

const feedKind = z.enum([
  "ATTENDANCE_CHANGED", "ATTENDANCE_RISK", "GRADE_POSTED", "GRADE_CHANGED", "NOTICE_POSTED",
  "EXAM_SCHEDULED", "EXAM_RESCHEDULED", "EXAM_CANCELLED", "EXAM_CLASH", "ASSIGNMENT_POSTED",
  "ASSIGNMENT_DUE_CHANGED", "QUIZ_POSTED", "QUIZ_WINDOW_CHANGED", "SUBMISSION_STATUS_CHANGED",
  "RESOURCE_ADDED", "RESOURCE_UPDATED", "FORUM_ANNOUNCEMENT", "TIMETABLE_CHANGED", "CLASS_CANCELLED",
  "FEE_DUE", "WA_TRACKED_MESSAGE", "WA_KEYWORD_ALERT", "WA_FILE_SHARED", "EVENT_PROPOSED", "REMINDER",
  "DIGEST", "CRUNCH_WARNING", "INTEGRATION_ATTENTION", "INITIAL_IMPORT",
]);
const source = z.enum(["AMS", "MOODLE", "WHATSAPP", "SYSTEM"]);
const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() }).strict();
const querySchema = z.object({
  source: source.optional(),
  kind: feedKind.optional(),
  subject: z.uuid().optional(),
  unread: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  pinned: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
}).strict();

export const dynamic = "force-dynamic";

function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

function decodeCursor(encoded: string | undefined) {
  if (!encoded) return null;
  try {
    const result: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return cursorSchema.parse(result);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const current = await getAppSession(request.headers);
  if (!current) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return error(400, "VALIDATION_FAILED", "Feed filters are invalid.", requestId);
  const cursor = decodeCursor(parsed.data.cursor);
  if (parsed.data.cursor && !cursor) return error(400, "VALIDATION_FAILED", "Feed cursor is invalid.", requestId);

  try {
    const conditions: SQL[] = [eq(feedItems.userId, current.user.id), isNull(feedItems.archivedAt)];
    if (parsed.data.source) conditions.push(eq(feedItems.source, parsed.data.source));
    if (parsed.data.kind) conditions.push(eq(feedItems.kind, parsed.data.kind));
    if (parsed.data.subject) conditions.push(eq(feedItems.subjectId, parsed.data.subject));
    if (parsed.data.unread === true) conditions.push(isNull(feedItems.readAt));
    if (parsed.data.unread === false) conditions.push(isNotNull(feedItems.readAt));
    if (parsed.data.pinned === true) conditions.push(isNotNull(feedItems.pinnedAt));
    if (parsed.data.pinned === false) conditions.push(isNull(feedItems.pinnedAt));
    if (cursor) {
      const at = new Date(cursor.createdAt);
      conditions.push(or(lt(feedItems.createdAt, at), and(eq(feedItems.createdAt, at), lt(feedItems.id, cursor.id)))!);
    }
    const rows = await db.select().from(feedItems).where(and(...conditions))
      .orderBy(desc(feedItems.createdAt), desc(feedItems.id)).limit(parsed.data.limit + 1);
    const hasMore = rows.length > parsed.data.limit;
    const page = rows.slice(0, parsed.data.limit);
    const last = page.at(-1);
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url")
      : null;
    return Response.json({ items: page, nextCursor }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    logger.error({ requestId }, "Failed to read feed");
    return error(500, "INTERNAL", "Could not load the feed.", requestId);
  }
}
