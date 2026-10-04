import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { eventHistory, eventSources, events, reminders, storedFiles, tasks } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../lib/csrf";
import { logger } from "../../../../../lib/logger";
import { getAppSession } from "../../../../../lib/session";
import { buildDefaultReminders } from "../../../../../lib/reminder-defaults";

const eventKind = z.enum([
  "CLASS", "LAB_SESSION", "ASSIGNMENT", "QUIZ", "MINOR_EXAM", "MAJOR_EXAM", "PRACTICAL_EXAM", "VIVA",
  "PRESENTATION", "PROJECT_MILESTONE", "LAB_FILE_SUBMISSION", "HOLIDAY", "FEE_DUE", "NOTICE_DEADLINE",
  "PERSONAL", "OTHER",
]);
const paramsSchema = z.object({ id: z.uuid() }).strict();
const patchSchema = z.object({
  label: z.string().trim().min(1).max(80).nullable(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable(),
  kind: eventKind,
  subjectCode: z.string().trim().min(1).max(100).nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  isDeadline: z.boolean(),
  isAllDay: z.boolean(),
  venue: z.string().trim().max(200).nullable(),
  syllabus: z.string().trim().max(2000).nullable(),
  weightagePct: z.number().min(0).max(100).nullable(),
  maxMarks: z.number().positive().max(100000).nullable(),
}).partial().strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one event field to update.");
const ifMatchSchema = z.iso.datetime();

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const current = await getAppSession(request.headers);
  if (!current) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return jsonError(400, "VALIDATION_FAILED", "The event ID is invalid.", requestId);

  try {
    const [event] = await db.select().from(events).where(and(
      eq(events.id, params.data.id), eq(events.userId, current.user.id), isNull(events.deletedAt),
    )).limit(1);
    if (!event) return jsonError(404, "NOT_FOUND", "Event was not found.", requestId);
    const history = await db.select({
      id: eventHistory.id,
      changedAt: eventHistory.changedAt,
      source: eventHistory.source,
      field: eventHistory.field,
      oldValue: eventHistory.oldValue,
      newValue: eventHistory.newValue,
      summary: eventHistory.summary,
    }).from(eventHistory)
      .where(eq(eventHistory.eventId, event.id))
      .orderBy(desc(eventHistory.changedAt), desc(eventHistory.id))
      .limit(100);
    const [sourceRows, reminderRows, taskRows, fileRows] = await Promise.all([
      db.select({ source: eventSources.source, sourceRef: eventSources.sourceRef, firstSeenAt: eventSources.firstSeenAt, lastSeenAt: eventSources.lastSeenAt })
        .from(eventSources).where(eq(eventSources.eventId, event.id)),
      db.select({ id: reminders.id, remindAt: reminders.remindAt, offsetLabel: reminders.offsetLabel, channel: reminders.channel,
        state: reminders.state, isDefault: reminders.isDefault, snoozedUntil: reminders.snoozedUntil, sentAt: reminders.sentAt })
        .from(reminders).where(and(eq(reminders.eventId, event.id), eq(reminders.userId, current.user.id))),
      db.select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt, doneAt: tasks.doneAt, sortOrder: tasks.sortOrder })
        .from(tasks).where(and(eq(tasks.parentId, event.id), eq(tasks.parentType, "EVENT"), eq(tasks.userId, current.user.id))),
      db.select({ id: storedFiles.id, name: storedFiles.name, mimeType: storedFiles.mimeType, sizeBytes: storedFiles.sizeBytes, kind: storedFiles.kind, createdAt: storedFiles.createdAt })
        .from(storedFiles).where(and(eq(storedFiles.eventId, event.id), eq(storedFiles.userId, current.user.id), isNull(storedFiles.deletedAt))),
    ]);

    return Response.json({ item: {
      id: event.id, label: event.label, title: event.title, description: event.description,
      kind: event.kind, subjectCode: event.subjectCode, source: event.source, sourceRef: event.sourceRef,
      status: event.status, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt?.toISOString() ?? null,
      isDeadline: event.isDeadline, isAllDay: event.isAllDay, venue: event.venue, syllabus: event.syllabus,
      weightagePct: event.weightagePct, maxMarks: event.maxMarks, progress: event.progress,
      submissionState: event.submissionState, origin: event.origin, confidence: event.confidence,
      hiddenAt: event.hiddenAt?.toISOString() ?? null, updatedAt: event.updatedAt.toISOString(),
      lockedFields: event.lockedFields,
      sources: sourceRows.length ? sourceRows.map((source) => ({ ...source,
        firstSeenAt: source.firstSeenAt.toISOString(), lastSeenAt: source.lastSeenAt.toISOString(),
      })) : event.sourceRef ? [{ source: event.source, sourceRef: event.sourceRef }] : [],
      history: history.map((change) => ({ ...change, changedAt: change.changedAt.toISOString() })),
      reminders: reminderRows.map((reminder) => ({ ...reminder,
        remindAt: reminder.remindAt.toISOString(), snoozedUntil: reminder.snoozedUntil?.toISOString() ?? null,
        sentAt: reminder.sentAt?.toISOString() ?? null,
      })),
      tasks: taskRows.map((task) => ({ ...task, dueAt: task.dueAt?.toISOString() ?? null, doneAt: task.doneAt?.toISOString() ?? null })),
      files: fileRows.map((file) => ({ ...file, downloadUrl: "/api/v1/storage/files/" + file.id, createdAt: file.createdAt.toISOString() })),
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ requestId, err: error }, "Failed to load event details");
    return jsonError(500, "INTERNAL", "Could not load event details.", requestId);
  }
}

