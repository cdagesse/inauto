import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import {
  auctionResults,
  externalListings,
  generations,
  jobRuns,
  makes,
  modelAliases,
  models,
} from "@/db/schema";
import { env } from "@/env/server";
import { BudgetExceeded, withBudget } from "@/lib/sources/budget";
import { reconcileDecision } from "@/lib/sources/live";
import {
  createOcdClient,
  matchOcdRules,
  parseOcdAlias,
  type NormalizedLiveRow,
} from "@/lib/sources/ocd";
import { chunk, UPSERT_CHUNK } from "./lib/batch";
import { lastGoodRun } from "./lib/run";
import { liveUpdatedSince, OCD_SWEEP_SHARE } from "./lib/schedule";
import { assignGeneration, type AliasRule, type GenerationRange } from "./lib/normalize";

/**
 * Live auctions sync: pulls in-progress third-party auctions from Old Cars
 * Data into external_listing, marks past-end listings as ended, and settles
 * ended listings against nightly auction results. Every API call is budgeted
 * and its raw response stored (see lib/sources/budget.ts).
 *
 * Dry run (the default) makes no API calls: only the end-time and reconcile
 * steps run, over rows already in the database.
 */
export interface LiveAuctionsOptions {
  dryRun?: boolean;
  log?: (msg: string) => void;
  db?: Db;
  now?: Date;
  /** "all": one pull with no filter. "catalog": one pull per OCD alias in the catalog. */
  scope?: "all" | "catalog";
  fetchImpl?: typeof fetch;
}

export interface LiveAuctionsSummary {
  jobRunId: string | null;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  pulled: number;
  upserted: number;
  matchedToCatalog: number;
  markedEnded: number;
  reconciled: number;
  /** Old Cars Data pages fetched and whether the page cap cut the walk short. */
  pages: number;
  truncated: boolean;
  budgetStopped: string | null;
  /** Why no API walk happened (no key, or a catalog-scoped hand run). */
  skipped: string | null;
  errors: string[];
}

export interface CatalogModel {
  id: string;
  /** Curated generations (code "all" left out) for external listings. */
  gens: GenerationRange[];
  /** Every generation including the catch-all, for auction results. */
  allGens: GenerationRange[];
  /** Model years, from the model or its generations; rows outside them belong to a sibling. */
  years: { start: number | null; end: number | null };
  reportStatus: string;
}

/**
 * Pages per 15-minute live sweep. A 20-minute window is 1 page off-peak and 6 to 7 at peak
 * (610 changed auctions at 15:45 UTC on a Sunday), so 12 leaves room for a busy burst; the
 * cost only rises when there is more to read.
 */
export const LIVE_SWEEP_MAX_PAGES = 12;

export async function loadCatalog(
  db: Db,
): Promise<{ rules: AliasRule[]; byId: Map<string, CatalogModel> }> {
  const rows = await db
    .select({
      id: models.id,
      yearStart: models.yearStart,
      yearEnd: models.yearEnd,
      reportStatus: models.reportStatus,
    })
    .from(models)
    .innerJoin(makes, eq(makes.id, models.makeId));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { rules: [], byId: new Map() };
  const [gens, aliases] = await Promise.all([
    db.select().from(generations).where(inArray(generations.modelId, ids)),
    db
      .select()
      .from(modelAliases)
      .where(and(inArray(modelAliases.modelId, ids), eq(modelAliases.source, "ocd"))),
  ]);
  const byId = new Map<string, CatalogModel>();
  for (const m of rows) {
    const allGens = gens
      .filter((g) => g.modelId === m.id)
      .map((g) => ({
        id: g.id,
        code: g.code,
        yearStart: g.yearStart,
        yearEnd: g.yearEnd,
        disambiguate: g.notes?.startsWith("match:") ? new RegExp(g.notes.slice(6), "i") : undefined,
      }));
    const curated = allGens.filter((g) => g.code !== "all");
    byId.set(m.id, {
      id: m.id,
      gens: curated,
      allGens,
      years: {
        start:
          m.yearStart ?? (allGens.length ? Math.min(...allGens.map((g) => g.yearStart)) : null),
        // The seeded catch-all generation ends at the seed year, so an open-ended model stays open.
        end: m.yearEnd ?? (curated.length ? Math.max(...curated.map((g) => g.yearEnd)) : null),
      },
      reportStatus: m.reportStatus,
    });
  }
  // Most specific first: keyworded aliases (S63) before bare lines (S-Class), then the
  // narrower year span (M3 E46 before the open-ended M3) so a row lands on the narrow model
  // when both would match. matchOcdRules skips rules whose years exclude the row.
  const span = (id: string) => {
    const y = byId.get(id)?.years;
    return (y?.end ?? 9999) - (y?.start ?? 0);
  };
  const rules: AliasRule[] = aliases
    .map((a) => ({
      modelId: a.modelId,
      source: a.source,
      rawMake: a.rawMake,
      rawModel: a.rawModel,
      rawTrimPattern: a.rawTrimPattern,
    }))
    .sort(
      (x, y) =>
        (y.rawTrimPattern?.length ?? 0) - (x.rawTrimPattern?.length ?? 0) ||
        span(x.modelId) - span(y.modelId),
    );
  return { rules, byId };
}

