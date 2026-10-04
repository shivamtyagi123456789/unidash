import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@unidash/db/client";
import { integrations, portalScans } from "@unidash/db/schema";
import { getAppSession } from "../../../../../lib/session";
import { hasValidCsrf } from "../../../../../lib/csrf";

export const dynamic = "force-dynamic";
const fieldSchema = z.record(z.string().max(100), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])).default({});
const recordSchema = z.object({
  key: z.string().min(1).max(300), type: z.string().max(80).default("record"),
  section: z.string().max(100).default("Other"), title: z.string().max(500), fields: fieldSchema,
}).passthrough();
const reportSchema = z.object({
  source: z.enum(["ams", "moodle"]), label: z.string().max(120).optional(), trusted: z.boolean(),
  baseline: z.boolean().optional(), added: z.array(z.unknown()).max(1000).optional(),
  modified: z.array(z.unknown()).max(1000).optional(), removed: z.array(z.unknown()).max(1000).optional(),
  unchangedCount: z.number().int().min(0).max(10000).optional(), recordCount: z.number().int().min(0).max(10000),
  warnings: z.array(z.string().max(500)).max(100).default([]),
  sections: z.record(z.string().max(100), z.object({ ok: z.boolean(), count: z.number().int().min(0).max(10000), skipped: z.boolean().optional(), error: z.string().max(500).optional() }).passthrough()).default({}),
  records: z.array(recordSchema).max(1000).default([]),
}).passthrough().refine((report) => Object.keys(report.sections).length > 0, "A scan must include at least one checked section.");
const bodySchema = z.object({
  scanId: z.string().min(1).max(100), finishedAt: z.number().int().positive(),
  reports: z.array(reportSchema).max(2), errors: z.array(z.object({ portal: z.string().max(40), error: z.string().max(500) }).passthrough()).max(10).default([]),
}).strict();

function error(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to load portal scan history.", requestId);
  try {
    const rows = await db.select({ source: portalScans.source, scanId: portalScans.scanId, finishedAt: portalScans.finishedAt, trusted: portalScans.trusted, report: portalScans.report })
      .from(portalScans).where(eq(portalScans.userId, session.user.id)).orderBy(desc(portalScans.finishedAt)).limit(20);
    return Response.json({ items: rows.map((row) => ({ ...row, finishedAt: row.finishedAt.toISOString() })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return error(500, "INTERNAL", "Could not load portal scan history.", requestId); }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const session = await getAppSession(request.headers);
  if (!session) return error(401, "AUTH_REQUIRED", "Sign in to save a portal scan.", requestId);
  if (!hasValidCsrf(request)) return error(403, "FORBIDDEN", "The request could not be verified.", requestId);
  const raw = await request.text().catch(() => "");
  if (raw.length > 1_000_000) return error(413, "PAYLOAD_TOO_LARGE", "The portal scan is too large to save.", requestId);
  const parsedJson: unknown = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  const parsed = bodySchema.safeParse(parsedJson);
  if (!parsed.success) return error(400, "VALIDATION_FAILED", "The extension scan has invalid or incomplete data.", requestId);
  const finishedAt = new Date(parsed.data.finishedAt);
  if (finishedAt.getTime() > Date.now() + 5 * 60_000 || finishedAt.getTime() < Date.now() - 30 * 24 * 60 * 60_000) {
    return error(400, "VALIDATION_FAILED", "The scan timestamp is outside the accepted range.", requestId);
  }

  try {
    const saved = await db.transaction(async (tx) => {
      const items = [];
      for (const rawReport of parsed.data.reports) {
        const source = rawReport.source.toUpperCase() as "AMS" | "MOODLE";
        // Portal links can carry session-bearing query strings. Never persist extension URLs.
        const report = {
          label: rawReport.label ?? (source === "AMS" ? "AMS" : "Moodle"),
          trusted: rawReport.trusted, baseline: Boolean(rawReport.baseline),
          recordCount: rawReport.recordCount, unchangedCount: rawReport.unchangedCount ?? null,
          addedCount: rawReport.added?.length ?? 0, changedCount: rawReport.modified?.length ?? 0, removedCount: rawReport.removed?.length ?? 0,
          warnings: rawReport.warnings,
          sections: rawReport.sections,
          records: rawReport.records.map((record) => ({ key: record.key, type: record.type, section: record.section, title: record.title, fields: record.fields })),
        };
        await tx.insert(portalScans).values({ userId: session.user.id, source, scanId: parsed.data.scanId, finishedAt, trusted: rawReport.trusted, report })
          .onConflictDoUpdate({ target: [portalScans.userId, portalScans.source, portalScans.scanId], set: { finishedAt, trusted: rawReport.trusted, report } });
        const [current] = await tx.select({ id: integrations.id, status: integrations.status, lastSuccessAt: integrations.lastSuccessAt }).from(integrations)
          .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, source))).limit(1);
        const successful = rawReport.trusted && Object.keys(rawReport.sections).length > 0
          && Object.values(rawReport.sections).every((section) => section.ok || section.skipped);
        const values = {
          status: successful || current?.status === "READY" ? "READY" as const : "ERROR" as const,
          lastSuccessAt: successful ? finishedAt : current?.lastSuccessAt ?? null,
          lastErrorCode: successful ? null : "SCAN_NEEDS_REVIEW",
          lastErrorMessage: successful ? null : rawReport.warnings[0] ?? "Review the incomplete portal scan before relying on it.",
          metadata: { method: "browser_extension" }, updatedAt: new Date(),
        };
        if (current) await tx.update(integrations).set(values).where(eq(integrations.id, current.id));
        else await tx.insert(integrations).values({ userId: session.user.id, kind: source, ...values });
        items.push({ source, trusted: successful });
      }
      return items;
    });
    return Response.json({ saved: true, items: saved }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return error(500, "SCAN_SAVE_FAILED", "Could not save this portal scan. Retry the scan from the dashboard.", requestId); }
}
