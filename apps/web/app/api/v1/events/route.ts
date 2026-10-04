import { and, asc, eq, gt, gte, lte, or, isNotNull, isNull, type SQL } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { events, idempotencyKeys, reminders } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../lib/csrf";
import { getAppSession } from "../../../../lib/session";
import { logger } from "../../../../lib/logger";
import { buildDefaultReminders } from "../../../../lib/reminder-defaults";

const eventKind = z.enum([
  "CLASS", "LAB_SESSION", "ASSIGNMENT", "QUIZ", "MINOR_EXAM", "MAJOR_EXAM", "PRACTICAL_EXAM", "VIVA",
  "PRESENTATION", "PROJECT_MILESTONE", "LAB_FILE_SUBMISSION", "HOLIDAY", "FEE_DUE", "NOTICE_DEADLINE",
  "PERSONAL", "OTHER",
]);
const eventSource = z.enum(["AMS", "MOODLE", "WHATSAPP", "SYSTEM", "MANUAL"]);
const eventStatus = z.enum(["TENTATIVE", "CONFIRMED", "CANCELLED"]);
const progress = z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "SKIPPED"]);
const submissionState = z.enum(["UNKNOWN", "NOT_SUBMITTED", "SUBMITTED", "GRADED"]);
const origin = z.enum(["SOURCE", "INFERRED", "MANUAL"]);
const cursorSchema = z.object({ startsAt: z.iso.datetime(), id: z.uuid() }).strict();
const querySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  kind: eventKind.optional(),
  subject: z.string().trim().min(1).max(100).optional(),
  source: eventSource.optional(),
  status: eventStatus.optional(),
  visibility: z.enum(["visible", "hidden", "all"]).default("visible"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
  path: ["to"],
  message: "to must be on or after from.",
});
const eventResponseSchema = z.object({
  id: z.uuid(),
  label: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  kind: eventKind,
  subjectCode: z.string().nullable(),
  source: eventSource,
  sourceRef: z.string().nullable(),
  status: eventStatus,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  isDeadline: z.boolean(),
  isAllDay: z.boolean(),
  venue: z.string().nullable(),
  syllabus: z.string().nullable(),
  weightagePct: z.number().nullable(),
  maxMarks: z.number().nullable(),
  progress,
  submissionState,
  origin,
  confidence: z.number().int().min(0).max(100),
  hiddenAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
}).strict();
const manualEventSchema = z.object({
  label: z.string().trim().min(1).max(80).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  kind: eventKind,
  subjectCode: z.string().trim().min(1).max(100).nullable().optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable().optional(),
  isDeadline: z.boolean().default(false),
  isAllDay: z.boolean().default(false),
  venue: z.string().trim().max(200).nullable().optional(),
  syllabus: z.string().trim().max(2000).nullable().optional(),
  weightagePct: z.number().min(0).max(100).nullable().optional(),
  maxMarks: z.number().positive().max(100000).nullable().optional(),
}).strict().refine((value) => !value.endsAt || value.endsAt >= value.startsAt, {
  path: ["endsAt"], message: "End time must be on or after start time.",
});

