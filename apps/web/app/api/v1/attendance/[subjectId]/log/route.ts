import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { attendanceLog, subjects } from "@unidash/db/schema";
import { getAppSession } from "../../../../../../lib/session";
import { logger } from "../../../../../../lib/logger";

const paramsSchema = z.object({ subjectId: z.uuid() }).strict();
const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ subjectId: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return Response.json({ error: { code: "AUTH_REQUIRED", message: "Sign in to continue.", requestId } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const params = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!params.success || !query.success) return Response.json({ error: { code: "VALIDATION_FAILED", message: "Check the subject ID and filters.", requestId } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const [subject] = await db.select({ id: subjects.id }).from(subjects).where(and(eq(subjects.id, params.data.subjectId), eq(subjects.userId, session.user.id))).limit(1);
    if (!subject) return Response.json({ error: { code: "NOT_FOUND", message: "Subject was not found.", requestId } }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const items = await db.select({ id: attendanceLog.id, classDate: attendanceLog.classDate, slot: attendanceLog.slot, status: attendanceLog.status })
      .from(attendanceLog).where(and(eq(attendanceLog.subjectId, subject.id), eq(attendanceLog.userId, session.user.id)))
      .orderBy(desc(attendanceLog.classDate), desc(attendanceLog.slot)).limit(query.data.limit);
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to load attendance log");
    return Response.json({ error: { code: "INTERNAL", message: "Could not load attendance log.", requestId } }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
