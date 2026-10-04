import { getAppSession } from "../../../../lib/session";
import { db } from "@unidash/db/client";
import { integrations } from "@unidash/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { logger } from "../../../../lib/logger";

const integrationSchema = z.object({
  kind: z.enum(["AMS", "MOODLE"]),
  status: z.enum(["NOT_CONNECTED", "READY", "SYNCING", "NEEDS_REAUTH", "PAUSED", "ERROR"]),
  lastSuccessAt: z.iso.datetime().nullable(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  connected: z.boolean(),
}).strict();

const integrationsResponseSchema = z.object({ items: z.array(integrationSchema) }).strict();

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

  try {
    const rows = await db
      .select({
        kind: integrations.kind,
        status: integrations.status,
        lastSuccessAt: integrations.lastSuccessAt,
        lastErrorCode: integrations.lastErrorCode,
        lastErrorMessage: integrations.lastErrorMessage,
        connected: integrations.status,
      })
      .from(integrations)
      .where(eq(integrations.userId, current.user.id));

    const byKind = new Map(rows.map((row) => [row.kind, row]));
    const items = (["AMS", "MOODLE"] as const).map((kind) => {
      const row = byKind.get(kind);
      return {
        kind,
        status: row?.status ?? "NOT_CONNECTED",
        lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
        lastErrorCode: row?.lastErrorCode ?? null,
        lastErrorMessage: row?.lastErrorMessage ?? null,
        connected: row?.connected === "READY",
      };
    });

    const response = integrationsResponseSchema.parse({ items });
    return Response.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch {
    logger.error({ requestId }, "Failed to read integration status");
    return Response.json(
      { error: { code: "INTERNAL", message: "Could not load integration status.", requestId } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
