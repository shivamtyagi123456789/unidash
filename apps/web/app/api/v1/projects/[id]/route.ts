import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { projects } from "@unidash/db/schema";
import { hasValidCsrf } from "../../../../../lib/csrf";
import { getAppSession } from "../../../../../lib/session";

export const dynamic = "force-dynamic";
const taskSchema = z.object({ title: z.string().trim().min(1).max(160), done: z.boolean() }).strict();
const milestoneSchema = z.object({ title: z.string().trim().min(1).max(160), dueAt: z.iso.datetime({ offset: true }).nullable(), done: z.boolean() }).strict();
const patchSchema = z.object({
  title: z.string().trim().min(1).max(180), description: z.string().trim().max(4000).nullable(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "SUBMITTED", "DONE"]),
  deadlineAt: z.iso.datetime({ offset: true }).nullable(), team: z.array(z.string().trim().min(1).max(80)).max(20),
  tasks: z.array(taskSchema).max(100), milestones: z.array(milestoneSchema).max(50), blockedBy: z.string().trim().max(500).nullable(),
}).partial().strict().refine((value) => Object.keys(value).length > 0);
function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}
async function ownedProject(id: string, userId: string) {
  return db.query.projects.findFirst({ where: and(eq(projects.id, id), eq(projects.userId, userId), isNull(projects.archivedAt)) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to update projects.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return error(400, "VALIDATION_FAILED", "Project ID is invalid.", requestId);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, "VALIDATION_FAILED", "Check the project changes and try again.", requestId);
  try {
    const current = await ownedProject(id, session.user.id);
    if (!current) return error(404, "PROJECT_NOT_FOUND", "Project was not found.", requestId);
    const ifMatch = request.headers.get("if-match");
    if (ifMatch && ifMatch.replaceAll('"', "") !== current.updatedAt.toISOString()) return error(412, "VERSION_CONFLICT", "This project changed elsewhere. Refresh and retry.", requestId);
    const { deadlineAt, ...rest } = parsed.data;
    const data = { ...rest, ...(deadlineAt !== undefined ? { deadlineAt: deadlineAt ? new Date(deadlineAt) : null } : {}), updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) };
    const [item] = await db.update(projects).set(data).where(and(eq(projects.id, id), eq(projects.userId, session.user.id), eq(projects.updatedAt, current.updatedAt), isNull(projects.archivedAt))).returning({ id: projects.id, subjectId: projects.subjectId, type: projects.type, title: projects.title, description: projects.description, status: projects.status, deadlineAt: projects.deadlineAt, repoUrl: projects.repoUrl, venue: projects.venue, duration: projects.duration, team: projects.team, tasks: projects.tasks, milestones: projects.milestones, blockedBy: projects.blockedBy, createdAt: projects.createdAt, updatedAt: projects.updatedAt });
    if (!item) return error(412, "VERSION_CONFLICT", "This project changed elsewhere. Refresh and retry.", requestId);
    return Response.json({ item }, { headers: { "Cache-Control": "no-store", ETag: `"${item.updatedAt.toISOString()}"` } });
  } catch { return error(500, "INTERNAL", "Could not update this project.", requestId); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to archive projects.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return error(400, "VALIDATION_FAILED", "Project ID is invalid.", requestId);
  try {
    const current = await ownedProject(id, session.user.id);
    if (!current) return error(404, "PROJECT_NOT_FOUND", "Project was not found.", requestId);
    const ifMatch = request.headers.get("if-match");
    if (ifMatch && ifMatch.replaceAll('"', "") !== current.updatedAt.toISOString()) return error(412, "VERSION_CONFLICT", "This project changed elsewhere. Refresh and retry.", requestId);
    const [archived] = await db.update(projects).set({ archivedAt: new Date(), updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) }).where(and(eq(projects.id, id), eq(projects.userId, session.user.id), eq(projects.updatedAt, current.updatedAt), isNull(projects.archivedAt))).returning({ id: projects.id });
    if (!archived) return error(412, "VERSION_CONFLICT", "This project changed elsewhere. Refresh and retry.", requestId);
    return Response.json({ archived: true, driveFilesKept: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return error(500, "INTERNAL", "Could not archive this project.", requestId); }
}
