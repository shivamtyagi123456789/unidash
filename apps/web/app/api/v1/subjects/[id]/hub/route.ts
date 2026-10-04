import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { attendanceSummary, events, subjects, userSettings } from "@unidash/db/schema";
import { getAppSession } from "../../../../../../lib/session";
import { logger } from "../../../../../../lib/logger";

const paramsSchema = z.object({ id: z.uuid() }).strict();
export const dynamic = "force-dynamic";
function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return error(400, "VALIDATION_FAILED", "The subject ID is invalid.", requestId);
  try {
    const [subject] = await db.select({
      id: subjects.id, termId: subjects.termId, code: subjects.code, name: subjects.name,
      aliases: subjects.aliases, facultyName: subjects.facultyName, credits: subjects.credits,
      kind: subjects.kind, color: subjects.color, isActive: subjects.isActive,
    }).from(subjects).where(and(eq(subjects.id, params.data.id), eq(subjects.userId, session.user.id))).limit(1);
    if (!subject) return error(404, "NOT_FOUND", "Subject was not found.", requestId);
    const [attendance, settings, upcomingEvents] = await Promise.all([
      db.select({ attended: attendanceSummary.attended, total: attendanceSummary.total,
        percentage: attendanceSummary.percentage, asOf: attendanceSummary.asOf })
        .from(attendanceSummary).where(and(eq(attendanceSummary.userId, session.user.id), eq(attendanceSummary.subjectId, subject.id))).limit(1),
      db.select({ threshold: userSettings.attendanceThreshold }).from(userSettings).where(eq(userSettings.userId, session.user.id)).limit(1),
      subject.code ? db.select({ id: events.id, label: events.label, title: events.title, kind: events.kind,
        startsAt: events.startsAt, endsAt: events.endsAt, status: events.status, progress: events.progress,
        submissionState: events.submissionState, source: events.source, updatedAt: events.updatedAt })
        .from(events).where(and(eq(events.userId, session.user.id), eq(events.subjectCode, subject.code),
          isNull(events.deletedAt), isNull(events.hiddenAt), gt(events.startsAt, new Date())))
        .orderBy(asc(events.startsAt), asc(events.id)).limit(10)
        : Promise.resolve([]),
    ]);
    const summary = attendance[0];
    return Response.json({
      subject,
      attendance: summary ? {
        attended: summary.attended, total: summary.total, percentage: summary.percentage,
        threshold: settings[0]?.threshold ?? 75, asOf: summary.asOf.toISOString(),
      } : null,
      upcomingEvents: upcomingEvents.map((event) => ({ ...event,
        startsAt: event.startsAt.toISOString(), endsAt: event.endsAt?.toISOString() ?? null,
        updatedAt: event.updatedAt.toISOString(),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to load subject hub");
    return error(500, "INTERNAL", "Could not load the subject hub.", requestId);
  }
}
