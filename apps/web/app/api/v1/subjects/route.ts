import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { subjects, terms } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../lib/csrf";
import { getAppSession } from "../../../../lib/session";
import { logger } from "../../../../lib/logger";

const querySchema = z.object({ termId: z.uuid().optional(), active: z.enum(["true", "false"]).optional() }).strict();
const bodySchema = z.object({
  termId: z.uuid(), code: z.string().trim().max(40).nullable().optional(), name: z.string().trim().min(1).max(160),
  aliases: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  facultyName: z.string().trim().max(160).nullable().optional(), credits: z.number().min(0).max(99).nullable().optional(),
  kind: z.enum(["THEORY", "LAB", "ELECTIVE", "PROJECT"]).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
}).strict();

export const dynamic = "force-dynamic";
function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  const params = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!params.success) return error(400, "VALIDATION_FAILED", "Check the subject filters.", requestId);
  try {
    const where = [eq(subjects.userId, session.user.id)];
    if (params.data.termId) where.push(eq(subjects.termId, params.data.termId));
    if (params.data.active) where.push(eq(subjects.isActive, params.data.active === "true"));
    const items = await db.select().from(subjects).where(and(...where)).orderBy(asc(subjects.name));
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to list subjects");
    return error(500, "INTERNAL", "Could not load subjects.", requestId);
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  let body: unknown;
  try { body = await request.json(); } catch { return error(400, "VALIDATION_FAILED", "Request body must be valid JSON.", requestId); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_FAILED", message: "Check the subject details.", details: parsed.error.issues, requestId } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const [term] = await db.select({ id: terms.id }).from(terms).where(and(eq(terms.id, parsed.data.termId), eq(terms.userId, session.user.id))).limit(1);
    if (!term) return error(404, "NOT_FOUND", "Term was not found.", requestId);
    const [item] = await db.insert(subjects).values({ ...parsed.data, userId: session.user.id }).returning();
    return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to create subject");
    return error(500, "INTERNAL", "Could not save the subject.", requestId);
  }
}
