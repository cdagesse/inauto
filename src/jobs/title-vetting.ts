import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import { listings, serviceOrders } from "@/db/schema";
import { env } from "@/env/server";
import { fetchTitleReportRaw, parseTitleReport, VituError } from "@/lib/sources/vitu";

export interface TitleVettingSummary {
  processed: { id: string; vin: string; verdict: string }[];
  skipped: string | null;
  errors: string[];
}

/**
 * Runs Vitu title checks for requested title-vetting orders. Each order's
 * VIN comes from the order, else from the linked listing. The raw report is
 * kept in details.report, our summary in result.summary; the order moves to
 * complete and a clean result marks the listing title-vetted. Orders without
 * a VIN, or when Vitu is not configured, are left alone for an admin.
 */
export async function runTitleVetting(
  opts: { db?: Db; limit?: number; log?: (m: string) => void } = {},
): Promise<TitleVettingSummary> {
  const db = opts.db ?? defaultDb;
  const log = opts.log ?? ((m: string) => console.log(`[title-vetting] ${m}`));
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 50));
  const out: TitleVettingSummary = { processed: [], skipped: null, errors: [] };
  const cfg = env.vitu;
  if (!cfg || !cfg.titlePath) {
    out.skipped = "Vitu not configured (VITU_CLIENT_ID/SECRET and VITU_TITLE_PATH)";
    log(out.skipped);
    return out;
  }
  const queue = await db
    .select({
      id: serviceOrders.id,
      vin: sql<string | null>`coalesce(${serviceOrders.vin}, ${listings.vin})`,
      listingId: serviceOrders.listingId,
      details: serviceOrders.details,
    })
    .from(serviceOrders)
    .leftJoin(listings, eq(listings.id, serviceOrders.listingId))
    .where(
      and(
        eq(serviceOrders.kind, "title_vetting"),
        eq(serviceOrders.status, "requested"),
        or(isNull(serviceOrders.result), sql`${serviceOrders.result}->'summary' is null`),
      ),
    )
    .orderBy(serviceOrders.createdAt)
    .limit(limit);

  for (const o of queue) {
    const vin = (o.vin ?? "").trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) {
      log(`skip ${o.id}: no usable VIN`);
      continue;
    }
    try {
      const raw = await fetchTitleReportRaw({ ...cfg, titlePath: cfg.titlePath }, vin);
      const summary = parseTitleReport(raw, vin);
      const details = {
        ...((o.details as Record<string, unknown> | null) ?? {}),
        report: raw,
        source: "vitu",
      };
      await db
        .update(serviceOrders)
        .set({
          status: "complete",
          result: { vetted: summary.verdict === "clean", summary, source: "vitu" },
          details,
          reviewedAt: new Date(),
          reviewNote: `Automated Vitu title check: ${summary.verdict}${summary.flags.length ? ` (${summary.flags.join("; ")})` : ""}`,
        })
        .where(eq(serviceOrders.id, o.id));
      if (o.listingId && summary.verdict === "clean")
        await db.update(listings).set({ titleVetted: true }).where(eq(listings.id, o.listingId));
      out.processed.push({ id: o.id, vin, verdict: summary.verdict });
      log(`${o.id} ${vin}: ${summary.verdict}`);
    } catch (e) {
      const msg = e instanceof VituError ? e.message : e instanceof Error ? e.message : String(e);
      out.errors.push(`${o.id}: ${msg}`);
      log(`error ${o.id}: ${msg}`);
      if (e instanceof VituError && e.step === "token") break; // no point continuing without a token
    }
  }
  return out;
}
