import { and, desc, eq, isNull } from "drizzle-orm";
import { isUtf8 } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { events, fileFolders, projects, storageConnections, storedFiles, subjects } from "@unidash/db/schema";
import { getAppSession } from "../../../../../lib/session";
import { hasValidCsrf } from "../../../../../lib/csrf";
import { driveRequest } from "../../../../../lib/google-drive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const basicMimeAllowList = new Set(["application/pdf", "image/jpeg", "image/png", "image/gif", "video/mp4", "application/zip"]);
const extensionMime: Record<string, string> = {
  zip: "application/zip", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  svg: "image/svg+xml", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", webm: "video/webm", mjs: "text/javascript",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json", ipynb: "application/json", xml: "application/xml", yml: "application/yaml", yaml: "application/yaml", toml: "application/toml", log: "text/plain", html: "text/html", htm: "text/html",
  c: "text/plain", h: "text/plain", cc: "text/plain", cpp: "text/plain", hpp: "text/plain", java: "text/plain", py: "text/plain", js: "text/plain", jsx: "text/plain", ts: "text/plain", tsx: "text/plain", css: "text/css", scss: "text/plain", sql: "text/plain", sh: "text/plain", ps1: "text/plain", go: "text/plain", rs: "text/plain", php: "text/plain", rb: "text/plain", kt: "text/plain", swift: "text/plain", dart: "text/plain", r: "text/plain", vue: "text/plain", svelte: "text/plain",
};
const kindList = ["NOTE", "SLIDE", "PDF", "ASSIGNMENT", "LAB", "PAPER", "IMAGE", "VIDEO", "OTHER"] as const;

