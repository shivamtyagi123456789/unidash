import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { subjects, userSettings } from "@unidash/db/schema";
import { getAppSession } from "../../../../../../lib/session";
import { logger } from "../../../../../../lib/logger";

const paramsSchema = z.object({ subjectId: z.uuid() }).strict();
const querySchema = z.object({
  t: z.coerce.number().int().min(0).max(100_000),
  a: z.coerce.number().int().min(0).max(100_000),
  threshold: z.coerce.number().min(0).max(100).optional(),
}).strict().refine((v) => v.a <= v.t, { path: ["a"], message: "Attended classes cannot exceed total classes." });

export const dynamic = "force-dynamic";
function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, context: { params: Promise<{ subjectId: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  const params = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!params.success || !query.success) return error(400, "VALIDATION_FAILED", "Check the subject and attendance values.", requestId);
  try {
    const [subject] = await db.select({ id: subjects.id }).from(subjects)
      .where(and(eq(subjects.id, params.data.subjectId), eq(subjects.userId, session.user.id))).limit(1);
    if (!subject) return error(404, "NOT_FOUND", "Subject was not found.", requestId);
    const [settings] = await db.select({ threshold: userSettings.attendanceThreshold })
      .from(userSettings).where(eq(userSettings.userId, session.user.id)).limit(1);
    const threshold = query.data.threshold ?? settings?.threshold ?? 75;
    const { t: total, a: attended } = query.data;
    const percentage = total === 0 ? 100 : (attended / total) * 100;
    const canSkip = threshold === 0
      ? null
      : Math.max(0, Math.floor((attended * 100 / threshold) - total + Number.EPSILON));
    const mustAttend = percentage >= threshold
      ? 0
      : threshold === 100
        ? null
        : Math.ceil((threshold * total - attended * 100) / (100 - threshold));
    return Response.json({
      subjectId: subject.id, attended, total, threshold, percentage: Number(percentage.toFixed(2)),
      canSkip, mustAttend,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to calculate attendance guidance");
    return error(500, "INTERNAL", "Could not calculate attendance guidance.", requestId);
  }
}
