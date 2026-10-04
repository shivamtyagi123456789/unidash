import { and, eq, isNull } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "@unidash/db/client";
import { allowedEmails, sessions, users } from "@unidash/db/schema";

export async function getAppSession(requestHeaders: Headers) {
  const current = await auth.api.getSession({ headers: requestHeaders });
  if (!current?.user) return null;

  const userId = current.user.id;
  const normalizedEmail = current.user.email.trim().toLowerCase();
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const [invite] = await db
    .select({ role: allowedEmails.role })
    .from(allowedEmails)
    .where(and(eq(allowedEmails.email, normalizedEmail), isNull(allowedEmails.revokedAt)))
    .limit(1);

  if (!invite) {
    await db.delete(sessions).where(eq(sessions.token, current.session.token));
    return null;
  }

  if (user.email !== normalizedEmail || user.role !== invite.role) {
    await db.update(users).set({ email: normalizedEmail, role: invite.role, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  return {
    user: { ...user, email: normalizedEmail, role: invite.role },
    session: current.session,
  };
}
