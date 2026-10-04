import { and, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { terms } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../lib/csrf";
import { getAppSession } from "../../../../../lib/session";
import { logger } from "../../../../../lib/logger";

const paramsSchema = z.object({ id: z.uuid() }).strict();
const patchSchema = z.object({
  label: z.string().trim().min(1).max(100),
  startsOn: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
  isCurrent: z.boolean(),
}).partial().strict().refine((v) => Object.keys(v).length > 0, "Provide at least one term field.")
  .refine((v) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn, { path: ["endsOn"], message: "End date must be on or after start date." });
const versionSchema = z.iso.datetime();

export const dynamic = "force-dynamic";
function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return error(400, "VALIDATION_FAILED", "The term ID is invalid.", requestId);
  const header = request.headers.get("if-match");
  const version = header ? versionSchema.safeParse(header.replace(/^"|"$/g, "")) : null;
  if (!version?.success) return error(400, "VALIDATION_FAILED", "Send the term updatedAt value in If-Match.", requestId);
  let input: unknown;
  try { input = await request.json(); } catch { return error(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId); }
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_FAILED", message: "Check the term fields.", details: parsed.error.issues, requestId } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(terms).where(and(eq(terms.id, params.data.id), eq(terms.userId, session.user.id))).limit(1);
      if (!existing) return { kind: "missing" as const };
      if (existing.updatedAt.toISOString() !== version.data) return { kind: "stale" as const };
      const startsOn = Object.hasOwn(parsed.data, "startsOn") ? parsed.data.startsOn : existing.startsOn;
      const endsOn = Object.hasOwn(parsed.data, "endsOn") ? parsed.data.endsOn : existing.endsOn;
      if (startsOn && endsOn && startsOn > endsOn) return { kind: "invalid_dates" as const };
      const updatedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));
      if (parsed.data.isCurrent) {
        await tx.update(terms).set({ isCurrent: false, updatedAt })
          .where(and(eq(terms.userId, session.user.id), eq(terms.isCurrent, true), ne(terms.id, params.data.id)));
      }
      const [item] = await tx.update(terms).set({ ...parsed.data, updatedAt })
        .where(and(eq(terms.id, params.data.id), eq(terms.userId, session.user.id), eq(terms.updatedAt, existing.updatedAt))).returning();
      return item ? { kind: "ok" as const, item } : { kind: "stale" as const };
    });
    if (result.kind === "missing") return error(404, "NOT_FOUND", "Term was not found.", requestId);
    if (result.kind === "stale") return error(409, "CONFLICT", "This term changed elsewhere. Refresh and try again.", requestId);
    if (result.kind === "invalid_dates") return error(400, "VALIDATION_FAILED", "End date must be on or after start date.", requestId);
    return Response.json({ item: result.item }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to update term");
    return error(500, "INTERNAL", "Could not update the term.", requestId);
  }
}
