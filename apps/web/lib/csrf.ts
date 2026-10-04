import { randomBytes, timingSafeEqual } from "node:crypto";
import { readServerEnvironment } from "@unidash/config/env";

const cookieName = "unidash.csrf";

export function issueCsrfToken() {
  const token = randomBytes(32).toString("base64url");
  const secure = readServerEnvironment().NODE_ENV === "production" ? "; Secure" : "";
  return {
    token,
    cookie: `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict${secure}`,
  };
}

export function hasValidCsrf(request: Request) {
  const { APP_URL } = readServerEnvironment();
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || origin !== new URL(APP_URL).origin) return false;
  if (fetchSite && fetchSite !== "same-origin") return false;

  const cookieToken = request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length) return false;

  return timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
}
