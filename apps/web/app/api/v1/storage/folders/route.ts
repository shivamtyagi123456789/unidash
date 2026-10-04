import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { fileFolders, storageConnections, terms, subjects } from "@unidash/db/schema";
import { getAppSession } from "../../../../../lib/session";
import { hasValidCsrf } from "../../../../../lib/csrf";
import { driveRequest } from "../../../../../lib/google-drive";

export const dynamic = "force-dynamic";
const bodySchema = z.object({ name: z.string().trim().min(1).max(120), parentId: z.uuid().nullable().optional(), termId: z.uuid().nullable().optional(), subjectId: z.uuid().nullable().optional() }).strict();
function error(status: number, code: string, message: string, requestId: string) { return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function GET(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to view folders.", requestId);
  const parentId = new URL(request.url).searchParams.get("parentId");
  if (parentId && !z.uuid().safeParse(parentId).success) return error(400, "VALIDATION_FAILED", "Parent folder ID is invalid.", requestId);
  const where = [eq(fileFolders.userId, session.user.id)];
  if (parentId) where.push(eq(fileFolders.parentId, parentId));
  else where.push(isNull(fileFolders.parentId));
  try {
    const items = await db.select({ id: fileFolders.id, parentId: fileFolders.parentId, name: fileFolders.name, subjectId: fileFolders.subjectId, termId: fileFolders.termId, createdAt: fileFolders.createdAt, updatedAt: fileFolders.updatedAt }).from(fileFolders).where(and(...where)).orderBy(asc(fileFolders.name));
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch { return error(500, "INTERNAL", "Could not load folders.", requestId); }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to create a folder.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, "VALIDATION_FAILED", "Check the folder details.", requestId);
  try {
    const { parentId, termId, subjectId } = parsed.data;
    const parent = parentId ? await db.query.fileFolders.findFirst({ where: and(eq(fileFolders.id, parentId), eq(fileFolders.userId, session.user.id)) }) : null;
    if (parentId && !parent) return error(404, "PARENT_NOT_FOUND", "Parent folder was not found.", requestId);
    if (termId && !(await db.query.terms.findFirst({ where: and(eq(terms.id, termId), eq(terms.userId, session.user.id)) }))) return error(404, "TERM_NOT_FOUND", "Term was not found.", requestId);
    if (subjectId && !(await db.query.subjects.findFirst({ where: and(eq(subjects.id, subjectId), eq(subjects.userId, session.user.id)) }))) return error(404, "SUBJECT_NOT_FOUND", "Subject was not found.", requestId);
    const connection = await db.query.storageConnections.findFirst({ where: eq(storageConnections.userId, session.user.id) });
    if (!connection || (!parent && !connection.rootFolderId)) return error(409, "DRIVE_NOT_CONNECTED", "Connect Google Drive before creating folders.", requestId);
    const response = await driveRequest(connection, "/drive/v3/files?fields=id", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: parsed.data.name, mimeType: "application/vnd.google-apps.folder", parents: [parent?.driveFolderId ?? connection.rootFolderId], appProperties: { unidashOwnerId: session.user.id } }) });
    const remote = await response.json() as { id?: string };
    if (!response.ok || !remote.id) return error(502, "DRIVE_FOLDER_FAILED", "Google Drive could not create the folder.", requestId);
    let item;
    try {
      [item] = await db.insert(fileFolders).values({ userId: session.user.id, ...parsed.data, driveFolderId: remote.id }).returning({ id: fileFolders.id, parentId: fileFolders.parentId, name: fileFolders.name, subjectId: fileFolders.subjectId, termId: fileFolders.termId, createdAt: fileFolders.createdAt });
    } catch (err) {
      try { await driveRequest(connection, "/drive/v3/files/" + encodeURIComponent(remote.id), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) }); } catch { /* best-effort cleanup for a folder not recorded in PostgreSQL */ }
      throw err;
    }
    return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return error(409, "FOLDER_CONFLICT", "Could not create this folder. A folder with this name may already exist.", requestId); }
}
