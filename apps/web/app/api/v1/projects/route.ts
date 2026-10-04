import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { projects, storageConnections, storedFiles, subjects } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../lib/csrf";
import { getAppSession } from "../../../../lib/session";
import { driveRequest } from "../../../../lib/google-drive";

export const dynamic = "force-dynamic";
const taskSchema = z.object({ title: z.string().trim().min(1).max(160), done: z.boolean().default(false) }).strict();
const milestoneSchema = z.object({ title: z.string().trim().min(1).max(160), dueAt: z.iso.datetime({ offset: true }).nullable().default(null), done: z.boolean().default(false) }).strict();
const createSchema = z.object({
  type: z.enum(["PROJECT", "PRESENTATION", "LAB_FILE", "SEMINAR", "RESEARCH", "OTHER"]).default("PROJECT"),
  title: z.string().trim().min(1).max(180), description: z.string().trim().max(4000).nullable().default(null),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "SUBMITTED", "DONE"]).default("NOT_STARTED"),
  deadlineAt: z.iso.datetime({ offset: true }).nullable().default(null), subjectId: z.uuid().nullable().default(null),
  repoUrl: z.url().max(2048).nullable().default(null), venue: z.string().trim().max(180).nullable().default(null),
  duration: z.string().trim().max(80).nullable().default(null), team: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  tasks: z.array(taskSchema).max(100).default([]), milestones: z.array(milestoneSchema).max(50).default([]),
}).strict();
function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to view projects.", requestId);
  try {
    const items = await db.select({ id: projects.id, subjectId: projects.subjectId, type: projects.type, title: projects.title, description: projects.description, status: projects.status, deadlineAt: projects.deadlineAt, repoUrl: projects.repoUrl, venue: projects.venue, duration: projects.duration, team: projects.team, tasks: projects.tasks, milestones: projects.milestones, blockedBy: projects.blockedBy, createdAt: projects.createdAt, updatedAt: projects.updatedAt })
      .from(projects).where(and(eq(projects.userId, session.user.id), isNull(projects.archivedAt))).orderBy(asc(projects.deadlineAt), asc(projects.createdAt));
    const files = items.length ? await db.select({ id: storedFiles.id, projectId: storedFiles.projectId, name: storedFiles.name, mimeType: storedFiles.mimeType, sizeBytes: storedFiles.sizeBytes, createdAt: storedFiles.createdAt })
      .from(storedFiles).where(and(eq(storedFiles.userId, session.user.id), inArray(storedFiles.projectId, items.map((item) => item.id)), isNull(storedFiles.deletedAt))) : [];
    const byProject = new Map<string, typeof files>();
    for (const file of files) if (file.projectId) byProject.set(file.projectId, [...(byProject.get(file.projectId) ?? []), file]);
    return Response.json({ items: items.map((item) => ({ ...item, files: byProject.get(item.id) ?? [] })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return error(500, "INTERNAL", "Could not load projects.", requestId); }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to create a project.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return error(400, "VALIDATION_FAILED", "Check the project details and try again.", requestId);
  try {
    if (parsed.data.subjectId && !(await db.query.subjects.findFirst({ where: and(eq(subjects.id, parsed.data.subjectId), eq(subjects.userId, session.user.id)) }))) return error(404, "SUBJECT_NOT_FOUND", "Subject was not found.", requestId);
    const connection = await db.query.storageConnections.findFirst({ where: eq(storageConnections.userId, session.user.id) });
    if (!connection?.rootFolderId) return error(409, "DRIVE_NOT_CONNECTED", "Connect Google Drive before creating a project. Project files are stored in Drive.", requestId);
    const remoteResponse = await driveRequest(connection, "/drive/v3/files?fields=id", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: parsed.data.title, mimeType: "application/vnd.google-apps.folder", parents: [connection.rootFolderId], appProperties: { unidashOwnerId: session.user.id, unidashResource: "project" } }) });
    const remote = await remoteResponse.json().catch(() => ({})) as { id?: string };
    if (!remoteResponse.ok || !remote.id) return error(502, "DRIVE_FOLDER_FAILED", "Google Drive could not create this project's folder.", requestId);
    try {
      const [item] = await db.insert(projects).values({ ...parsed.data, userId: session.user.id, deadlineAt: parsed.data.deadlineAt ? new Date(parsed.data.deadlineAt) : null, driveFolderId: remote.id }).returning({ id: projects.id, subjectId: projects.subjectId, type: projects.type, title: projects.title, description: projects.description, status: projects.status, deadlineAt: projects.deadlineAt, repoUrl: projects.repoUrl, venue: projects.venue, duration: projects.duration, team: projects.team, tasks: projects.tasks, milestones: projects.milestones, blockedBy: projects.blockedBy, createdAt: projects.createdAt, updatedAt: projects.updatedAt });
      return Response.json({ item: { ...item, files: [] } }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (cause) {
      try { await driveRequest(connection, "/drive/v3/files/" + encodeURIComponent(remote.id), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) }); } catch { /* best effort cleanup if DB insert fails */ }
      throw cause;
    }
  } catch { return error(500, "PROJECT_CREATE_FAILED", "Could not save this project. Please retry.", requestId); }
}
