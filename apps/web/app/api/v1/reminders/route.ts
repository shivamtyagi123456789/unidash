import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@unidash/db/client";
import { events, reminders } from "@unidash/db/schema";
import { getAppSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return Response.json({ error: { code: "AUTH_REQUIRED", message: "Sign in to view reminders.", requestId } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const rows = await db.select({ id: reminders.id, eventId: reminders.eventId, remindAt: reminders.remindAt,
      offsetLabel: reminders.offsetLabel, channel: reminders.channel, state: reminders.state,
      title: events.title, startsAt: events.startsAt, kind: events.kind, source: events.source })
      .from(reminders).innerJoin(events, and(eq(reminders.eventId, events.id), eq(reminders.userId, events.userId)))
      .where(and(eq(reminders.userId, session.user.id), eq(reminders.channel, "IN_APP"), inArray(reminders.state, ["PENDING", "SNOOZED"]),
        isNull(events.deletedAt), isNull(events.hiddenAt)))
      .orderBy(asc(reminders.remindAt)).limit(200);
    return Response.json({ items: rows.map((row) => ({ ...row, remindAt: row.remindAt.toISOString(), startsAt: row.startsAt.toISOString() })) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: { code: "INTERNAL", message: "Could not load reminders.", requestId } }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
