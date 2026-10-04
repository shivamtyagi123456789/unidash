import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { projects, storageConnections, storedFiles } from "@unidash/db/schema";
import { addProjectAssetBase, projectAssetBase, projectAssetsRoot, projectPreviewCsp, rewriteProjectCss } from "../../../../../../../../../lib/project-preview";
import { getAppSession } from "../../../../../../../../../lib/session";
import { driveRequest } from "../../../../../../../../../lib/google-drive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

function safePath(parts: string[]) {
  if (!parts.length || parts.length > 14) return null;
  const normalized = parts.map((part) => part.normalize("NFKC").trim().slice(0, 180));
  if (normalized.some((part) => !part || part === "." || part === ".." || part.includes("/") || part.includes("\\") || /[\u0000-\u001f\u007f]/.test(part))) return null;
  const path = normalized.join("/");
  return path.length <= 1200 ? path : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; fileId: string; assetPath: string[] }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to open project files.", requestId);
  const { id, fileId, assetPath } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(fileId).success) return error(400, "VALIDATION_FAILED", "Project or file ID is invalid.", requestId);
  const projectPath = safePath(assetPath);
  if (!projectPath) return error(400, "VALIDATION_FAILED", "Project asset path is invalid.", requestId);

  try {
    const [project] = await db.select({ id: projects.id })
      .from(projects).where(and(eq(projects.id, id), eq(projects.userId, session.user.id), isNull(projects.archivedAt))).limit(1);
    if (!project) return error(404, "PROJECT_NOT_FOUND", "Project was not found.", requestId);

    let [file] = await db.select({ driveFileId: storedFiles.driveFileId, name: storedFiles.name, mimeType: storedFiles.mimeType, sizeBytes: storedFiles.sizeBytes, projectRelativePath: storedFiles.projectRelativePath })
      .from(storedFiles).where(and(eq(storedFiles.projectId, id), eq(storedFiles.userId, session.user.id), eq(storedFiles.projectRelativePath, projectPath), isNull(storedFiles.deletedAt))).orderBy(desc(storedFiles.createdAt)).limit(1);
    // Older folder uploads predate relative-path metadata. If there is one
    // unambiguous project file with this basename, keep those sites working.
    if (!file) {
      const basename = projectPath.split("/").pop()!;
      const matches = await db.select({ driveFileId: storedFiles.driveFileId, name: storedFiles.name, mimeType: storedFiles.mimeType, sizeBytes: storedFiles.sizeBytes, projectRelativePath: storedFiles.projectRelativePath })
        .from(storedFiles).where(and(eq(storedFiles.projectId, id), eq(storedFiles.userId, session.user.id), eq(storedFiles.name, basename), isNull(storedFiles.deletedAt))).limit(2);
      if (matches.length === 1) [file] = matches;
    }
    if (!file) return error(404, "PROJECT_ASSET_NOT_FOUND", "That project asset was not found.", requestId);
    if (file.sizeBytes > 20 * 1024 * 1024) return error(413, "FILE_SIZE_LIMIT", "This project asset is too large to preview.", requestId);

    const connection = await db.query.storageConnections.findFirst({ where: eq(storageConnections.userId, session.user.id) });
    if (!connection) return error(409, "DRIVE_NOT_CONNECTED", "Reconnect Google Drive to open this project site.", requestId);
    const remote = await driveRequest(connection, "/drive/v3/files/" + encodeURIComponent(file.driveFileId) + "?alt=media");
    if (!remote.ok) return error(502, "DRIVE_ASSET_FAILED", "Google Drive could not load this project asset.", requestId);

    const isHtml = file.mimeType === "text/html" && /\.html?$/i.test(file.name);
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const mimeOverrides: Record<string, string> = {
      css: "text/css", js: "text/javascript", mjs: "text/javascript", svg: "image/svg+xml",
      webp: "image/webp", avif: "image/avif", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2",
      ttf: "font/ttf", otf: "font/otf", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", webm: "video/webm",
    };
    const contentType = mimeOverrides[extension] || file.mimeType;
    const headers = new Headers({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "Content-Security-Policy": projectPreviewCsp(request.url, id, fileId),
    });
    if (isHtml) {
      const html = Buffer.from(await remote.arrayBuffer()).toString("utf8");
      const base = projectAssetBase(request.url, id, fileId, file.projectRelativePath || file.name);
      const root = projectAssetsRoot(request.url, id, fileId);
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      return new Response(addProjectAssetBase(html, base.toString(), root.toString()), { headers });
    }

    const content = Buffer.from(await remote.arrayBuffer());
    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", "inline");
    return new Response(extension === "css" ? rewriteProjectCss(content.toString("utf8"), projectAssetsRoot(request.url, id, fileId).toString()) : content, { headers });
  } catch {
    return error(502, "DRIVE_ASSET_FAILED", "Could not open this project asset from Google Drive.", requestId);
  }
}
