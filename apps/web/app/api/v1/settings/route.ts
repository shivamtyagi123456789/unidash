import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { userSettings } from "@unidash/db/schema";
import { hasValidCsrf, issueCsrfToken } from "../../../../lib/csrf";
import { logger } from "../../../../lib/logger";
import { getAppSession } from "../../../../lib/session";

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const settingsSchema = z.object({
  timezone: z.string().min(1).max(100).refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Use a valid IANA time zone."),
  attendanceThreshold: z.number().int().min(0).max(100),
  quietHoursStart: timeSchema,
  quietHoursEnd: timeSchema,
  updatedAt: z.iso.datetime(),
}).strict();
const settingsPatchSchema = settingsSchema.omit({ updatedAt: true }).partial().strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one setting to update.");

export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string, requestId: string, details?: unknown) {
  return Response.json({ error: { code, message, ...(details ? { details } : {}), requestId } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const current = await getAppSession(request.headers);
  if (!current) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);

  try {
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, current.user.id)).limit(1);
    const responseData = settingsSchema.parse({
      timezone: row?.timezone ?? "Asia/Kolkata",
      attendanceThreshold: row?.attendanceThreshold ?? 75,
      quietHoursStart: row?.quietHoursStart ?? "23:00",
      quietHoursEnd: row?.quietHoursEnd ?? "06:30",
      updatedAt: (row?.updatedAt ?? new Date()).toISOString(),
    });
    const csrf = issueCsrfToken();
    return Response.json({ ...responseData, csrfToken: csrf.token }, {
      headers: { "Cache-Control": "no-store", "Set-Cookie": csrf.cookie },
    });
  } catch (error) {
    logger.error({ requestId, err: error }, "Failed to read user settings");
    return jsonError(500, "INTERNAL", "Could not load settings.", requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = randomUUID();
  const current = await getAppSession(request.headers);
  if (!current) return jsonError(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return jsonError(403, "FORBIDDEN", "The request could not be verified.", requestId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId);
  }

  const parsed = settingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_FAILED", "Check the settings and try again.", requestId, parsed.error.issues);
  }

  try {
    const [row] = await db.update(userSettings)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(userSettings.userId, current.user.id))
      .returning();

    if (!row) return jsonError(404, "NOT_FOUND", "Settings were not found.", requestId);

    const responseData = settingsSchema.parse({
      timezone: row.timezone,
      attendanceThreshold: row.attendanceThreshold,
      quietHoursStart: row.quietHoursStart,
      quietHoursEnd: row.quietHoursEnd,
      updatedAt: row.updatedAt.toISOString(),
    });
    return Response.json(responseData, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ requestId, err: error }, "Failed to update user settings");
    return jsonError(500, "INTERNAL", "Could not save settings.", requestId);
  }
}
