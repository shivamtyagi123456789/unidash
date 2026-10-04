import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { terms } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../lib/csrf";
import { getAppSession } from "../../../../lib/session";
import { logger } from "../../../../lib/logger";

const bodySchema = z.object({
  label: z.string().trim().min(1).max(100),
  startsOn: z.iso.date().nullable().optional(),
  endsOn: z.iso.date().nullable().optional(),
  isCurrent: z.boolean().optional(),
}).strict().refine((v) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn, { path: ["endsOn"], message: "End date must be on or after start date." });

export const dynamic = "force-dynamic";
function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to continue.", requestId);
  try {
    const items = await db.select().from(terms).where(eq(terms.userId, session.user.id)).orderBy(asc(terms.startsOn));
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to list terms");
    return error(500, "INTERNAL", "Could not load terms.", requestId);
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
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_FAILED", message: "Check the term details.", details: parsed.error.issues, requestId } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const item = await db.transaction(async (tx) => {
      if (parsed.data.isCurrent) await tx.update(terms).set({ isCurrent: false }).where(eq(terms.userId, session.user.id));
      const [created] = await tx.insert(terms).values({ ...parsed.data, userId: session.user.id }).returning();
      return created;
    });
    return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ requestId, err }, "Failed to create term");
    return error(500, "INTERNAL", "Could not save the term.", requestId);
  }
}
