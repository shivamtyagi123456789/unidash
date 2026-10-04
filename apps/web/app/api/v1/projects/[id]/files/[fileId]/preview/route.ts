import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { projects, storageConnections, storedFiles } from "@unidash/db/schema";
import { getAppSession } from "../../../../../../../../lib/session";
import { driveRequest } from "../../../../../../../../lib/google-drive";
import { addProjectAssetBase, projectAssetBase, projectAssetsRoot, projectPreviewCsp } from "../../../../../../../../lib/project-preview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to open this project site.", requestId);
  const { id, fileId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(fileId).success) return error(400, "VALIDATION_FAILED", "Project or file ID is invalid.", requestId);

  try {
    const [row] = await db.select({ driveFileId: storedFiles.driveFileId, name: storedFiles.name, mimeType: storedFiles.mimeType, sizeBytes: storedFiles.sizeBytes, projectRelativePath: storedFiles.projectRelativePath })
      .from(storedFiles)
      .innerJoin(projects, and(eq(projects.id, storedFiles.projectId), eq(projects.userId, storedFiles.userId)))
      .where(and(eq(storedFiles.id, fileId), eq(storedFiles.projectId, id), eq(storedFiles.userId, session.user.id), isNull(storedFiles.deletedAt), isNull(projects.archivedAt)))
      .limit(1);
    if (!row) return error(404, "PROJECT_FILE_NOT_FOUND", "Project HTML file was not found.", requestId);
    if (row.mimeType !== "text/html" || !/\.html?$/i.test(row.name)) return error(415, "HTML_PREVIEW_ONLY", "Only HTML files can be opened as a project site.", requestId);
    if (row.sizeBytes > 20 * 1024 * 1024) return error(413, "FILE_SIZE_LIMIT", "This HTML file is too large to preview.", requestId);
    const connection = await db.query.storageConnections.findFirst({ where: eq(storageConnections.userId, session.user.id) });
    if (!connection) return error(409, "DRIVE_NOT_CONNECTED", "Reconnect Google Drive to preview this site.", requestId);
    const remote = await driveRequest(connection, "/drive/v3/files/" + encodeURIComponent(row.driveFileId) + "?alt=media");
    if (!remote.ok) return error(502, "DRIVE_PREVIEW_FAILED", "Google Drive could not load this HTML file.", requestId);
    const html = Buffer.from(await remote.arrayBuffer()).toString("utf8");
    const base = projectAssetBase(request.url, id, fileId, row.projectRelativePath || row.name);
    const root = projectAssetsRoot(request.url, id, fileId);
    return new Response(addProjectAssetBase(html, base.toString(), root.toString()), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": projectPreviewCsp(request.url, id, fileId),
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return error(502, "DRIVE_PREVIEW_FAILED", "Could not open this project site from Google Drive.", requestId);
  }
}
