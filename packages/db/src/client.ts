import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

// Creating the pool is lazy: Next.js can build without connecting to PostgreSQL.
// API/auth requests still require a configured DATABASE_URL and a migrated DB.
export const pool = new Pool(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {},
);

export const db = drizzle(pool, { schema });
