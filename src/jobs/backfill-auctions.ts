import "server-only";
import { db as defaultDb, type Db } from "@/db";
import { auctionResults, jobRuns } from "@/db/schema";
import { env } from "@/env/server";
import { BudgetExceeded, withBudget } from "@/lib/sources/budget";
import {
  createOcdClient,
  matchOcdRules,
  normalizeLiveRow,
  type NormalizedLiveRow,
  type OcdAuctionQuery,
} from "@/lib/sources/ocd";
import type { NormalizedAuctionRow } from "@/lib/sources/types";
import { assignGeneration, detectPackages } from "./lib/normalize";
import { type CatalogModel, loadCatalog, upsertExternalRows } from "./live-auctions";

/**
 * One-time bulk pull from Old Cars Data, run by hand through /api/jobs/backfill-auctions:
 *   part=live  every in-progress auction on every platform (all pages, no updated_since)
 *   part=past  every auction that ended in the last `days` days (sold and reserve-not-met),
 *              newest first, into external_listing (the Buy page's Past view) and, for
 *              vehicles the catalog knows, into auction_result (market data).
 * Every page is one budget unit; the walk stops at the budget like every other job.
 */
export interface BackfillOptions {
  db?: Db;
  part: "live" | "past";
  days?: number;
  maxPages?: number;
  concurrency?: number;
  log?: (m: string) => void;
  now?: Date;
  fetchImpl?: typeof fetch;
}

export interface BackfillSummary {
  jobRunId: string | null;
  part: "live" | "past";
  days: number | null;
  startedAt: string;
  finishedAt: string;
  pulled: number;
  upserted: number;
  matchedToCatalog: number;
  auctionResultsInserted: number;
  budgetStopped: string | null;
  errors: string[];
}

/** An ended /auctions row re-read as an external listing row, with the settled status and hammer. */
function endedToExternal(r: NormalizedAuctionRow, now: Date): NormalizedLiveRow | null {
  const live = normalizeLiveRow(r.raw, now);
  if (!live) return null;
  return {
    ...live,
    status: r.status,
    currentBid: r.hammerPrice ?? live.currentBid,
    endsAt: r.endedAt ?? live.endsAt,
    vin: r.vin ?? live.vin,
    year: r.year ?? live.year,
    miles: r.miles ?? live.miles,
  };
}

function toAuctionInsert(m: CatalogModel, r: NormalizedAuctionRow) {
  const g = assignGeneration(m.gens, r.year, r.title);
  return {
    source: r.source,
    sourceId: r.sourceId,
    url: r.url,
    vin: r.vin,
    generationId: g.generationId,
    modelId: m.id,
    year: r.year,
    miles: r.miles,
    hammerPrice: r.hammerPrice,
    status: r.status,
    endedAt: r.endedAt ? new Date(r.endedAt) : null,
    packages: detectPackages(r.title),
    needsReview: g.needsReview || r.needsReview,
    rawJson: r.raw as object,
  };
}

export async function backfillAuctions(opts: BackfillOptions): Promise<BackfillSummary> {
  const db = opts.db ?? defaultDb;
  const now = opts.now ?? new Date();
  const log = opts.log ?? ((m: string) => console.log(`[backfill-auctions] ${m}`));
  const days = opts.part === "past" ? Math.max(1, Math.min(opts.days ?? 30, 90)) : null;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 8, 16));
  const out: BackfillSummary = {
    jobRunId: null,
    part: opts.part,
    days,
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
    pulled: 0,
    upserted: 0,
    matchedToCatalog: 0,
    auctionResultsInserted: 0,
    budgetStopped: null,
    errors: [],
  };
  if (!env.OCD_API_KEY) {
    out.errors.push("OCD_API_KEY not set");
    return out;
  }
  try {
    const [jr] = await db
      .insert(jobRuns)
      .values({ name: `backfill-auctions:${opts.part}`, dryRun: false })
      .returning({ id: jobRuns.id });
    out.jobRunId = jr?.id ?? null;
  } catch (e) {
    out.errors.push(`job_run insert: ${(e as Error).message}`);
  }

  try {
    const { rules, byId } = await loadCatalog(db);
    const liveRows: NormalizedLiveRow[] = [];
    const endedRows: NormalizedAuctionRow[] = [];
    try {
      await withBudget(
        db,
        "ocd",
        env.OCD_MONTHLY_BUDGET,
        async (record) => {
          const client = createOcdClient({
            apiKey: env.OCD_API_KEY!,
            record,
            fetchImpl: opts.fetchImpl,
            maxPages: opts.maxPages ?? 150,
          });
          if (opts.part === "live") {
            liveRows.push(...(await client.live({}, now)));
          } else {
            const since = new Date(now.getTime() - days! * 86_400_000).toISOString();
            endedRows.push(...(await client.auctions({} as OcdAuctionQuery, since)));
          }
        },
        log,
      );
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        out.budgetStopped = e.message;
        log(`stop: ${e.message}`);
      } else throw e;
    }

    // Past: rows the catalog recognises also feed auction_result for market data.
    if (opts.part === "past") {
      const inserts: ReturnType<typeof toAuctionInsert>[] = [];
      for (const r of endedRows) {
        const modelId = matchOcdRules(rules, {
          rawMake: r.rawMake,
          rawModel: r.rawModel,
          title: r.title,
        });
        const m = modelId ? byId.get(modelId) : null;
        if (m) inserts.push(toAuctionInsert(m, r));
        const ext = endedToExternal(r, now);
        if (ext) liveRows.push(ext);
      }
      for (let i = 0; i < inserts.length; i += 200) {
        const chunk = inserts.slice(i, i + 200);
        const res = await db
          .insert(auctionResults)
          .values(chunk)
          .onConflictDoNothing({ target: [auctionResults.source, auctionResults.sourceId] })
          .returning({ id: auctionResults.id });
        out.auctionResultsInserted += res.length;
      }
    }

    // Dedupe on source+id (paging overlap), then upsert with modest parallelism.
    const uniq = new Map<string, NormalizedLiveRow>();
    for (const r of liveRows) uniq.set(`${r.source}|${r.sourceId}`, r);
    const rows = [...uniq.values()];
    out.pulled = rows.length;
    for (let i = 0; i < rows.length; i += concurrency) {
      const results = await Promise.all(
        rows.slice(i, i + concurrency).map((r) => upsertExternalRows(db, [r], rules, byId)),
      );
      for (const u of results) {
        out.upserted += u.upserted;
        out.matchedToCatalog += u.matched;
      }
    }
    log(
      `${opts.part}: pulled ${out.pulled}, upserted ${out.upserted}, matched ${out.matchedToCatalog}, auction_result +${out.auctionResultsInserted}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    out.errors.push(msg);
    log(`error: ${msg}`);
  }
  out.finishedAt = new Date().toISOString();
  return out;
}
