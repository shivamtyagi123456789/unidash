import { and, eq } from "drizzle-orm";
import { db } from "@unidash/db/client";
import { storageConnections } from "@unidash/db/schema";
import { readServerEnvironment } from "@unidash/config/env";
import { decryptStorageSecret, encryptStorageSecret } from "./storage-crypto";

type Connection = typeof storageConnections.$inferSelect;
type TokenResponse = { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; error?: string };

async function saveAccessToken(connection: Connection, accessToken: string, expiresIn: number, refreshToken = connection.encryptedRefreshToken) {
  const encrypted = encryptStorageSecret(refreshToken, connection.userId, connection.id);
  const encryptedAccess = encryptStorageSecret(accessToken, connection.userId, connection.id);
  await db.update(storageConnections).set({
    encryptedAccessToken: encryptedAccess.ciphertext,
    encryptedRefreshToken: encrypted.ciphertext,
    accessTokenExpiresAt: new Date(Date.now() + Math.max(60, expiresIn) * 1000),
    keyVersion: encrypted.version,
    updatedAt: new Date(),
  }).where(and(eq(storageConnections.id, connection.id), eq(storageConnections.userId, connection.userId)));
  return accessToken;
}

export async function getDriveAccessToken(connection: Connection) {
  if (connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
    return decryptStorageSecret(connection.encryptedAccessToken, connection.userId, connection.id, connection.keyVersion);
  }
  const env = readServerEnvironment();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth is not configured.");
  const refreshToken = decryptStorageSecret(connection.encryptedRefreshToken, connection.userId, connection.id, connection.keyVersion);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const token = await response.json() as TokenResponse;
  if (!response.ok || !token.access_token) throw new Error("Google Drive authorization expired; reconnect the account.");
  return saveAccessToken(connection, token.access_token, token.expires_in ?? 3600, refreshToken);
}

export async function driveRequest(connection: Connection, path: string, init: RequestInit = {}) {
  if (!path.startsWith("/drive/v3/") && !path.startsWith("/upload/drive/v3/")) throw new Error("Invalid Drive API path.");
  const accessToken = await getDriveAccessToken(connection);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  const response = await fetch(`https://www.googleapis.com${path}`, { ...init, headers, cache: "no-store", redirect: "error" });
  return response;
}

export function connectionForUser(userId: string) {
  return db.query.storageConnections.findFirst({ where: eq(storageConnections.userId, userId) });
}
