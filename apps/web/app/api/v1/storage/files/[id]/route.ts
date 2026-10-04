import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { storageConnections, storedFiles } from "@unidash/db/schema";
import { getAppSession } from "../../../../../../lib/session";
import { hasValidCsrf } from "../../../../../../lib/csrf";
import { driveRequest } from "../../../../../../lib/google-drive";

export const dynamic = "force-dynamic";
function error(status: number, code: string, message: string, requestId: string) { return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to view this file.", requestId);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return error(400, "VALIDATION_FAILED", "File ID is invalid.", requestId);
  const [file] = await db.select().from(storedFiles).where(and(eq(storedFiles.id, id), eq(storedFiles.userId, session.user.id), isNull(storedFiles.deletedAt))).limit(1);
  if (!file) return error(404, "NOT_FOUND", "File was not found.", requestId);
  const [connection] = await db.select().from(storageConnections).where(eq(storageConnections.userId, session.user.id)).limit(1);
  if (!connection) return error(409, "DRIVE_NOT_CONNECTED", "Connect Google Drive to download files.", requestId);
  try {
    const response = await driveRequest(connection, "/drive/v3/files/" + encodeURIComponent(file.driveFileId) + "?alt=media", { method: "GET" });
    if (!response.ok || !response.body) return error(502, "DRIVE_DOWNLOAD_FAILED", "Google Drive could not provide this file.", requestId);
    return new Response(response.body, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.name), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch { return error(502, "DRIVE_UNAVAILABLE", "Google Drive is unavailable. Try again later.", requestId); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to delete this file.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return error(400, "VALIDATION_FAILED", "File ID is invalid.", requestId);
  const [file] = await db.select().from(storedFiles).where(and(eq(storedFiles.id, id), eq(storedFiles.userId, session.user.id), isNull(storedFiles.deletedAt))).limit(1);
  if (!file) return error(404, "NOT_FOUND", "File was not found.", requestId);
  const [connection] = await db.select().from(storageConnections).where(eq(storageConnections.userId, session.user.id)).limit(1);
  if (!connection) return error(409, "DRIVE_NOT_CONNECTED", "Reconnect Google Drive before deleting files.", requestId);
  try {
    const response = await driveRequest(connection, "/drive/v3/files/" + encodeURIComponent(file.driveFileId), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) });
    if (!response.ok && response.status !== 404) return error(502, "DRIVE_DELETE_FAILED", "Google Drive could not delete this file.", requestId);
    await db.update(storedFiles).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(storedFiles.id, id), eq(storedFiles.userId, session.user.id), isNull(storedFiles.deletedAt)));
    return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return error(502, "DRIVE_UNAVAILABLE", "Google Drive is unavailable. Try again later.", requestId); }
}
