import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@unidash/db/client";
import { attendanceSummary, subjects } from "@unidash/db/schema";
import { getAppSession } from "../../../../../lib/session";
import { logger } from "../../../../../lib/logger";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return Response.json({ error: { code: "AUTH_REQUIRED", message: "Sign in to continue.", requestId } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const items = await db.select({
      subjectId: attendanceSummary.subjectId, subjectCode: subjects.code, subjectName: subjects.name,
      attended: attendanceSummary.attended, total: attendanceSummary.total,
      percentage: attendanceSummary.percentage, asOf: attendanceSummary.asOf, source: attendanceSummary.source,
    }).from(attendanceSummary)
      .innerJoin(subjects, eq(attendanceSummary.subjectId, subjects.id))
      .where(eq(attendanceSummary.userId, session.user.id)).orderBy(asc(subjects.name));
    return Response.json({ items: items.map((item) => ({ ...item, asOf: item.asOf.toISOString() })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to load attendance summary");
    return Response.json({ error: { code: "INTERNAL", message: "Could not load attendance.", requestId } }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
