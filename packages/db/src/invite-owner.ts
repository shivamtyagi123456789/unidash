import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
  throw new Error("Set OWNER_EMAIL to the account that should own this UniDash instance.");
}

const [{ db, pool }, { allowedEmails }] = await Promise.all([
  import("./client"),
  import("./schema"),
]);

try {
  await db
    .insert(allowedEmails)
    .values({ email: ownerEmail, role: "OWNER" })
    .onConflictDoUpdate({
      target: allowedEmails.email,
      set: { role: "OWNER", revokedAt: null },
    });

  process.stdout.write("Owner invite configured.\n");
} finally {
  await pool.end();
}