function jsonError(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}
function safeName(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim();
  return cleaned.slice(0, 180) || "upload";
}
function safeProjectPath(value: string, fileName: string) {
  const rawPath = (value || fileName).normalize("NFKC").replaceAll("\\", "/");
  const parts = rawPath.split("/");
  if (rawPath.startsWith("/") || rawPath.length > 1200 || parts.length > 14 || parts.some((part) => !part || part === "." || part === "..")) throw new Error("Invalid project file path.");
  const cleanParts = parts.map(safeName);
  if (cleanParts.some((part) => !part || part === "." || part === "..")) throw new Error("Invalid project file path.");
  return cleanParts.join("/");
}
function sniff(bytes: Buffer) {
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (bytes.subarray(0, 6).toString() === "GIF87a" || bytes.subarray(0, 6).toString() === "GIF89a") return "image/gif";
  if (bytes.length > 12 && bytes.subarray(4, 8).toString() === "ftyp") return "video/mp4";
  if (bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) return "application/zip";
  return null;
}
async function getConnection(userId: string) {
  return db.query.storageConnections.findFirst({ where: eq(storageConnections.userId, userId) });
}
async function projectUploadFolder(connection: Awaited<ReturnType<typeof getConnection>>, userId: string, projectId: string, rootFolderId: string, relativePath: string) {
  if (!relativePath) return rootFolderId;
  const normalizedPath = relativePath.normalize("NFKC").replaceAll("\\", "/");
  const parts = normalizedPath.split("/");
  if (normalizedPath.startsWith("/") || normalizedPath.length > 1200 || parts.length < 2 || parts.length > 13 || parts.some((part) => !part || part === "." || part === "..")) throw new Error("Invalid project folder path.");
  if (parts.some((part) => safeName(part) === "." || safeName(part) === "..")) throw new Error("Invalid project folder path.");
  let parentId = rootFolderId;
  for (const rawName of parts.slice(0, -1)) {
    const name = safeName(rawName);
    const query = new URLSearchParams({ q: `'${parentId.replaceAll("'", "\\'")}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: "files(id,name)", pageSize: "1000" });
    const listing = await driveRequest(connection!, "/drive/v3/files?" + query.toString());
    const listed = await listing.json().catch(() => ({})) as { files?: { id?: string; name?: string }[] };
    if (!listing.ok) throw new Error("Google Drive folder lookup failed.");
    let child = listed.files?.find((folder) => folder.name === name && folder.id)?.id;
    if (!child) {
      const createdResponse = await driveRequest(connection!, "/drive/v3/files?fields=id", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId], appProperties: { unidashOwnerId: userId, unidashProjectId: projectId } }) });
      const created = await createdResponse.json().catch(() => ({})) as { id?: string };
      if (!createdResponse.ok || !created.id) throw new Error("Google Drive could not create a project folder.");
      child = created.id;
    }
    parentId = child;
  }
  return parentId;
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return jsonError(401, "AUTH_REQUIRED", "Sign in to view files.", requestId);
  const folderId = new URL(request.url).searchParams.get("folderId");
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (folderId && folderId !== "root" && folderId !== "" && !z.uuid().safeParse(folderId).success) return jsonError(400, "VALIDATION_FAILED", "Folder ID is invalid.", requestId);
  if (projectId && !z.uuid().safeParse(projectId).success) return jsonError(400, "VALIDATION_FAILED", "Project ID is invalid.", requestId);
  try {
    const where = [eq(storedFiles.userId, session.user.id), isNull(storedFiles.deletedAt)];
    if (projectId) where.push(eq(storedFiles.projectId, projectId));
    else if (folderId === "root" || folderId === "") where.push(isNull(storedFiles.folderId), isNull(storedFiles.projectId));
    else if (folderId) where.push(eq(storedFiles.folderId, folderId));
    const [items, folders, connection] = await Promise.all([
      db.select({ id: storedFiles.id, folderId: storedFiles.folderId, projectId: storedFiles.projectId, subjectId: storedFiles.subjectId, eventId: storedFiles.eventId, name: storedFiles.name, mimeType: storedFiles.mimeType, sizeBytes: storedFiles.sizeBytes, source: storedFiles.source, kind: storedFiles.kind, tags: storedFiles.tags, createdAt: storedFiles.createdAt, updatedAt: storedFiles.updatedAt }).from(storedFiles).where(and(...where)).orderBy(desc(storedFiles.createdAt)).limit(200),
      db.select({ id: fileFolders.id, parentId: fileFolders.parentId, name: fileFolders.name, subjectId: fileFolders.subjectId, termId: fileFolders.termId }).from(fileFolders).where(folderId && folderId !== "root" ? and(eq(fileFolders.userId, session.user.id), eq(fileFolders.parentId, folderId)) : and(eq(fileFolders.userId, session.user.id), isNull(fileFolders.parentId))),
      getConnection(session.user.id),
    ]);
    return Response.json({ items, folders, storage: connection ? { provider: "GOOGLE_DRIVE", accountEmail: connection.accountEmail, connected: true } : { provider: "GOOGLE_DRIVE", connected: false } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError(500, "INTERNAL", "Could not load files.", requestId);
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return jsonError(401, "AUTH_REQUIRED", "Sign in to upload files.", requestId);
  if (!hasValidCsrf(request)) return jsonError(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const connection = await getConnection(session.user.id);
  if (!connection) return jsonError(409, "DRIVE_NOT_CONNECTED", "Connect Google Drive before uploading.", requestId);
  let form: FormData;
  try { form = await request.formData(); } catch { return jsonError(400, "VALIDATION_FAILED", "Upload form is invalid.", requestId); }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "VALIDATION_FAILED", "Choose a file to upload.", requestId);
  const projectIdValue = form.get("projectId");
  const projectId = typeof projectIdValue === "string" && projectIdValue ? projectIdValue : null;
  if (projectId && !z.uuid().safeParse(projectId).success) return jsonError(400, "VALIDATION_FAILED", "Project ID is invalid.", requestId);
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return jsonError(413, "FILE_SIZE_LIMIT", "Files must be between 1 byte and 20 MB.", requestId);
  const bytes = Buffer.from(await file.arrayBuffer());
  const signatureType = sniff(bytes);
  const extension = safeName(file.name).split(".").pop()?.toLowerCase() ?? "";
  const declaredType = Object.hasOwn(extensionMime, extension) ? extensionMime[extension] : undefined;
  const textFile = Boolean((declaredType && declaredType.startsWith("text/")) || ["application/json", "application/xml", "application/yaml", "application/toml"].includes(declaredType ?? ""));
  const mimeType = signatureType === "application/zip" && declaredType?.startsWith("application/vnd.openxmlformats-officedocument")
    ? declaredType
    : signatureType ?? (declaredType && !declaredType.startsWith("text/") ? declaredType : textFile && isUtf8(bytes) && !bytes.includes(0) ? declaredType : projectId ? "application/octet-stream" : null);
  const declaredMatches = !file.type || file.type === mimeType || file.type === "application/octet-stream" || (mimeType === "text/plain" && file.type.startsWith("text/")) || (signatureType === "application/zip" && ["application/zip", "application/x-zip-compressed"].includes(file.type) && mimeType === "application/zip");
  if (!mimeType || (!projectId && (!basicMimeAllowList.has(mimeType) || !declaredMatches))) return jsonError(415, "FILE_TYPE_UNSUPPORTED", "Use a PDF, image, MP4, ZIP, Office document, or project file.", requestId);
  const folderIdValue = form.get("folderId");
  const folderId = typeof folderIdValue === "string" && folderIdValue ? folderIdValue : null;
  const eventIdValue = form.get("eventId");
  const eventId = typeof eventIdValue === "string" && eventIdValue ? eventIdValue : null;
  const subjectIdValue = form.get("subjectId");
  const subjectId = typeof subjectIdValue === "string" && subjectIdValue ? subjectIdValue : null;
  const relativePathValue = form.get("relativePath");
  const relativePath = typeof relativePathValue === "string" ? relativePathValue : "";
  if ((folderId && !z.uuid().safeParse(folderId).success) || (eventId && !z.uuid().safeParse(eventId).success) || (subjectId && !z.uuid().safeParse(subjectId).success) || (projectId && !z.uuid().safeParse(projectId).success) || (folderId && projectId)) return jsonError(400, "VALIDATION_FAILED", "Choose one valid folder or project destination.", requestId);
  if (relativePath && !projectId) return jsonError(400, "VALIDATION_FAILED", "Folder uploads must belong to a project.", requestId);
  let projectRelativePath: string | null = null;
  if (projectId) {
    try { projectRelativePath = safeProjectPath(relativePath, file.name); }
    catch { return jsonError(400, "VALIDATION_FAILED", "The project folder path is invalid.", requestId); }
  }
  if (eventId && !(await db.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.userId, session.user.id)) }))) return jsonError(404, "EVENT_NOT_FOUND", "Event was not found.", requestId);
  if (subjectId && !(await db.query.subjects.findFirst({ where: and(eq(subjects.id, subjectId), eq(subjects.userId, session.user.id)) }))) return jsonError(404, "SUBJECT_NOT_FOUND", "Subject was not found.", requestId);
  let destinationFolderId = connection.rootFolderId;
  if (projectId) {
    const project = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.userId, session.user.id), isNull(projects.archivedAt)) });
    if (!project) return jsonError(404, "PROJECT_NOT_FOUND", "Project was not found.", requestId);
    try { destinationFolderId = await projectUploadFolder(connection, session.user.id, projectId, project.driveFolderId, relativePath); }
    catch { return jsonError(400, "PROJECT_FOLDER_FAILED", "Could not prepare the selected folder in Google Drive.", requestId); }
  } else if (folderId) {
    const [folder] = await db.select({ id: fileFolders.id, driveFolderId: fileFolders.driveFolderId }).from(fileFolders).where(and(eq(fileFolders.id, folderId), eq(fileFolders.userId, session.user.id))).limit(1);
    if (!folder) return jsonError(404, "FOLDER_NOT_FOUND", "Folder was not found.", requestId);
    destinationFolderId = folder.driveFolderId;
  }
  if (!destinationFolderId) return jsonError(409, "DRIVE_SETUP_REQUIRED", "The Google Drive folder is not configured.", requestId);
  const kindValue = form.get("kind");
  const kind = kindList.includes(kindValue as typeof kindList[number]) ? kindValue as typeof kindList[number] : mimeType.startsWith("image/") ? "IMAGE" : mimeType === "application/pdf" ? "PDF" : mimeType.startsWith("video/") ? "VIDEO" : "OTHER";
  const name = safeName(file.name);
  const boundary = "unidash-" + randomUUID();
  const metadata = JSON.stringify({ name, mimeType, appProperties: { unidashOwnerId: session.user.id, ...(projectId ? { unidashProjectId: projectId } : {}) }, parents: [destinationFolderId] });
  const multipart = Buffer.concat([Buffer.from("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + metadata + "\r\n--" + boundary + "\r\nContent-Type: " + mimeType + "\r\n\r\n"), bytes, Buffer.from("\r\n--" + boundary + "--")]);
  let createdDriveFileId: string | null = null;
  try {
    const upload = await driveRequest(connection, "/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size", { method: "POST", headers: { "content-type": "multipart/related; boundary=" + boundary }, body: multipart });
    const driveFile = await upload.json() as { id?: string; name?: string; mimeType?: string; size?: string; error?: { message?: string } };
    if (!upload.ok || !driveFile.id) return jsonError(502, "DRIVE_UPLOAD_FAILED", "Google Drive could not save this file.", requestId);
    createdDriveFileId = driveFile.id;
    const [item] = await db.insert(storedFiles).values({ userId: session.user.id, folderId, projectId, projectRelativePath, eventId, subjectId, driveFileId: driveFile.id, name, mimeType: mimeType, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), kind, source: "MANUAL" }).returning({ id: storedFiles.id, name: storedFiles.name, mimeType: storedFiles.mimeType, sizeBytes: storedFiles.sizeBytes, folderId: storedFiles.folderId, projectId: storedFiles.projectId, eventId: storedFiles.eventId, subjectId: storedFiles.subjectId, kind: storedFiles.kind, createdAt: storedFiles.createdAt });
    return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    if (createdDriveFileId) {
      try { await driveRequest(connection, "/drive/v3/files/" + encodeURIComponent(createdDriveFileId), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) }); } catch { /* best-effort cleanup after metadata persistence fails */ }
    }
    return jsonError(502, "DRIVE_UNAVAILABLE", "Google Drive is unavailable. Try again later.", requestId);
  }
}
