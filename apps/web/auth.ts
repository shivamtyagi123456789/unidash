import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth";
import { and, eq, isNull } from "drizzle-orm";
import { readServerEnvironment } from "@unidash/config/env";
import { db } from "@unidash/db/client";
import { allowedEmails, authSchema, integrations, userSettings, users } from "@unidash/db/schema";

const environment = readServerEnvironment();
const googleReady = Boolean(environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET);

async function findInvite(email: string) {
  const [invite] = await db
    .select({ role: allowedEmails.role })
    .from(allowedEmails)
    .where(and(eq(allowedEmails.email, email.trim().toLowerCase()), isNull(allowedEmails.revokedAt)))
    .limit(1);
  return invite ?? null;
}

function withoutGoogleTokens<T extends {
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  scope?: string | null;
}>(account: T) {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    scope: null,
  };
}

export const auth = betterAuth({
  appName: "UniDash",
  baseURL: environment.AUTH_URL ?? environment.APP_URL,
  // Keep static generation possible before deployment secrets are injected. This
  // throwaway value is only available during Next's production build phase.
  secret: environment.AUTH_SECRET ?? (process.env.NEXT_PHASE === "phase-production-build"
    ? "unidash-build-only-secret-never-used-at-runtime"
    : undefined),
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  trustedOrigins: [environment.APP_URL],
  socialProviders: googleReady
    ? {
        google: {
          clientId: environment.GOOGLE_CLIENT_ID!,
          clientSecret: environment.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
          requireEmailVerification: true,
        },
      }
    : {},
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "MEMBER", input: false },
    },
    validateUserInfo: async ({ user, source }) => {
      if (source.method !== "oauth" || source.oauth?.providerId !== "google") {
        return { error: "sign_in_method_not_allowed", errorDescription: "Sign in with an approved Google account." };
      }

      const profile = source.oauth.profile as { email_verified?: unknown } | undefined;
      if (!user.email || profile?.email_verified !== true) {
        return { error: "verified_email_required", errorDescription: "Use a verified Google email address." };
      }

      if (!(await findInvite(user.email))) {
        return { error: "email_not_allowed", errorDescription: "This Google account has not been invited to UniDash." };
      }
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  account: {
    updateAccountOnSignIn: false,
    storeStateStrategy: "database",
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const invite = await findInvite(user.email);
          if (!invite) {
            throw new APIError("FORBIDDEN", { message: "This email is not allowed to sign in." });
          }
          return { data: { ...user, email: user.email.trim().toLowerCase(), role: invite.role } };
        },
        after: async (user) => {
          await db.transaction(async (tx) => {
            await tx.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();
            await tx
              .insert(integrations)
              .values([
                { userId: user.id, kind: "AMS" },
                { userId: user.id, kind: "MOODLE" },
              ])
              .onConflictDoNothing();
          });
        },
      },
    },
    account: {
      create: { before: async (account) => ({ data: withoutGoogleTokens(account) }) },
      update: { before: async (account) => ({ data: withoutGoogleTokens(account) }) },
    },
    session: {
      create: {
        before: async (session) => {
          const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, session.userId)).limit(1);
          if (!user || !(await findInvite(user.email))) return false;
          return { data: session };
        },
      },
    },
  },
  advanced: {
    database: { generateId: "uuid" },
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: environment.NODE_ENV === "production",
      path: "/",
    },
  },
});

export { googleReady };
