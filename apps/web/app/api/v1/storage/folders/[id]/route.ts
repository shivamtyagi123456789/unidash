import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { fileFolders, storageConnections, storedFiles } from "@unidash/db/schema";
import { getAppSession } from "../../../../../../lib/session";
import { hasValidCsrf } from "../../../../../../lib/csrf";
import { driveRequest } from "../../../../../../lib/google-drive";

export const dynamic = "force-dynamic";
function error(status: number, code: string, message: string, requestId: string) { return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to delete this folder.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return error(400, "VALIDATION_FAILED", "Folder ID is invalid.", requestId);
  const folder = await db.query.fileFolders.findFirst({ where: and(eq(fileFolders.id, id), eq(fileFolders.userId, session.user.id)) });
  if (!folder) return error(404, "NOT_FOUND", "Folder was not found.", requestId);
  const childFolder = await db.query.fileFolders.findFirst({ where: and(eq(fileFolders.userId, session.user.id), eq(fileFolders.parentId, id)) });
  const childFile = await db.query.storedFiles.findFirst({ where: and(eq(storedFiles.userId, session.user.id), eq(storedFiles.folderId, id)) });
  if (childFolder || childFile) return error(409, "FOLDER_NOT_EMPTY", "Move or delete the items in this folder first.", requestId);
  const connection = await db.query.storageConnections.findFirst({ where: eq(storageConnections.userId, session.user.id) });
  if (!connection) return error(409, "DRIVE_NOT_CONNECTED", "Reconnect Google Drive before deleting folders.", requestId);
  try {
    const response = await driveRequest(connection, "/drive/v3/files/" + encodeURIComponent(folder.driveFolderId), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) });
    if (!response.ok && response.status !== 404) return error(502, "DRIVE_DELETE_FAILED", "Google Drive could not delete this folder.", requestId);
    await db.delete(fileFolders).where(and(eq(fileFolders.id, id), eq(fileFolders.userId, session.user.id)));
    return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return error(502, "DRIVE_UNAVAILABLE", "Google Drive is unavailable. Try again later.", requestId); }
}
