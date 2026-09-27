import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import { listings, serviceOrders, users } from "@/db/schema";
import { env } from "@/env/server";
import { fetchTitleReportRaw, parseTitleReport, VituError } from "@/lib/sources/vitu";
import {
  createMvrInquiry,
  loadUnifiedRecord,
  stateFromLocation,
  summarizeMvr,
  type MvrSummary,
} from "@/lib/sources/vitu-mvr";

export interface TitleVettingSummary {
  processed: { id: string; step: string; verdict?: string }[];
  skipped: string | null;
  errors: string[];
}

interface OrderRow {
  id: string;
  vin: string | null;
  listingId: string | null;
  location: string | null;
  sellerLegalName: string | null;
  sellerName: string | null;
  details: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  status: string;
}

type MvrState = {
  refNumber: string;
  inquiryId: number | null;
  state: string;
  createdAt: string;
  lastError?: string;
};

const isVin = (v: string) => /^[A-HJ-NPR-Z0-9]{11,17}$/.test(v);

/**
 * Fulfils title-vetting orders through Vitu, in two independent parts:
 *  - NMVTIS title report (brands, theft, liens) when VITU_TITLE_PATH is set;
 *  - MVR inquiry (live DMV record: registered owner, lienholder, registration)
 *    when VITU_MVR_ENABLED, created once and then read back on later runs
 *    (or when the Vitu notification webhook fires) until it is processed.
 * An order completes when every configured part has a result. A clean NMVTIS
 * (or, without NMVTIS, a verified MVR) marks the listing title-vetted.
 */
