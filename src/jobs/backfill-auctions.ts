import "server-only";
import { eq } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import { jobRuns } from "@/db/schema";
import { env } from "@/env/server";
import { BudgetExceeded, withBudget } from "@/lib/sources/budget";
import { createOcdClient, type NormalizedLiveRow, type OcdAuctionQuery } from "@/lib/sources/ocd";
import type { NormalizedAuctionRow } from "@/lib/sources/types";
import { ingestEndedAuctions } from "./ended-ingest";
import { loadCatalog, upsertExternalRows } from "./live-auctions";

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

export async function backfillAuctions(opts: BackfillOptions): Promise<BackfillSummary> {
  const db = opts.db ?? defaultDb;
  const now = opts.now ?? new Date();
  const log = opts.log ?? ((m: string) => console.log(`[backfill-auctions] ${m}`));
  const days = opts.part === "past" ? Math.max(1, Math.min(opts.days ?? 30, 90)) : null;
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

    if (opts.part === "past") {
      // Ended rows feed external_listing (Past view) and, for catalog vehicles, auction_result.
      out.pulled = endedRows.length;
      const ing = await ingestEndedAuctions(db, endedRows, rules, byId, now);
      out.upserted = ing.upserted;
      out.matchedToCatalog = ing.matched;
      out.auctionResultsInserted = ing.auctionResultsInserted;
    } else {
      // Dedupe on source+id (paging overlap; also required by the multi-row upsert).
      const uniq = new Map<string, NormalizedLiveRow>();
      for (const r of liveRows) uniq.set(`${r.source}|${r.sourceId}`, r);
      const rows = [...uniq.values()];
      out.pulled = rows.length;
      const u = await upsertExternalRows(db, rows, rules, byId);
      out.upserted = u.upserted;
      out.matchedToCatalog = u.matched;
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
  if (out.jobRunId) {
    try {
      await db
        .update(jobRuns)
        .set({
          finishedAt: new Date(out.finishedAt),
          ok: out.errors.length === 0,
          summary: out,
          error: out.errors[0] ?? null,
          changed: out.upserted + out.auctionResultsInserted,
        })
        .where(eq(jobRuns.id, out.jobRunId));
    } catch (e) {
      log(`job_run update failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}
