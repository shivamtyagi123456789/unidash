import dotenv from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  // Generation reads the schema only. Applying migrations still needs a real DATABASE_URL.
  dbCredentials: { url: databaseUrl ?? "postgresql://unidash:local-placeholder@127.0.0.1:5432/unidash" },
});