export async function runTitleVetting(
  opts: { db?: Db; limit?: number; log?: (m: string) => void; onlyOrderId?: string } = {},
): Promise<TitleVettingSummary> {
  const db = opts.db ?? defaultDb;
  const log = opts.log ?? ((m: string) => console.log(`[title-vetting] ${m}`));
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 50));
  const out: TitleVettingSummary = { processed: [], skipped: null, errors: [] };
  const cfg = env.vitu;
  const nmvtis = !!cfg?.titlePath;
  const mvr = !!cfg?.mvr;
  if (!cfg || (!nmvtis && !mvr)) {
    out.skipped =
      "Vitu not configured (set VITU_CLIENT_ID/SECRET plus VITU_TITLE_PATH and/or VITU_MVR_ENABLED)";
    log(out.skipped);
    return out;
  }

  const rows: OrderRow[] = (await db
    .select({
      id: serviceOrders.id,
      vin: sql<string | null>`coalesce(${serviceOrders.vin}, ${listings.vin})`,
      listingId: serviceOrders.listingId,
      location: listings.location,
      sellerLegalName: sql<string | null>`${listings.sellerDetails}->>'legalName'`,
      sellerName: users.name,
      details: serviceOrders.details,
      result: serviceOrders.result,
      status: serviceOrders.status,
    })
    .from(serviceOrders)
    .leftJoin(listings, eq(listings.id, serviceOrders.listingId))
    .leftJoin(users, eq(users.id, listings.sellerId))
    .where(
      and(
        eq(serviceOrders.kind, "title_vetting"),
        opts.onlyOrderId
          ? eq(serviceOrders.id, opts.onlyOrderId)
          : sql`${serviceOrders.status} in ('requested', 'in_progress')`,
        sql`coalesce(${serviceOrders.details}->>'automated', '') <> 'off'`,
      ),
    )
    .orderBy(serviceOrders.createdAt)
    .limit(limit)) as OrderRow[];

  for (const o of rows) {
    const vin = (o.vin ?? "").trim().toUpperCase();
    if (!isVin(vin)) {
      log(`skip ${o.id}: no usable VIN`);
      continue;
    }
    const details: Record<string, unknown> = { ...(o.details ?? {}) };
    const result: Record<string, unknown> = { ...(o.result ?? {}) };
    let touched = false;

    // Part 1: NMVTIS title report.
    if (nmvtis && !result.summary) {
      try {
        const raw = await fetchTitleReportRaw({ ...cfg, titlePath: cfg.titlePath! }, vin);
        const summary = parseTitleReport(raw, vin);
        details.report = raw;
        result.summary = summary;
        result.vetted = summary.verdict === "clean";
        touched = true;
        out.processed.push({ id: o.id, step: "nmvtis", verdict: summary.verdict });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        out.errors.push(`${o.id} nmvtis: ${msg}`);
        log(`error ${o.id} nmvtis: ${msg}`);
        if (e instanceof VituError && e.step === "token") break;
      }
    }

    // Part 2: MVR inquiry, created once, then read back until processed.
    if (mvr) {
      const state = stateFromLocation(o.location);
      const mvrState = (details.mvr as MvrState | undefined) ?? null;
      if (!mvrState) {
        if (!state) {
          log(`skip mvr ${o.id}: no state in listing location`);
        } else {
          try {
            const refNumber = randomUUID();
            const created = await createMvrInquiry(
              { ...cfg, ...cfg.mvr! },
              { state, vin, refNumber },
            );
            details.mvr = {
              refNumber,
              inquiryId: created.inquiryId,
              state,
              createdAt: new Date().toISOString(),
            } satisfies MvrState;
            details.mvrCreateResponse = created.raw;
            touched = true;
            out.processed.push({ id: o.id, step: "mvr-created" });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            out.errors.push(`${o.id} mvr create: ${msg}`);
            log(`error ${o.id} mvr create: ${msg}`);
            if (e instanceof VituError && e.step === "token") break;
          }
        }
      } else if (!result.mvr && mvrState.inquiryId != null && cfg.mvr!.unifiedPath) {
        try {
          const record = await loadUnifiedRecord({ ...cfg, ...cfg.mvr! }, mvrState.inquiryId);
          const summary: MvrSummary = summarizeMvr(record, {
            vin,
            state: mvrState.state,
            refNumber: mvrState.refNumber,
            inquiryId: mvrState.inquiryId,
            sellerName: o.sellerLegalName ?? o.sellerName,
          });
          if (summary.processed) {
            details.mvrRecord = record;
            result.mvr = summary;
            touched = true;
            out.processed.push({ id: o.id, step: "mvr", verdict: summary.verdict });
          } else {
            log(`${o.id} mvr still pending`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          out.errors.push(`${o.id} mvr read: ${msg}`);
          log(`error ${o.id} mvr read: ${msg}`);
        }
      }
    }

    const nmvtisDone = !nmvtis || !!result.summary;
    const mvrDone = !mvr || !!result.mvr || !stateFromLocation(o.location);
    const complete = nmvtisDone && mvrDone;
    if (touched || (complete && o.status !== "complete")) {
      const s = result.summary as { verdict?: string; flags?: string[] } | undefined;
      const m = result.mvr as MvrSummary | undefined;
      const vetted = nmvtis ? s?.verdict === "clean" : m?.verdict === "verified";
      const notes = [
        s ? `NMVTIS ${s.verdict}${s.flags?.length ? ` (${s.flags.join("; ")})` : ""}` : null,
        m ? `MVR ${m.verdict}${m.flags.length ? ` (${m.flags.join("; ")})` : ""}` : null,
      ].filter(Boolean);
      await db
        .update(serviceOrders)
        .set({
          status: complete ? "complete" : "in_progress",
          details,
          result: { ...result, vetted, source: "vitu" },
          ...(complete
            ? { reviewedAt: new Date(), reviewNote: `Automated Vitu checks: ${notes.join(" · ")}` }
            : {}),
        })
        .where(eq(serviceOrders.id, o.id));
      if (complete && o.listingId && vetted)
        await db.update(listings).set({ titleVetted: true }).where(eq(listings.id, o.listingId));
    }
  }
  return out;
}
