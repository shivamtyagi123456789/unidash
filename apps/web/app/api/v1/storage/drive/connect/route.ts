import { createHmac, randomBytes } from "node:crypto";
import { readServerEnvironment } from "@unidash/config/env";
import { getAppSession } from "../../../../../../lib/session";
import { hasValidCsrf } from "../../../../../../lib/csrf";

export const dynamic = "force-dynamic";
const requiredScope = "https://www.googleapis.com/auth/drive.file";
function sign(payload: string) { return createHmac("sha256", readServerEnvironment().AUTH_SECRET ?? "").update(payload).digest("base64url"); }
function fail(message: string, status = 400) { return Response.json({ error: { code: "DRIVE_CONNECT_FAILED", message } }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function GET(request: Request) {
  const session = await getAppSession(request.headers);
  if (!session) return fail("Sign in to connect Google Drive.", 401);
  const env = readServerEnvironment();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.AUTH_SECRET || !env.VAULT_MASTER_KEY) return fail("Google OAuth and VAULT_MASTER_KEY must be configured before Drive can be connected.", 503);
  const stateData = Buffer.from(JSON.stringify({ userId: session.user.id, expiresAt: Date.now() + 5 * 60_000, nonce: randomBytes(16).toString("base64url") })).toString("base64url");
  const state = `${stateData}.${sign(stateData)}`;
  const callback = `${env.APP_URL}/api/v1/storage/drive/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callback, response_type: "code", scope: `openid email ${requiredScope}`, access_type: "offline", prompt: "consent", include_granted_scopes: "false", state }).toString();
  return Response.redirect(authUrl, 302);
}

export async function POST(request: Request) {
  const session = await getAppSession(request.headers);
  if (!session) return fail("Sign in to connect Google Drive.", 401);
  if (!hasValidCsrf(request)) return fail("The request could not be verified.", 403);
  const env = readServerEnvironment();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.AUTH_SECRET || !env.VAULT_MASTER_KEY) return fail("Google OAuth and VAULT_MASTER_KEY must be configured before Drive can be connected.", 503);
  const callback = `${env.APP_URL}/api/v1/storage/drive/callback`;
  const stateData = Buffer.from(JSON.stringify({ userId: session.user.id, expiresAt: Date.now() + 5 * 60_000, nonce: randomBytes(16).toString("base64url") })).toString("base64url");
  const state = `${stateData}.${sign(stateData)}`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callback, response_type: "code", scope: `openid email ${requiredScope}`, access_type: "offline", prompt: "consent", include_granted_scopes: "false", state }).toString();
  return Response.json({ authorizationUrl: authUrl.toString() }, { headers: { "Cache-Control": "no-store" } });
}
