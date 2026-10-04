import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { eventHistory, events, reminders } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../../lib/csrf";
import { getAppSession } from "../../../../../../lib/session";
import { buildDefaultReminders } from "../../../../../../lib/reminder-defaults";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const importRecordSchema = z.object({
  sourceRef: z.string().min(12).max(512).regex(/^ams:(?:quiz|calendar):[a-z0-9:-]+$/i),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable(),
  kind: z.enum(["QUIZ", "OTHER"]),
  subjectCode: z.string().trim().max(100).nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  isDeadline: z.boolean(),
  isAllDay: z.boolean(),
}).strict().refine((record) => !record.endsAt || record.endsAt >= record.startsAt, {
  path: ["endsAt"], message: "End time must be on or after the start time.",
});

const importSchema = z.object({
  source: z.literal("AMS"),
  trusted: z.literal(true),
  records: z.array(importRecordSchema).max(100),
}).strict().refine((body) => new Set(body.records.map((record) => record.sourceRef)).size === body.records.length, {
  path: ["records"], message: "A scan cannot contain duplicate source records.",
});

function error(status: number, code: string, message: string, requestId: string, details?: unknown) {
  return Response.json({ error: { code, message, ...(details ? { details } : {}), requestId } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function reminderRows(userId: string, eventId: string, kind: string, startsAt: Date, now: Date) {
  return buildDefaultReminders(kind, startsAt, null, now).map((reminder) => ({
    userId,
    eventId,
    remindAt: reminder.remindAt,
    offsetLabel: reminder.offsetLabel,
    channel: "IN_APP",
    state: "PENDING",
    isDefault: true,
  }));
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to import AMS calendar records.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);

  let input: z.infer<typeof importSchema>;
  try {
    const raw = await request.text();
    if (raw.length > 96_000) return error(413, "PAYLOAD_TOO_LARGE", "The AMS scan is too large.", requestId);
    input = importSchema.parse(JSON.parse(raw));
  } catch (cause) {
    const details = cause instanceof z.ZodError ? cause.issues : undefined;
    return error(400, "INVALID_INPUT", "Only a complete, valid AMS scan can be imported.", requestId, details);
  }

  try {
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      let skipped = 0;

      for (const record of input.records) {
        const startsAt = new Date(record.startsAt);
        const endsAt = record.endsAt ? new Date(record.endsAt) : null;
        const [existing] = await tx.select().from(events).where(and(
          eq(events.userId, session.user.id), eq(events.source, "AMS"), eq(events.sourceRef, record.sourceRef),
        )).for("update").limit(1);

        if (!existing) {
          const [inserted] = await tx.insert(events).values({
            userId: session.user.id,
            label: record.kind === "QUIZ" ? "AMS quiz" : "AMS calendar",
            title: record.title,
            description: record.description,
            kind: record.kind,
            subjectCode: record.subjectCode,
            source: "AMS",
            sourceRef: record.sourceRef,
            naturalKey: record.sourceRef,
            status: "CONFIRMED",
            startsAt,
            endsAt,
            isDeadline: record.isDeadline,
            isAllDay: record.isAllDay,
            progress: "NOT_STARTED",
            submissionState: "UNKNOWN",
            origin: "SOURCE",
            confidence: 90,
          }).onConflictDoNothing({ target: [events.userId, events.source, events.sourceRef] }).returning({ id: events.id });
          if (!inserted) { skipped++; continue; }
          const remindersToCreate = reminderRows(session.user.id, inserted.id, record.kind, startsAt, now);
          if (remindersToCreate.length) await tx.insert(reminders).values(remindersToCreate);
          created++;
          continue;
        }

        if (existing.deletedAt) { skipped++; continue; }
        const locked = new Set(Array.isArray(existing.lockedFields) ? existing.lockedFields.filter((field): field is string => typeof field === "string") : []);
        const nextValues = {
          title: record.title,
          description: record.description,
          kind: record.kind,
          subjectCode: record.subjectCode,
          startsAt,
          endsAt,
          isDeadline: record.isDeadline,
          isAllDay: record.isAllDay,
        };
        const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
        const set: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(nextValues)) {
          if (locked.has(field)) continue;
          const prior = existing[field as keyof typeof existing];
          const before = prior instanceof Date ? prior.toISOString() : prior;
          const after = value instanceof Date ? value.toISOString() : value;
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            set[field] = value;
            changes.push({ field, before, after });
          }
        }
        if (!changes.length) { unchanged++; continue; }
        set.updatedAt = now;
        await tx.update(events).set(set).where(and(eq(events.id, existing.id), eq(events.userId, session.user.id), eq(events.source, "AMS")));
        await tx.insert(eventHistory).values(changes.map((change) => ({
          eventId: existing.id,
          source: "AMS",
          field: change.field,
          oldValue: change.before,
          newValue: change.after,
          summary: `AMS updated ${change.field}`,
        })));
        if (changes.some((change) => change.field === "startsAt")) {
          await tx.update(reminders).set({ state: "CANCELLED" }).where(and(
            eq(reminders.userId, session.user.id), eq(reminders.eventId, existing.id), eq(reminders.state, "PENDING"),
          ));
          const remindersToCreate = reminderRows(session.user.id, existing.id, record.kind, startsAt, now);
          if (remindersToCreate.length) await tx.insert(reminders).values(remindersToCreate);
        }
        updated++;
      }
      return { created, updated, unchanged, skipped };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    logger.error({ requestId, err: cause }, "Failed to import AMS calendar records");
    return error(500, "AMS_IMPORT_FAILED", "Could not save the AMS calendar scan.", requestId);
  }
}
