import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { attendanceSummary, portalScans, subjects, terms } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../../lib/csrf";
import { getAppSession } from "../../../../../../lib/session";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const recordSchema = z.object({
  key: z.string().min(1).max(300),
  type: z.literal("attendance"),
  title: z.string().trim().min(1).max(200).refine((title) => !/^Course\s+\d+$/i.test(title.replace(/^\d{6,}\s*[·—-]\s*/, "").trim()), "A real AMS course name is required."),
  fields: z.object({
    Attendance: z.union([z.string(), z.number()]),
    "Classes Attended": z.union([z.string(), z.number()]),
  }).passthrough(),
}).passthrough();

const bodySchema = z.object({ scanId: z.string().min(1).max(100) }).strict();
const sectionSchema = z.object({ ok: z.boolean(), count: z.number().int().min(0), skipped: z.boolean().optional() }).passthrough();
const storedRecordSchema = z.object({
  key: z.string().min(1).max(300), type: z.string(), section: z.string(), title: z.string(),
  fields: z.record(z.string(), z.unknown()),
}).passthrough();
const storedReportSchema = z.object({
  records: z.array(storedRecordSchema).max(1000),
  sections: z.record(z.string(), sectionSchema),
  warnings: z.array(z.string()).default([]),
}).passthrough();

