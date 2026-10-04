import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@unidash/db/client";
import { storageConnections } from "@unidash/db/schema";
import { getAppSession } from "../../../../../lib/session";
import { hasValidCsrf } from "../../../../../lib/csrf";
import { decryptStorageSecret } from "../../../../../lib/storage-crypto";

export const dynamic = "force-dynamic";
function error(status: number, code: string, message: string, requestId: string) { return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function GET(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to view storage status.", requestId);
  try {
    const [connection] = await db.select({ provider: storageConnections.provider, accountEmail: storageConnections.accountEmail, createdAt: storageConnections.createdAt, updatedAt: storageConnections.updatedAt }).from(storageConnections).where(eq(storageConnections.userId, session.user.id)).limit(1);
    return Response.json({ connected: Boolean(connection), connection: connection ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return error(500, "INTERNAL", "Could not load storage status.", requestId); }
}

export async function DELETE(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to disconnect Google Drive.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const [connection] = await db.select().from(storageConnections).where(eq(storageConnections.userId, session.user.id)).limit(1);
  if (!connection) return Response.json({ disconnected: true }, { headers: { "Cache-Control": "no-store" } });
  let revokeFailed = false;
  try {
    const token = decryptStorageSecret(connection.encryptedRefreshToken, connection.userId, connection.id, connection.keyVersion);
    const revoke = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }), cache: "no-store", redirect: "error" });
    if (!revoke.ok) throw new Error("Google token revocation failed.");
  } catch {
    // Remove the encrypted grant from this app even if the remote revoke endpoint is unavailable.
    revokeFailed = true;
  }
  await db.delete(storageConnections).where(eq(storageConnections.id, connection.id));
  return Response.json({ disconnected: true, revokeFailed, note: revokeFailed ? "Files remain in Google Drive. UniDash removed its stored connection, but revoke the app from your Google Account if it still appears there." : "Files remain in Google Drive; UniDash disconnected and revoked its grant." }, { headers: { "Cache-Control": "no-store" } });
}
