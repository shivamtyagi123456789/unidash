import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

// The web app and worker run from workspace subfolders. Load the one private
// workspace-root .env at runtime as well as during framework configuration.
let workspaceDirectory = process.cwd();
for (let depth = 0; depth < 8; depth += 1) {
  if (existsSync(resolve(workspaceDirectory, "pnpm-workspace.yaml"))) {
    dotenv.config({ path: resolve(workspaceDirectory, ".env"), quiet: true });
    break;
  }

  const parentDirectory = dirname(workspaceDirectory);
  if (parentDirectory === workspaceDirectory) break;
  workspaceDirectory = parentDirectory;
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    TZ: z.string().default("Asia/Kolkata"),
    APP_URL: z.url().default("http://localhost:3000"),
    AUTH_URL: z.url().optional(),
    DATABASE_URL: z.string().min(1).optional(),
    WORKER_DATABASE_URL: z.string().min(1).optional(),
    AUTH_SECRET: z.string().min(32).optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    VAULT_MASTER_KEY: z.string().optional(),
    OWNER_EMAIL: z.email().optional(),
    AUTH_TRUST_HOST: z.enum(["true", "false"]).default("false"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .superRefine((value, context) => {
    // Runtime configuration is checked when the server handles requests. A production
    // build must remain possible before deploy-time secrets are supplied by the host.
    if (value.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;

    for (const key of ["APP_URL", "DATABASE_URL", "AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OWNER_EMAIL"] as const) {
      if (!value[key]) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required in production.`,
        });
      }
    }

    if (new URL(value.APP_URL).protocol !== "https:") {
      context.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL must use HTTPS in production." });
    }

    if (value.AUTH_TRUST_HOST !== "true") {
      context.addIssue({ code: "custom", path: ["AUTH_TRUST_HOST"], message: "Set AUTH_TRUST_HOST=true only when the app is behind a trusted HTTPS ingress." });
    }
  });

export type ServerEnvironment = z.infer<typeof envSchema>;

export function readServerEnvironment(source: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  return envSchema.parse(source);
}