function jsonError(status: number, code: string, message: string, requestId: string, details?: unknown) {
  return Response.json({ error: { code, message, ...(details ? { details } : {}), requestId } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const current = await getAppSession(request.headers);
  if (!current) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return jsonError(403, "FORBIDDEN", "The request could not be verified.", requestId);

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return jsonError(400, "VALIDATION_FAILED", "The event ID is invalid.", requestId);
  const header = request.headers.get("if-match");
  const match = header ? ifMatchSchema.safeParse(header.replace(/^"|"$/g, "")) : null;
  if (!match?.success) return jsonError(400, "VALIDATION_FAILED", "Send the event updatedAt value in If-Match.", requestId);

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonError(400, "VALIDATION_FAILED", "Request body must be readable JSON.", requestId);
  }
  if (raw.length > 16_384) return jsonError(413, "PAYLOAD_TOO_LARGE", "Event details are too large.", requestId);
  let input: unknown;
  try { input = JSON.parse(raw); } catch {
    return jsonError(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId);
  }
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) return jsonError(400, "VALIDATION_FAILED", "Check the event details and try again.", requestId, parsed.error.issues);

  try {
    return await db.transaction(async (tx) => {
    const scope = and(eq(events.id, params.data.id), eq(events.userId, current.user.id), isNull(events.deletedAt));
    const [existing] = await tx.select().from(events).where(scope).for("update").limit(1);
    if (!existing) return jsonError(404, "NOT_FOUND", "Event was not found.", requestId);
    if (existing.updatedAt.toISOString() !== match.data) {
      return jsonError(409, "CONFLICT", "This event changed elsewhere. Refresh and try again.", requestId);
    }

    const nextStartsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : existing.startsAt;
    const nextEndsAt = Object.hasOwn(parsed.data, "endsAt")
      ? parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
      : existing.endsAt;
    if (nextEndsAt && nextEndsAt < nextStartsAt) {
      return jsonError(400, "VALIDATION_FAILED", "End time must be on or after start time.", requestId);
    }
    const eventTimeChanged = nextStartsAt.getTime() !== existing.startsAt.getTime()
      || (nextEndsAt?.getTime() ?? null) !== (existing.endsAt?.getTime() ?? null);
    const reminderScheduleChanged = eventTimeChanged
      || (parsed.data.kind !== undefined && parsed.data.kind !== existing.kind)
      || (parsed.data.weightagePct !== undefined && parsed.data.weightagePct !== existing.weightagePct);

    const previousLocks = existing.lockedFields;
    if (!Array.isArray(previousLocks) || previousLocks.some((field) => typeof field !== "string")) {
      throw new Error("EVENT_LOCKED_FIELDS_INVALID");
    }
    const editedFields = Object.keys(parsed.data);
    const lockedFields = [...new Set([...previousLocks, ...editedFields])];
    const updatedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));
    const values: Partial<typeof events.$inferInsert> = { lockedFields, updatedAt };
    for (const key of editedFields) {
      switch (key) {
        case "label": values.label = parsed.data.label; break;
        case "title": values.title = parsed.data.title; break;
        case "description": values.description = parsed.data.description; break;
        case "kind": values.kind = parsed.data.kind; break;
        case "subjectCode": values.subjectCode = parsed.data.subjectCode; break;
        case "startsAt": values.startsAt = new Date(parsed.data.startsAt!); break;
        case "endsAt": values.endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null; break;
        case "isDeadline": values.isDeadline = parsed.data.isDeadline; break;
        case "isAllDay": values.isAllDay = parsed.data.isAllDay; break;
        case "venue": values.venue = parsed.data.venue; break;
        case "syllabus": values.syllabus = parsed.data.syllabus; break;
        case "weightagePct": values.weightagePct = parsed.data.weightagePct; break;
        case "maxMarks": values.maxMarks = parsed.data.maxMarks; break;
      }
    }

    const [updated] = await tx.update(events).set(values)
      .where(and(scope, eq(events.updatedAt, existing.updatedAt)))
      .returning({
        id: events.id, label: events.label, title: events.title, description: events.description,
        kind: events.kind, subjectCode: events.subjectCode, source: events.source, sourceRef: events.sourceRef,
        status: events.status, startsAt: events.startsAt, endsAt: events.endsAt,
        isDeadline: events.isDeadline, isAllDay: events.isAllDay, venue: events.venue, syllabus: events.syllabus,
        weightagePct: events.weightagePct, maxMarks: events.maxMarks, progress: events.progress,
        submissionState: events.submissionState, origin: events.origin, confidence: events.confidence,
        updatedAt: events.updatedAt, lockedFields: events.lockedFields, hiddenAt: events.hiddenAt,
      });
    if (!updated) return jsonError(409, "CONFLICT", "This event changed elsewhere. Refresh and try again.", requestId);

    const previousValues: Record<string, unknown> = {
      label: existing.label, title: existing.title, description: existing.description, kind: existing.kind,
      subjectCode: existing.subjectCode, startsAt: existing.startsAt.toISOString(),
      endsAt: existing.endsAt?.toISOString() ?? null, isDeadline: existing.isDeadline,
      isAllDay: existing.isAllDay, venue: existing.venue, syllabus: existing.syllabus,
      weightagePct: existing.weightagePct, maxMarks: existing.maxMarks,
    };
    const nextValues: Record<string, unknown> = {
      ...parsed.data,
      ...(parsed.data.startsAt ? { startsAt: new Date(parsed.data.startsAt).toISOString() } : {}),
      ...(Object.hasOwn(parsed.data, "endsAt") ? { endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt).toISOString() : null } : {}),
    };
    await tx.insert(eventHistory).values(editedFields.map((field) => ({
      eventId: updated.id, source: "MANUAL", field,
      oldValue: previousValues[field] ?? null,
      newValue: nextValues[field] ?? null,
      summary: `${field} updated manually`,
      changedAt: updated.updatedAt,
    })));
    if (reminderScheduleChanged) {
      // Rebuild generated defaults as a set. The related dispatch log cascades away;
      // prior feed cards remain as history, and new schedule generations get new keys.
      await tx.delete(reminders).where(and(eq(reminders.eventId, updated.id),
        eq(reminders.userId, current.user.id), eq(reminders.isDefault, true)));
      if (eventTimeChanged) {
        await tx.update(reminders).set({ state: "CANCELLED", snoozedUntil: null })
          .where(and(eq(reminders.eventId, updated.id), eq(reminders.userId, current.user.id),
            eq(reminders.isDefault, false), inArray(reminders.state, ["PENDING", "SNOOZED"]),
            or(gte(reminders.remindAt, updated.startsAt), lte(reminders.remindAt, new Date()))));
      }
      const nextDefaults = buildDefaultReminders(updated.kind, updated.startsAt, updated.weightagePct);
      if (nextDefaults.length > 0) {
        await tx.insert(reminders).values(nextDefaults.map((reminder) => ({
          userId: current.user.id,
          eventId: updated.id,
          remindAt: reminder.remindAt,
          offsetLabel: reminder.offsetLabel,
          channel: "IN_APP",
          state: "PENDING",
          isDefault: true,
        }))).onConflictDoNothing();
      }
    }

    return Response.json({
      item: {
        ...updated,
        startsAt: updated.startsAt.toISOString(),
        endsAt: updated.endsAt?.toISOString() ?? null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) {
    logger.error({ requestId, err: error }, "Failed to update event");
    return jsonError(500, "INTERNAL", "Could not update the event.", requestId);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const current = await getAppSession(request.headers);
  if (!current) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return jsonError(403, "FORBIDDEN", "The request could not be verified.", requestId);

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return jsonError(400, "VALIDATION_FAILED", "The event ID is invalid.", requestId);
  const header = request.headers.get("if-match");
  const match = header ? ifMatchSchema.safeParse(header.replace(/^"|"$/g, "")) : null;
  if (!match?.success) return jsonError(400, "VALIDATION_FAILED", "Send the event updatedAt value in If-Match.", requestId);

  try {
    return await db.transaction(async (tx) => {
    const scope = and(eq(events.id, params.data.id), eq(events.userId, current.user.id), isNull(events.deletedAt));
    const [existing] = await tx.select({ source: events.source, updatedAt: events.updatedAt })
      .from(events).where(scope).for("update").limit(1);
    if (!existing) return jsonError(404, "NOT_FOUND", "Event was not found.", requestId);
    if (existing.source !== "MANUAL") {
      return jsonError(409, "CONFLICT", "Only manually added events can be deleted. Source events must be hidden instead.", requestId);
    }
    if (existing.updatedAt.toISOString() !== match.data) {
      return jsonError(409, "CONFLICT", "This event changed elsewhere. Refresh and try again.", requestId);
    }

    const deletedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));
    const [deleted] = await tx.update(events).set({ deletedAt, updatedAt: deletedAt })
      .where(and(scope, eq(events.source, "MANUAL"), eq(events.updatedAt, existing.updatedAt)))
      .returning({ id: events.id, deletedAt: events.deletedAt });
    if (!deleted) return jsonError(409, "CONFLICT", "This event changed elsewhere. Refresh and try again.", requestId);
    await tx.update(reminders).set({ state: "CANCELLED", snoozedUntil: null })
      .where(and(eq(reminders.eventId, deleted.id), eq(reminders.userId, current.user.id),
        inArray(reminders.state, ["PENDING", "SNOOZED"])));
    return Response.json({ id: deleted.id, deletedAt: deleted.deletedAt?.toISOString() }, {
      headers: { "Cache-Control": "no-store" },
    });
    });
  } catch (error) {
    logger.error({ requestId, err: error }, "Failed to delete manual event");
    return jsonError(500, "INTERNAL", "Could not delete the event.", requestId);
  }
}