function error(status: number, code: string, message: string, requestId: string, details?: unknown) {
  return Response.json({ error: { code, message, ...(details ? { details } : {}), requestId } }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

function parseAttendance(record: z.infer<typeof recordSchema>) {
  const match = String(record.fields["Classes Attended"]).match(/^(\d+)\s*\/\s*(\d+)$/);
  const percentageText = String(record.fields.Attendance).replace(/%/g, "").trim();
  const percentage = Number(percentageText);
  if (!match || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
  const attended = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(attended) || !Number.isSafeInteger(total) || total < 1 || attended > total) return null;
  const calculated = attended / total * 100;
  if (Math.abs(calculated - percentage) > 1.01) return null;
  const courseKey = record.key.match(/:course:([^:]+)$/i)?.[1] ?? "";
  const code = /^\d{6,}$/.test(courseKey) ? courseKey : null;
  const name = record.title.replace(/^\d{6,}\s*[·—-]\s*/, "").trim() || record.title;
  return { code, name, attended, total, percentage: Number(calculated.toFixed(2)) };
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to import AMS attendance.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);

  let input: z.infer<typeof bodySchema>;
  try {
    const raw = await request.text();
    if (raw.length > 128_000) return error(413, "PAYLOAD_TOO_LARGE", "The AMS attendance scan is too large.", requestId);
    input = bodySchema.parse(JSON.parse(raw));
  } catch (cause) {
    const details = cause instanceof z.ZodError ? cause.issues : undefined;
    return error(400, "INVALID_INPUT", "The AMS attendance scan has invalid course records.", requestId, details);
  }

  try {
    const [scan] = await db.select({ trusted: portalScans.trusted, report: portalScans.report, finishedAt: portalScans.finishedAt }).from(portalScans).where(and(
      eq(portalScans.userId, session.user.id),
      eq(portalScans.source, "AMS"),
      eq(portalScans.scanId, input.scanId),
    )).limit(1);
    if (!scan) return error(409, "TRUSTED_SCAN_REQUIRED", "Run and save an AMS scan before importing attendance.", requestId);
    const savedReport = storedReportSchema.safeParse(scan.report);
    if (!savedReport.success) return error(409, "INVALID_SCAN_REPORT", "The saved AMS scan does not contain readable attendance records.", requestId);
    const attendanceSection = Object.entries(savedReport.data.sections).find(([name, section]) => /attendance/i.test(name) && section.ok);
    if (!attendanceSection) return error(409, "NO_ATTENDANCE_SECTION", "The AMS scan did not successfully read its attendance section. Check the extension report and scan again.", requestId);
    const rawRecords = savedReport.data.records.filter((record) => record.type === "attendance" && record.section === attendanceSection[0]);
    const parsedRecords = rawRecords.map((record) => recordSchema.safeParse(record));
    if (parsedRecords.some((parsed) => !parsed.success)) return error(409, "INVALID_ATTENDANCE_RECORD", "One or more AMS attendance rows do not contain usable course totals.", requestId);
    const records = parsedRecords.map((parsed) => parsed.success ? parsed.data : null).filter((record): record is z.infer<typeof recordSchema> => record !== null);
    if (!records.length) return error(409, "NO_ATTENDANCE_RECORDS", "The trusted AMS scan did not include course attendance. Enable Courses and attendance in the extension and scan again.", requestId);
    if (records.length !== attendanceSection[1].count) return error(409, "PARTIAL_ATTENDANCE", "The AMS attendance section was incomplete, so no course totals were saved.", requestId);
    // The attendance section has its own completeness check above. Other AMS
    // sections can make the overall scan need review without invalidating a
    // complete set of attendance totals.
    if (new Set(records.map((record) => record.key)).size !== records.length) return error(400, "DUPLICATE_COURSES", "The saved AMS scan contains duplicate courses.", requestId);
    const totals = records.map((record) => parseAttendance(record));
    if (totals.some((values) => !values)) {
      return error(400, "INVALID_ATTENDANCE", "AMS attendance totals did not match the reported percentages.", requestId);
    }

    const result = await db.transaction(async (tx) => {
      let [term] = await tx.select({ id: terms.id }).from(terms)
        .where(and(eq(terms.userId, session.user.id), eq(terms.isCurrent, true))).limit(1);
      if (!term) {
        await tx.insert(terms).values({
          userId: session.user.id,
          label: `AMS import · ${new Date().getFullYear()}`,
          isCurrent: true,
        }).onConflictDoNothing();
        [term] = await tx.select({ id: terms.id }).from(terms)
          .where(and(eq(terms.userId, session.user.id), eq(terms.isCurrent, true))).limit(1);
      }
      if (!term) throw new Error("Could not select the current term for AMS attendance.");

      let created = 0;
      let updated = 0;
      for (const values of totals) {
        if (!values) continue;
        const matchConditions = [eq(subjects.userId, session.user.id), eq(subjects.termId, term.id)];
        matchConditions.push(values.code ? eq(subjects.code, values.code) : eq(subjects.name, values.name));
        let [subject] = await tx.select({ id: subjects.id }).from(subjects)
          .where(and(...matchConditions)).limit(1);
        if (!subject) {
          [subject] = await tx.insert(subjects).values({
            userId: session.user.id,
            termId: term.id,
            code: values.code,
            name: values.name,
            kind: "THEORY",
            amsRef: values.code,
          }).returning({ id: subjects.id });
        }
        const [existing] = await tx.select({ attended: attendanceSummary.attended, total: attendanceSummary.total })
          .from(attendanceSummary).where(and(
            eq(attendanceSummary.userId, session.user.id),
            eq(attendanceSummary.subjectId, subject.id),
          )).limit(1);
        await tx.insert(attendanceSummary).values({
          userId: session.user.id,
          subjectId: subject.id,
          attended: values.attended,
          total: values.total,
          percentage: values.percentage,
          asOf: scan.finishedAt,
          source: "AMS",
        }).onConflictDoUpdate({
          target: [attendanceSummary.userId, attendanceSummary.subjectId],
          set: { attended: values.attended, total: values.total, percentage: values.percentage, asOf: scan.finishedAt, source: "AMS" },
        });
        if (!existing) created++;
        else if (existing.attended !== values.attended || existing.total !== values.total) updated++;
      }
      return { created, updated };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    logger.error({ requestId, err: cause }, "Failed to import AMS attendance");
    return error(500, "AMS_ATTENDANCE_IMPORT_FAILED", "Could not save the AMS attendance scan.", requestId);
  }
}
