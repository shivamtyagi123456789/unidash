import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { readServerEnvironment } from "@unidash/config/env";

const KEY_VERSION = 1;
const AAD_VERSION = "unidash-drive-token-v1";

function deriveKey(userId: string, connectionId: string, version: number) {
  if (version !== KEY_VERSION) throw new Error("Unsupported storage encryption key version.");
  const encoded = readServerEnvironment().VAULT_MASTER_KEY;
  if (!encoded) throw new Error("VAULT_MASTER_KEY is not configured.");
  const master = Buffer.from(encoded, "base64");
  if (master.length !== 32) throw new Error("VAULT_MASTER_KEY must be a base64-encoded 32-byte key.");
  return Buffer.from(hkdfSync("sha256", master, Buffer.from(userId), Buffer.from(`${AAD_VERSION}:${connectionId}`), 32));
}

export function encryptStorageSecret(value: string, userId: string, connectionId: string) {
  const version = KEY_VERSION;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(userId, connectionId, version), iv);
  cipher.setAAD(Buffer.from(`${AAD_VERSION}:${userId}:${connectionId}`));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: `v${version}.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`, version };
}

export function decryptStorageSecret(value: string, userId: string, connectionId: string, version: number) {
  const [encodedVersion, ivText, tagText, dataText, extra] = value.split(".");
  if (extra || encodedVersion !== `v${version}` || !ivText || !tagText || !dataText) throw new Error("Encrypted storage secret has an invalid format.");
  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Encrypted storage secret has invalid parameters.");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(userId, connectionId, version), iv);
  decipher.setAAD(Buffer.from(`${AAD_VERSION}:${userId}:${connectionId}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}

export function randomStorageConnectionId() {
  return randomBytes(16).toString("hex");
}