function toInsert(r: NormalizedLiveRow, modelId: string | null, generationId: string | null) {
  return {
    source: r.source,
    sourceName: r.sourceName,
    sourceId: r.sourceId,
    url: r.url,
    status: r.status,
    title: r.title,
    make: r.make,
    model: r.model,
    year: r.year,
    trim: r.trim,
    vin: r.vin,
    miles: r.miles,
    color: r.color,
    location: r.location,
    currency: r.currency,
    country: r.country,
    description: r.description,
    photoUrls: r.photoUrls,
    currentBid: r.currentBid,
    bidCount: r.bidCount,
    reserveMet: r.reserveMet,
    startedAt: r.startedAt ? new Date(r.startedAt) : null,
    endsAt: r.endsAt ? new Date(r.endsAt) : null,
    modelId,
    generationId,
    rawJson: r.raw as object,
    fetchedAt: new Date(),
  };
}

/** `excluded.<col>` for a multi-row upsert: each conflicting row takes its own incoming value. */
const excluded = (col: { name: string }) => sql`excluded.${sql.identifier(col.name)}`;

/**
 * Upsert normalized rows into external_listing, matching each to a catalog model and
 * generation when the alias rules allow. Shared by the live sync and the one-time backfill.
 * Rows go in multi-row INSERT ... ON CONFLICT DO UPDATE statements of UPSERT_CHUNK each; the
 * caller must dedupe on source + sourceId first, since one statement may not touch the same
 * row twice.
 */
export async function upsertExternalRows(
  db: Db,
  rows: NormalizedLiveRow[],
  rules: AliasRule[],
  byId: Map<string, CatalogModel>,
): Promise<{ upserted: number; matched: number }> {
  let matched = 0;
  const values: ReturnType<typeof toInsert>[] = [];
  for (const r of rows) {
    const modelId = matchOcdRules(
      rules,
      { rawMake: r.make, rawModel: r.model, title: r.title, year: r.year },
      (id) => byId.get(id)?.years,
    );
    let generationId: string | null = null;
    if (modelId) {
      matched++;
      const m = byId.get(modelId);
      if (m && m.gens.length > 0)
        generationId = assignGeneration(m.gens, r.year, r.title).generationId;
    }
    values.push(toInsert(r, modelId, generationId));
  }
  const e = externalListings;
  let upserted = 0;
  for (const slice of chunk(values, UPSERT_CHUNK)) {
    await db
      .insert(externalListings)
      .values(slice)
      .onConflictDoUpdate({
        target: [e.source, e.sourceId],
        // Every column reads from `excluded`: a JS value here would stamp one row's data onto
        // every conflicting row in the slice.
        set: {
          url: excluded(e.url),
          status: excluded(e.status),
          title: excluded(e.title),
          make: sql`coalesce(excluded.make, ${e.make})`,
          model: sql`coalesce(excluded.model, ${e.model})`,
          year: excluded(e.year),
          trim: excluded(e.trim),
          vin: sql`coalesce(${e.vin}, excluded.vin)`,
          miles: excluded(e.miles),
          color: excluded(e.color),
          location: excluded(e.location),
          currency: excluded(e.currency),
          country: excluded(e.country),
          description: excluded(e.description),
          photoUrls: excluded(e.photoUrls),
          currentBid: excluded(e.currentBid),
          bidCount: excluded(e.bidCount),
          reserveMet: excluded(e.reserveMet),
          startedAt: excluded(e.startedAt),
          endsAt: excluded(e.endsAt),
          modelId: sql`coalesce(excluded.model_id, ${e.modelId})`,
          generationId: sql`coalesce(excluded.generation_id, ${e.generationId})`,
          rawJson: excluded(e.rawJson),
          fetchedAt: excluded(e.fetchedAt),
        },
      });
    upserted += slice.length;
  }
  return { upserted, matched };
}

