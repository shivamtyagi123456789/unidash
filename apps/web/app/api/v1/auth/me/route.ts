import { getAppSession } from "../../../../../lib/session";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const currentUserSchema = z.object({
  id: z.string().uuid(),
  email: z.email(),
  name: z.string(),
  role: z.enum(["OWNER", "MEMBER"]),
  featureFlags: z.object({
    ams: z.boolean(),
    moodle: z.boolean(),
    whatsapp: z.boolean(),
  }).strict(),
}).strict();

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const current = await getAppSession(request.headers);
  const requestId = randomUUID();

  if (!current) {
    return Response.json(
      { error: { code: "AUTH_REQUIRED", message: "Sign in to continue.", requestId } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const user = currentUserSchema.parse({
    id: current.user.id,
    email: current.user.email,
    name: current.user.name ?? current.user.email,
    role: current.user.role,
    featureFlags: { ams: false, moodle: false, whatsapp: false },
  });

  return Response.json(user, { headers: { "Cache-Control": "no-store" } });
}
