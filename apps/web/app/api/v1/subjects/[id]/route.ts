import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { subjects, terms } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../lib/csrf";
import { getAppSession } from "../../../../../lib/session";
import { logger } from "../../../../../lib/logger";

const paramsSchema = z.object({ id: z.uuid() }).strict();
const patchSchema = z.object({
  termId: z.uuid(), code: z.string().trim().max(40).nullable(), name: z.string().trim().min(1).max(160),
  aliases: z.array(z.string().trim().min(1).max(80)).max(30),
  facultyName: z.string().trim().max(160).nullable(), credits: z.number().min(0).max(99).nullable(),
  kind: z.enum(["THEORY", "LAB", "ELECTIVE", "PROJECT"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(), isActive: z.boolean(),
}).partial().strict().refine((v) => Object.keys(v).length > 0, "Provide at least one subject field.");
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
  if (!params.success) return error(400, "VALIDATION_FAILED", "The subject ID is invalid.", requestId);
  const header = request.headers.get("if-match");
  const version = header ? versionSchema.safeParse(header.replace(/^"|"$/g, "")) : null;
  if (!version?.success) return error(400, "VALIDATION_FAILED", "Send the subject updatedAt value in If-Match.", requestId);
  let input: unknown;
  try { input = await request.json(); } catch { return error(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId); }
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_FAILED", message: "Check the subject fields.", details: parsed.error.issues, requestId } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const [existing] = await db.select({ updatedAt: subjects.updatedAt }).from(subjects).where(and(eq(subjects.id, params.data.id), eq(subjects.userId, session.user.id))).limit(1);
    if (!existing) return error(404, "NOT_FOUND", "Subject was not found.", requestId);
    if (existing.updatedAt.toISOString() !== version.data) return error(409, "CONFLICT", "This subject changed elsewhere. Refresh and try again.", requestId);
    if (parsed.data.termId) {
      const [term] = await db.select({ id: terms.id }).from(terms).where(and(eq(terms.id, parsed.data.termId), eq(terms.userId, session.user.id))).limit(1);
      if (!term) return error(404, "NOT_FOUND", "Term was not found.", requestId);
    }
    const updatedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));
    const [item] = await db.update(subjects).set({ ...parsed.data, updatedAt })
      .where(and(eq(subjects.id, params.data.id), eq(subjects.userId, session.user.id), eq(subjects.updatedAt, existing.updatedAt))).returning();
    if (!item) return error(409, "CONFLICT", "This subject changed elsewhere. Refresh and try again.", requestId);
    return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to update subject");
    return error(500, "INTERNAL", "Could not update the subject.", requestId);
  }
}