/** Pull live auctions within budget. Returns normalized rows; never throws on budget stop. */
async function pull(
  db: Db,
  scope: "all" | "catalog",
  rules: AliasRule[],
  log: (s: string) => void,
  now: Date,
  fetchImpl?: typeof fetch,
): Promise<{
  rows: NormalizedLiveRow[];
  budgetStopped: string | null;
  /** Why no walk happened (no key); the run must not anchor the next window. */
  skipped: string | null;
  /** A non-budget failure mid-walk; rows already pulled are still returned. */
  error: string | null;
  pages: number;
  truncated: boolean;
}> {
  const rows: NormalizedLiveRow[] = [];
  let walk = { pages: 0, truncated: false };
  if (!env.OCD_API_KEY) {
    log("ocd: skipped (no key)");
    return { rows, budgetStopped: null, skipped: "OCD_API_KEY not set", error: null, ...walk };
  }
  try {
    // Sweeps stop at a share of the plan so on-demand report builds keep the rest.
    await withBudget(
      db,
      "ocd",
      Math.floor(env.OCD_MONTHLY_BUDGET * OCD_SWEEP_SHARE),
      async (record) => {
        const client = createOcdClient({
          apiKey: env.OCD_API_KEY!,
          record,
          fetchImpl,
          maxPages: scope === "all" ? LIVE_SWEEP_MAX_PAGES : undefined,
        });
        if (scope === "all") {
          // Everything that changed since the last good sweep (20 minutes to 36 hours back).
          const updatedSince = liveUpdatedSince(await lastGoodRun(db, "live-auctions"), now);
          log(`live: updated since ${updatedSince.toISOString()}`);
          try {
            // `rows` is the client's output, so pages already paid for survive a budget stop.
            await client.live({ updatedSince: updatedSince.toISOString() }, now, rows);
          } finally {
            walk = client.lastWalk();
          }
          return;
        }
        // Catalog scope: one query per distinct make + line (keywords are applied client-side).
        const seen = new Set<string>();
        for (const a of rules) {
          const alias = parseOcdAlias(a);
          const key = `${alias.make}|${alias.model}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push(
            ...(await client.live({ make: alias.make, model: alias.model || undefined }, now)),
          );
        }
      },
      log,
    );
    return { rows, budgetStopped: null, skipped: null, error: null, ...walk };
  } catch (e) {
    if (e instanceof BudgetExceeded) {
      log(`stop: ${e.message}`);
      return { rows, budgetStopped: e.message, skipped: null, error: null, ...walk };
    }
    // Pages already fetched were paid for and stored; hand them back with the failure.
    const error = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
    log(`error: ${error}; keeping ${rows.length} rows already pulled`);
    return { rows, budgetStopped: null, skipped: null, error, ...walk };
  }
}

export async function syncLiveAuctions(
  opts: LiveAuctionsOptions = {},
): Promise<LiveAuctionsSummary> {
  const db = opts.db ?? defaultDb;
  const dryRun = opts.dryRun ?? env.jobsDryRun;
  const now = opts.now ?? new Date();
  const log = opts.log ?? ((m: string) => console.log(`[live-auctions] ${m}`));
  const scope = opts.scope ?? "all";
  const startedAt = now.toISOString();
  const errors: string[] = [];

  let jobRunId: string | null = null;
  try {
    const [jr] = await db
      .insert(jobRuns)
      // Catalog-scoped hand runs keep their own name so they never anchor the "all" sweep window.
      .values({ name: scope === "all" ? "live-auctions" : "live-auctions:catalog", dryRun })
      .returning({ id: jobRuns.id });
    jobRunId = jr?.id ?? null;
  } catch (e) {
    errors.push(`job_run insert: ${(e as Error).message}`);
  }

  let pulled = 0;
  let upserted = 0;
  let matched = 0;
  let markedEnded = 0;
  let reconciled = 0;
  let budgetStopped: string | null = null;
  let pages = 0;
  let truncated = false;
  let skipped: string | null = null;

  try {
    const { rules, byId } = await loadCatalog(db);

    if (!dryRun) {
      const res = await pull(db, scope, rules, log, now, opts.fetchImpl);
      budgetStopped = res.budgetStopped;
      skipped = res.skipped;
      if (res.error) errors.push(`ocd: ${res.error}`);
      pages = res.pages;
      truncated = res.truncated;
      if (truncated)
        log(
          `page cap hit after ${pages} pages; rows beyond it are picked up when they next change or by the backfill job`,
        );
      pulled = res.rows.length;
      // Dedupe within the pull (paging overlap) on source+sourceId, last one wins.
      const uniq = new Map<string, NormalizedLiveRow>();
      for (const r of res.rows) uniq.set(`${r.source}|${r.sourceId}`, r);
      const u = await upsertExternalRows(db, [...uniq.values()], rules, byId);
      upserted = u.upserted;
      matched = u.matched;
    } else {
      log("dry run: no API calls; running end-time and reconcile steps only");
    }

    // Past end time and still live → ended (a nightly result may settle it later).
    const ended = await db
      .update(externalListings)
      .set({ status: "ended" })
      .where(and(eq(externalListings.status, "live"), lt(externalListings.endsAt, now)))
      .returning({ id: externalListings.id });
    markedEnded = ended.length;

    // Settle ended listings against auction_result rows with the same platform + id.
    const pending = await db
      .select({
        id: externalListings.id,
        source: externalListings.source,
        sourceName: externalListings.sourceName,
        sourceId: externalListings.sourceId,
        status: externalListings.status,
      })
      .from(externalListings)
      .where(inArray(externalListings.status, ["ended", "live"]))
      .limit(2000);
    if (pending.length > 0) {
      const ids = [...new Set(pending.map((p) => p.sourceId))];
      const results = await db
        .select({
          source: auctionResults.source,
          sourceId: auctionResults.sourceId,
          status: auctionResults.status,
          hammerPrice: auctionResults.hammerPrice,
        })
        .from(auctionResults)
        .where(inArray(auctionResults.sourceId, ids));
      const bySourceId = new Map<string, typeof results>();
      for (const r of results)
        bySourceId.set(r.sourceId, [...(bySourceId.get(r.sourceId) ?? []), r]);
      for (const p of pending) {
        for (const r of bySourceId.get(p.sourceId) ?? []) {
          const d = reconcileDecision(p, r);
          if (!d) continue;
          await db
            .update(externalListings)
            .set({ status: d.status, finalPrice: d.finalPrice })
            .where(eq(externalListings.id, p.id));
          reconciled++;
          break;
        }
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    log(`error: ${errors[errors.length - 1]}`);
  }

  const summary: LiveAuctionsSummary = {
    jobRunId,
    dryRun,
    startedAt,
    finishedAt: new Date().toISOString(),
    pulled,
    upserted,
    matchedToCatalog: matched,
    markedEnded,
    reconciled,
    pages,
    truncated,
    budgetStopped,
    skipped,
    errors,
  };
  if (jobRunId) {
    try {
      await db
        .update(jobRuns)
        .set({
          finishedAt: new Date(),
          // A budget stop or a skipped walk did not cover its window, so it must not anchor the next one.
          ok: errors.length === 0 && budgetStopped == null && skipped == null,
          summary,
          error: errors[0] ?? budgetStopped ?? skipped ?? null,
          changed: upserted + markedEnded + reconciled,
        })
        .where(eq(jobRuns.id, jobRunId));
    } catch (e) {
      log(`job_run update failed: ${(e as Error).message}`);
    }
  }
  return summary;
}