export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string, requestId: string, details?: unknown) {
  return Response.json({ error: { code, message, ...(details ? { details } : {}), requestId } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function decodeCursor(value: string | undefined) {
  if (!value) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return cursorSchema.parse(decoded);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const current = await getAppSession(request.headers);
  if (!current) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);

  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_FAILED", "Check the event filters and try again.", requestId, parsed.error.issues);
  }
  const cursor = decodeCursor(parsed.data.cursor);
  if (parsed.data.cursor && !cursor) {
    return jsonError(400, "VALIDATION_FAILED", "The event cursor is invalid.", requestId);
  }

  const filters: SQL[] = [eq(events.userId, current.user.id), isNull(events.deletedAt)];
  if (parsed.data.from) filters.push(gte(events.startsAt, new Date(parsed.data.from)));
  if (parsed.data.to) filters.push(lte(events.startsAt, new Date(parsed.data.to)));
  if (parsed.data.kind) filters.push(eq(events.kind, parsed.data.kind));
  if (parsed.data.subject) filters.push(eq(events.subjectCode, parsed.data.subject));
  if (parsed.data.source) filters.push(eq(events.source, parsed.data.source));
  if (parsed.data.status) filters.push(eq(events.status, parsed.data.status));
  if (parsed.data.visibility === "visible") filters.push(isNull(events.hiddenAt));
  if (parsed.data.visibility === "hidden") filters.push(isNotNull(events.hiddenAt));
  if (cursor) {
    const afterCursor = or(
      gt(events.startsAt, new Date(cursor.startsAt)),
      and(eq(events.startsAt, new Date(cursor.startsAt)), gt(events.id, cursor.id)),
    );
    if (afterCursor) filters.push(afterCursor);
  }

  try {
    const rows = await db.select({
      id: events.id,
      label: events.label,
      title: events.title,
      description: events.description,
      kind: events.kind,
      subjectCode: events.subjectCode,
      source: events.source,
      sourceRef: events.sourceRef,
      status: events.status,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      isDeadline: events.isDeadline,
      isAllDay: events.isAllDay,
      venue: events.venue,
      syllabus: events.syllabus,
      weightagePct: events.weightagePct,
      maxMarks: events.maxMarks,
      progress: events.progress,
      submissionState: events.submissionState,
      origin: events.origin,
      confidence: events.confidence,
      hiddenAt: events.hiddenAt,
      updatedAt: events.updatedAt,
    }).from(events)
      .where(and(...filters))
      .orderBy(asc(events.startsAt), asc(events.id))
      .limit(parsed.data.limit + 1);

    const hasMore = rows.length > parsed.data.limit;
    const page = rows.slice(0, parsed.data.limit).map((row) => eventResponseSchema.parse({
      ...row,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      hiddenAt: row.hiddenAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));
    const last = page.at(-1);
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ startsAt: last.startsAt, id: last.id })).toString("base64url")
      : null;

    return Response.json({ items: page, nextCursor }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ requestId, err: error }, "Failed to list user events");
    return jsonError(500, "INTERNAL", "Could not load events.", requestId);
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const current = await getAppSession(request.headers);
  if (!current) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return jsonError(403, "FORBIDDEN", "The request could not be verified.", requestId);

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !/^[\w.:-]+$/.test(idempotencyKey)) {
    return jsonError(400, "VALIDATION_FAILED", "Provide a valid Idempotency-Key header.", requestId);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonError(400, "VALIDATION_FAILED", "Request body must be readable JSON.", requestId);
  }
  if (raw.length > 16_384) return jsonError(413, "PAYLOAD_TOO_LARGE", "Event details are too large.", requestId);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId);
  }
  const parsed = manualEventSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_FAILED", "Check the event details and try again.", requestId, parsed.error.issues);
  }

  const requestHash = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
  try {
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      await tx.delete(idempotencyKeys).where(and(
        eq(idempotencyKeys.userId, current.user.id),
        lte(idempotencyKeys.expiresAt, now),
      ));
      await tx.insert(idempotencyKeys).values({
        userId: current.user.id,
        key: idempotencyKey,
        requestHash,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      }).onConflictDoNothing();
      const [stored] = await tx.select().from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.userId, current.user.id), eq(idempotencyKeys.key, idempotencyKey)))
        .for("update").limit(1);
      if (!stored) throw new Error("IDEMPOTENCY_RECORD_MISSING");
      if (stored.requestHash !== requestHash) return { conflict: true as const };
      if (stored.response) return { replay: true as const, item: eventResponseSchema.parse(stored.response) };

      const [row] = await tx.insert(events).values({
        userId: current.user.id,
        label: parsed.data.label ?? null,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        kind: parsed.data.kind,
        subjectCode: parsed.data.subjectCode ?? null,
        source: "MANUAL",
        status: "CONFIRMED",
        startsAt: new Date(parsed.data.startsAt),
        endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
        isDeadline: parsed.data.isDeadline,
        isAllDay: parsed.data.isAllDay,
        venue: parsed.data.venue ?? null,
        syllabus: parsed.data.syllabus ?? null,
        weightagePct: parsed.data.weightagePct ?? null,
        maxMarks: parsed.data.maxMarks ?? null,
        progress: "NOT_STARTED",
        submissionState: "UNKNOWN",
        origin: "MANUAL",
        confidence: 100,
      }).returning();
      if (!row) throw new Error("EVENT_INSERT_FAILED");
      const defaultReminders = buildDefaultReminders(row.kind, row.startsAt, row.weightagePct, now);
      if (defaultReminders.length > 0) {
        await tx.insert(reminders).values(defaultReminders.map((reminder) => ({
          userId: current.user.id,
          eventId: row.id,
          remindAt: reminder.remindAt,
          offsetLabel: reminder.offsetLabel,
          channel: "IN_APP",
          state: "PENDING",
          isDefault: true,
        })));
      }
      const item = eventResponseSchema.parse({
        id: row.id, label: row.label, title: row.title, description: row.description,
        kind: row.kind, subjectCode: row.subjectCode, source: row.source, sourceRef: row.sourceRef,
        status: row.status, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt?.toISOString() ?? null,
        isDeadline: row.isDeadline, isAllDay: row.isAllDay, venue: row.venue, syllabus: row.syllabus,
        weightagePct: row.weightagePct, maxMarks: row.maxMarks, progress: row.progress,
        submissionState: row.submissionState, origin: row.origin, confidence: row.confidence,
        hiddenAt: row.hiddenAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      });
      await tx.update(idempotencyKeys).set({ response: item })
        .where(and(eq(idempotencyKeys.userId, current.user.id), eq(idempotencyKeys.key, idempotencyKey)));
      return { replay: false as const, item };
    });
    if (result.conflict) return jsonError(409, "CONFLICT", "This idempotency key was already used for different event details.", requestId);
    return Response.json({ item: result.item }, {
      status: result.replay ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logger.error({ requestId, err: error }, "Failed to create manual event");
    return jsonError(500, "INTERNAL", "Could not save the event.", requestId);
  }
}
