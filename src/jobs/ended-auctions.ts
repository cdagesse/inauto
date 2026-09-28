import "server-only";
import { db as defaultDb, type Db } from "@/db";
import { env } from "@/env/server";
import { BudgetExceeded, withBudget } from "@/lib/sources/budget";
import { createOcdClient, type OcdAuctionQuery } from "@/lib/sources/ocd";
import type { NormalizedAuctionRow } from "@/lib/sources/types";
import { ingestEndedAuctions } from "./ended-ingest";
import { lastGoodRun } from "./lib/run";
import { endedSince } from "./lib/schedule";
import { loadCatalog } from "./live-auctions";

export const ENDED_SWEEP_JOB = "ended-auctions";

/** Pages per status per run. Auctions close at roughly 250 a day, so a 6-hour window is 1 page. */
export const ENDED_SWEEP_MAX_PAGES = 10;

export interface EndedSweepOptions {
  db?: Db;
  now?: Date;
  dryRun?: boolean;
  /** Overrides the window derived from the last good run. */
  since?: Date;
  maxPages?: number;
  log?: (m: string) => void;
  fetchImpl?: typeof fetch;
}

export interface EndedSweepSummary {
  since: string;
  pulled: number;
  upserted: number;
  matchedToCatalog: number;
  auctionResultsInserted: number;
  budgetStopped: string | null;
  skipped: string | null;
  errors: string[];
}

/**
 * Every 6 hours: auctions that closed since the last good sweep, from every platform Old
 * Cars Data covers. Final price and status land on the Buy page's Past view within hours,
 * and catalog vehicles feed auction_result for the market reports. The walk is newest
 * first and stops at the window, so a run is normally one page per status.
 */
export async function sweepEndedAuctions(opts: EndedSweepOptions = {}): Promise<EndedSweepSummary> {
  const db = opts.db ?? defaultDb;
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? env.jobsDryRun;
  const log = opts.log ?? ((m: string) => console.log(`[ended-auctions] ${m}`));
  const since = opts.since ?? endedSince(await lastGoodRun(db, ENDED_SWEEP_JOB), now);
  const out: EndedSweepSummary = {
    since: since.toISOString(),
    pulled: 0,
    upserted: 0,
    matchedToCatalog: 0,
    auctionResultsInserted: 0,
    budgetStopped: null,
    skipped: null,
    errors: [],
  };
  if (dryRun) {
    out.skipped = "dry run";
    log("dry run: no API calls");
    return out;
  }
  if (!env.OCD_API_KEY) {
    out.skipped = "OCD_API_KEY not set";
    return out;
  }
  try {
    const { rules, byId } = await loadCatalog(db);
    const rows: NormalizedAuctionRow[] = [];
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
            maxPages: opts.maxPages ?? ENDED_SWEEP_MAX_PAGES,
          });
          rows.push(...(await client.auctions({} as OcdAuctionQuery, out.since)));
        },
        log,
      );
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        out.budgetStopped = e.message;
        log(`stop: ${e.message}`);
      } else throw e;
    }
    out.pulled = rows.length;
    const ing = await ingestEndedAuctions(db, rows, rules, byId, now);
    out.upserted = ing.upserted;
    out.matchedToCatalog = ing.matched;
    out.auctionResultsInserted = ing.auctionResultsInserted;
    log(
      `since ${out.since}: pulled ${out.pulled}, upserted ${out.upserted}, matched ${out.matchedToCatalog}, auction_result +${out.auctionResultsInserted}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    out.errors.push(msg.replace(/\s+/g, " ").slice(0, 300));
    log(`error: ${msg}`);
  }
  return out;
}
