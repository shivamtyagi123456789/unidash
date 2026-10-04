import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@unidash/db/client";
import { storageConnections } from "@unidash/db/schema";
import { readServerEnvironment } from "@unidash/config/env";
import { getAppSession } from "../../../../../../lib/session";
import { encryptStorageSecret } from "../../../../../../lib/storage-crypto";

export const dynamic = "force-dynamic";
type Tokens = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
function redirect(request: Request, status: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("drive", status);
  return Response.redirect(url, 303);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("error")) return redirect(request, "denied");
  const code = url.searchParams.get("code");
  const [stateData, signature, extra] = (url.searchParams.get("state") ?? "").split(".");
  if (!code || !stateData || !signature || extra) return redirect(request, "invalid");
  const env = readServerEnvironment();
  if (!env.AUTH_SECRET || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.VAULT_MASTER_KEY) return redirect(request, "setup-required");
  const expected = createHmac("sha256", env.AUTH_SECRET).update(stateData).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return redirect(request, "invalid");
  let state: { userId: string; expiresAt: number; nonce: string };
  try { state = JSON.parse(Buffer.from(stateData, "base64url").toString("utf8")) as typeof state; } catch { return redirect(request, "invalid"); }
  const session = await getAppSession(request.headers);
  if (!session || session.user.id !== state.userId || state.expiresAt < Date.now() || !state.nonce) return redirect(request, "invalid");

  const callbackUrl = `${env.APP_URL}/api/v1/storage/drive/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: callbackUrl, grant_type: "authorization_code" }), cache: "no-store", redirect: "error" });
  const tokens = await tokenResponse.json() as Tokens;
  if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token || !tokens.scope?.split(" ").includes("https://www.googleapis.com/auth/drive.file")) return redirect(request, "token-failed");
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` }, cache: "no-store", redirect: "error" });
  const profile = await profileResponse.json() as { email?: string; verified_email?: boolean };
  if (!profileResponse.ok || !profile.email || !profile.verified_email) return redirect(request, "profile-failed");

  const [existing] = await db.select({ id: storageConnections.id }).from(storageConnections).where(eq(storageConnections.userId, state.userId)).limit(1);
  const [existingRoot] = existing ? await db.select({ rootFolderId: storageConnections.rootFolderId }).from(storageConnections).where(eq(storageConnections.id, existing.id)).limit(1) : [];
  let rootFolderId = existingRoot?.rootFolderId ?? null;
  if (!rootFolderId) {
    const rootFolderResponse = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { authorization: "Bearer " + tokens.access_token, "content-type": "application/json" }, body: JSON.stringify({ name: "UniDash", mimeType: "application/vnd.google-apps.folder", appProperties: { unidashOwnerId: state.userId } }), cache: "no-store", redirect: "error" });
    const rootFolder = await rootFolderResponse.json() as { id?: string };
    if (!rootFolderResponse.ok || !rootFolder.id) return redirect(request, "drive-setup-failed");
    rootFolderId = rootFolder.id;
  }
  const id = existing?.id ?? randomUUID();
  const encryptedAccess = encryptStorageSecret(tokens.access_token, state.userId, id);
  const encryptedRefresh = encryptStorageSecret(tokens.refresh_token, state.userId, id);
  await db.insert(storageConnections).values({ id, userId: state.userId, accountEmail: profile.email.toLowerCase(), rootFolderId, encryptedAccessToken: encryptedAccess.ciphertext, encryptedRefreshToken: encryptedRefresh.ciphertext, accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000), grantedScope: tokens.scope, keyVersion: encryptedAccess.version, updatedAt: new Date() }).onConflictDoUpdate({ target: storageConnections.userId, set: { accountEmail: profile.email.toLowerCase(), rootFolderId, encryptedAccessToken: encryptedAccess.ciphertext, encryptedRefreshToken: encryptedRefresh.ciphertext, accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000), grantedScope: tokens.scope, keyVersion: encryptedAccess.version, updatedAt: new Date() } });
  return redirect(request, "connected");
}
