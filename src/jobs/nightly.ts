import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import {
  auctionResults,
  carViews,
  dealerActive,
  dealerSales,
  generations,
  jobRuns,
  makes,
  marketDaily,
  modelAliases,
  models,
  rawFetches,
} from "@/db/schema";
import { env } from "@/env/server";
import { BudgetExceeded, callsUsed, withBudget } from "@/lib/sources/budget";
import { createOcdClient, ocdRowMatches, parseOcdAlias } from "@/lib/sources/ocd";
import { createVisorClient } from "@/lib/sources/visor";
import type { NormalizedAuctionRow, NormalizedDealerRow } from "@/lib/sources/types";
import { classify, groupReclassified, type Reclassified } from "./lib/clean";
import { runChecks, type CheckInput, type CheckWarning } from "./lib/check";
import { pruneInBatches, RETENTION_DAYS } from "./lib/retention";
import {
  pickRotation,
  soldWindowDays,
  VISOR_ROTATION_SHARE,
  visorNightAllowance,
} from "./lib/schedule";
import {
  assignGeneration,
  detectPackages,
  detectPts,
  matchAlias,
  type AliasRule,
  type GenerationRange,
} from "./lib/normalize";
import { aggregate, median } from "./lib/stats";

export interface NightlyOptions {
  dryRun?: boolean;
  log?: (msg: string) => void;
  db?: Db;
  now?: Date;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Restrict the run to these model slugs (used by on-demand report builds). */
  modelSlugs?: string[];
  /**
   * First pull for a model: Visor sold window widens to `initialSoldDays` (default 365) and
   * Old Cars Data walks back without a cursor (to the page cap). Used by report builds.
   */
  initial?: boolean;
  /** Visor `sold_within_days` for a routine run; per model the rotation widens it to cover the gap since its last pull. */
  soldWindowDays?: number;
  initialSoldDays?: number;
  /** Every model is refreshed about this often (default env VISOR_REFRESH_DAYS). */
  refreshDays?: number;
  /** Stop starting new models after this long (default PULL_TIME_BUDGET_MS). */
  timeBudgetMs?: number;
}

/** What a full nightly did with its slice of the catalog. Absent on report builds. */
export interface RotationSummary {
  refreshDays: number;
  /** Ready or building models the rotation cycles through. */
  eligible: number;
  /** Models picked for tonight. */
  due: number;
  /** Models whose Visor pull finished and were stamped. */
  pulled: number;
  /** Models left when the time cap hit; they lead the next night. */
  remaining: number;
  /** Models whose last pull is older than refreshDays. */
  overdue: number;
  /** Models outside the slice re-cleaned because the sweeps gave them new auction rows. */
  cleaned: number;
  /** Models whose Visor pull failed (they stay due and are retried). */
  failed: number;
  /** Visor calls spent tonight and the allowance they were held to. */
  visorCalls: number;
  allowance: number;
  /** The Visor month share was spent, so pulling stopped. */
  budgetStopped: boolean;
}

export interface ModelSummary {
  model: string;
  visorSold: number;
  visorActive: number;
  ocdAuctions: number;
  unmatchedRows: number;
  needsReview: number;
  excluded: Record<string, number>;
  generationsAggregated: string[];
  warnings: CheckWarning[];
  budgetStopped: string[];
  /** Source failures for this model (status + short detail, never a key). The other source still runs. */
  errors: string[];
  /** Rows actually written; duplicates skipped by ON CONFLICT DO NOTHING are not counted. 0 on dry runs. */
  inserted: { sold: number; active: number; auctions: number };
  /** Visor API calls this model cost. */
  visorCalls: number;
}

/** Rows removed by the retention pass, per table. Absent on dry runs and on-demand report builds. */
export interface RetentionSummary {
  rawFetch: number;
  carView: number;
  jobRun: number;
}

export interface NightlySummary {
  jobRunId: string | null;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  models: ModelSummary[];
  errors: string[];
  pruned?: RetentionSummary;
  rotation?: RotationSummary;
}

const DAY = 86_400_000;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
/** Vercel kills the function at 300 s; leave room for cleaning, retention and the snapshot rebuild. */
const PULL_TIME_BUDGET_MS = 150_000;
const CLEAN_TIME_BUDGET_MS = 45_000;

interface CatalogModel {
  id: string;
  slug: string;
  makeName: string;
  makeSlug: string;
  name: string;
  reportStatus: string;
  yearStart: number | null;
  yearEnd: number | null;
  dealerPulledAt: Date | null;
  gens: GenerationRange[];
  aliases: AliasRule[];
}

async function loadCatalog(db: Db): Promise<CatalogModel[]> {
  const rows = await db
    .select({
      id: models.id,
      slug: models.slug,
      name: models.name,
      makeName: makes.name,
      makeSlug: makes.slug,
      reportStatus: models.reportStatus,
      yearStart: models.yearStart,
      yearEnd: models.yearEnd,
      dealerPulledAt: models.dealerPulledAt,
    })
    .from(models)
    .innerJoin(makes, eq(makes.id, models.makeId));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const gens = await db.select().from(generations).where(inArray(generations.modelId, ids));
  const aliases = await db.select().from(modelAliases).where(inArray(modelAliases.modelId, ids));
  return rows
    .map((m) => ({
      ...m,
      gens: gens
        .filter((g) => g.modelId === m.id)
        .map((g) => ({
          id: g.id,
          code: g.code,
          yearStart: g.yearStart,
          yearEnd: g.yearEnd,
          disambiguate: g.notes?.startsWith("match:")
            ? new RegExp(g.notes.slice(6), "i")
            : undefined,
        })),
      aliases: aliases
        .filter((a) => a.modelId === m.id)
        .map((a) => ({
          modelId: a.modelId,
          source: a.source,
          rawMake: a.rawMake,
          rawModel: a.rawModel,
          rawTrimPattern: a.rawTrimPattern,
        })),
    }))
    .filter((m) => m.aliases.length > 0);
}

/** Trailing-180-day dealer median per generation, used by the outlier rule. */
async function trailingMedians(db: Db, genIds: string[], now: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (genIds.length === 0) return out;
  const since = dateOnly(new Date(now.getTime() - 180 * DAY));
  const rows = await db
    .select({ generationId: dealerSales.generationId, price: dealerSales.price })
    .from(dealerSales)
    .where(
      and(
        inArray(dealerSales.generationId, genIds),
        gte(dealerSales.soldDate, since),
        isNull(dealerSales.excludedReason),
      ),
    );
  const byGen = new Map<string, number[]>();
  for (const r of rows) {
    if (r.generationId == null || r.price == null) continue;
    byGen.set(r.generationId, [...(byGen.get(r.generationId) ?? []), r.price]);
  }
  for (const [g, prices] of byGen) {
    const m = median(prices);
    if (m != null) out.set(g, m);
  }
  return out;
}

function toDealerInsert(m: CatalogModel, r: NormalizedDealerRow) {
  const text = [r.rawTrim, r.color].filter(Boolean).join(" ");
  const g = assignGeneration(m.gens, r.year, text);
  return {
    sourceListingId: r.sourceListingId,
    vin: r.vin,
    generationId: g.generationId,
    modelId: m.id,
    year: r.year,
    miles: r.miles,
    price: r.price,
    color: r.color,
    isPts: detectPts(r.rawTrim, r.color),
    packages: detectPackages([r.rawTrim, r.optionsText].filter(Boolean).join(" ")),
    dealerName: r.dealerName,
    state: r.state,
    daysOnMarket: r.daysOnMarket,
    needsReview: g.needsReview,
    rawJson: r.raw as object,
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

/** Model years the catalog says this model spans (null bound = open). */
function yearRange(m: CatalogModel) {
  const start = m.yearStart ?? (m.gens.length ? Math.min(...m.gens.map((g) => g.yearStart)) : null);
  const end = m.yearEnd ?? (m.gens.length ? Math.max(...m.gens.map((g) => g.yearEnd)) : null);
  return { start, end };
}
function yearList(r: { start: number | null; end: number | null }, now: Date): number[] {
  if (r.start == null) return [];
  const end = r.end ?? now.getUTCFullYear() + 1;
  if (end - r.start > 30) return [];
  return Array.from({ length: end - r.start + 1 }, (_, i) => r.start! + i);
}
function inYears(year: number | null, r: { start: number | null; end: number | null }) {
  if (year == null) return true; // let the cleaner flag it
  if (r.start != null && year < r.start) return false;
  if (r.end != null && year > r.end) return false;
  return true;
}
/** Error text safe for logs and job summaries: message only, never headers or keys. */
function describe(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\s+/g, " ").slice(0, 300);
}

interface PullOptions {
  initial: boolean;
  soldWindowDays: number;
  initialSoldDays: number;
  /** Pull Old Cars Data results for the model. First builds only: the sweeps cover the rest. */
  ocd: boolean;
  /** Epoch ms after which a Visor page walk stops mid-model (the model stays due). */
  deadline?: number;
}

/**
 * Pull from both sources for one model. Each source runs in its own try/catch: a Visor
 * failure is recorded in `errors` and the Old Cars Data pull still happens, and vice versa.
 * Returns normalized rows that matched an alias and fall inside the model's year range.
 */
async function pull(
  db: Db,
  m: CatalogModel,
  log: (s: string) => void,
  now: Date,
  po: PullOptions,
  fetchImpl?: typeof fetch,
) {
  const sold: NormalizedDealerRow[] = [];
  const active: NormalizedDealerRow[] = [];
  const auctions: NormalizedAuctionRow[] = [];
  const budgetStopped: string[] = [];
  const errors: string[] = [];
  let unmatched = 0;
  let visorRan = false;
  let visorCalls = 0;
  const years = yearRange(m);

  const visorAliases = m.aliases.filter((a) => a.source === "visor");
  if (env.VISOR_API_KEY && visorAliases.length) {
    visorRan = true;
    try {
      await withBudget(
        db,
        "visor",
        env.VISOR_MONTHLY_BUDGET,
        async (record) => {
          const client = createVisorClient({
            apiKey: env.VISOR_API_KEY!,
            record: {
              ...record,
              reserve: (endpoint, o) => {
                visorCalls++;
                return record.reserve(endpoint, o);
              },
            },
            fetchImpl,
            // A routine refresh wants recent sold rows and a sample of inventory, not every page.
            maxPages: po.initial ? 50 : 10,
            deadline: po.deadline,
          });
          const days = po.initial ? po.initialSoldDays : po.soldWindowDays;
          for (const a of visorAliases) {
            const q = {
              make: a.rawMake,
              model: a.rawModel,
              trimPattern: a.rawTrimPattern,
              years: yearList(years, now),
            };
            const keep = (r: NormalizedDealerRow) =>
              inYears(r.year, years) &&
              matchAlias(m.aliases, "visor", {
                make: r.rawMake,
                model: r.rawModel,
                text: r.rawTrim,
              });
            for (const r of await client.sold(q, days)) {
              if (keep(r)) sold.push(r);
              else unmatched++;
            }
            for (const r of await client.active(q)) {
              if (keep(r)) active.push(r);
              else unmatched++;
            }
          }
        },
        log,
      );
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        budgetStopped.push(e.message);
        log(`stop: ${e.message}`);
      } else {
        errors.push(`visor: ${describe(e)}`);
        log(`error ${m.slug} visor: ${describe(e)}`);
      }
    }
  } else log(`visor: skipped for ${m.slug} (no key or no alias)`);

  const ocdAliases = m.aliases.filter((a) => a.source === "ocd");
  if (po.ocd && env.OCD_API_KEY && ocdAliases.length) {
    try {
      // Cursor: newest ended_at we already hold for this model, minus a 2-day overlap.
      // First pulls (report builds) walk back without a cursor, to the client's page cap.
      const [last] = await db
        .select({ endedAt: auctionResults.endedAt })
        .from(auctionResults)
        .where(eq(auctionResults.modelId, m.id))
        .orderBy(desc(auctionResults.endedAt))
        .limit(1);
      const since = po.initial
        ? null
        : new Date((last?.endedAt?.getTime() ?? now.getTime() - 365 * DAY) - 2 * DAY).toISOString();
      await withBudget(
        db,
        "ocd",
        env.OCD_MONTHLY_BUDGET,
        async (record) => {
          const client = createOcdClient({ apiKey: env.OCD_API_KEY!, record, fetchImpl });
          for (const a of ocdAliases) {
            const alias = parseOcdAlias(a);
            const rows = await client.auctions(
              {
                make: alias.make,
                model: alias.model || undefined,
                keyword: alias.keyword,
                yearMin: years.start,
                yearMax: years.end,
              },
              since,
            );
            for (const r of rows) {
              if (ocdRowMatches(alias, r, years)) auctions.push(r);
              else unmatched++;
            }
          }
        },
        log,
      );
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        budgetStopped.push(e.message);
        log(`stop: ${e.message}`);
      } else {
        errors.push(`ocd: ${describe(e)}`);
        log(`error ${m.slug} ocd: ${describe(e)}`);
      }
    }
  } else
    log(`ocd: skipped for ${m.slug} (${po.ocd ? "no key or no alias" : "the sweeps cover it"})`);

  return { sold, active, auctions, unmatched, budgetStopped, errors, visorRan, visorCalls };
}

/**
 * Re-run cleaning over every non-manual dealer sale and auction result of the model.
 * Selects only the columns classify() reads (never raw_json) and writes reclassified
 * rows in one `update ... where id in (...)` per new reason.
 */
async function clean(db: Db, m: CatalogModel, now: Date, dryRun: boolean) {
  const genIds = m.gens.map((g) => g.id);
  const medians = await trailingMedians(db, genIds, now);
  const excluded: Record<string, number> = {};
  const bump = (k: string | null) => {
    if (k) excluded[k] = (excluded[k] ?? 0) + 1;
  };

  const sales = await db
    .select({
      id: dealerSales.id,
      price: dealerSales.price,
      miles: dealerSales.miles,
      year: dealerSales.year,
      generationId: dealerSales.generationId,
      excludedReason: dealerSales.excludedReason,
      needsReview: dealerSales.needsReview,
    })
    .from(dealerSales)
    .where(eq(dealerSales.modelId, m.id));
  const salesChanged: Reclassified[] = [];
  for (const s of sales) {
    const reason = classify(m.slug, {
      price: s.price,
      miles: s.miles,
      year: s.year,
      genMedian: s.generationId ? (medians.get(s.generationId) ?? null) : null,
      existing: s.excludedReason,
    });
    bump(reason);
    if (reason !== s.excludedReason)
      salesChanged.push({ id: s.id, before: s.excludedReason, after: reason });
  }
  if (!dryRun) {
    for (const g of groupReclassified(salesChanged)) {
      await db
        .update(dealerSales)
        .set({ excludedReason: g.reason })
        .where(inArray(dealerSales.id, g.ids));
    }
  }

  const aucs = await db
    .select({
      id: auctionResults.id,
      hammerPrice: auctionResults.hammerPrice,
      miles: auctionResults.miles,
      year: auctionResults.year,
      generationId: auctionResults.generationId,
      excludedReason: auctionResults.excludedReason,
      needsReview: auctionResults.needsReview,
    })
    .from(auctionResults)
    .where(eq(auctionResults.modelId, m.id));
  const aucsChanged: Reclassified[] = [];
  for (const a of aucs) {
    const reason = classify(m.slug, {
      price: a.hammerPrice,
      miles: a.miles,
      year: a.year,
      genMedian: a.generationId ? (medians.get(a.generationId) ?? null) : null,
      existing: a.excludedReason,
    });
    bump(reason);
    if (reason !== a.excludedReason)
      aucsChanged.push({ id: a.id, before: a.excludedReason, after: reason });
  }
  if (!dryRun) {
    for (const g of groupReclassified(aucsChanged)) {
      await db
        .update(auctionResults)
        .set({ excludedReason: g.reason })
        .where(inArray(auctionResults.id, g.ids));
    }
  }

  const needsReview =
    sales.filter((s) => s.needsReview).length + aucs.filter((a) => a.needsReview).length;
  const total = sales.length + aucs.length;
  const excludedTotal = Object.values(excluded).reduce((a, b) => a + b, 0);
  return { excluded, needsReview, excludedShare: total ? excludedTotal / total : 0 };
}

/** Rows affected by a raw `... returning` statement, whichever shape the driver returns. */
function returnedCount(res: unknown): number {
  if (Array.isArray(res)) return res.length;
  const rows = (res as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Retention: drops raw_fetch, car_view and job_run rows past their window, in batches so
 * the first run over a backlog fits the cron cap. Nothing reads raw_fetch back, trending
 * reads only the last week of car_view, and job_run is only browsed for recent runs.
 */
async function pruneOldRows(db: Db): Promise<RetentionSummary> {
  const rawFetch = await pruneInBatches(async (limit) =>
    returnedCount(
      await db.execute(sql`
        DELETE FROM ${rawFetches}
        WHERE id IN (
          SELECT id FROM ${rawFetches}
          WHERE fetched_at < now() - make_interval(days => ${RETENTION_DAYS.rawFetch}::int)
          LIMIT ${limit}
        )
        RETURNING id
      `),
    ),
  );
  // car_view has a composite key, so batch on the physical row id instead.
  const carView = await pruneInBatches(async (limit) =>
    returnedCount(
      await db.execute(sql`
        DELETE FROM ${carViews}
        WHERE ctid IN (
          SELECT ctid FROM ${carViews}
          WHERE day < current_date - ${RETENTION_DAYS.carView}::int
          LIMIT ${limit}
        )
        RETURNING day
      `),
    ),
  );
  const jobRun = await pruneInBatches(async (limit) =>
    returnedCount(
      await db.execute(sql`
        DELETE FROM ${jobRuns}
        WHERE id IN (
          SELECT id FROM ${jobRuns}
          WHERE started_at < now() - make_interval(days => ${RETENTION_DAYS.jobRun}::int)
          LIMIT ${limit}
        )
        RETURNING id
      `),
    ),
  );
  return { rawFetch, carView, jobRun };
}

/** Rebuild today's market_daily rows for each generation of the model. */
async function aggregateModel(
  db: Db,
  m: CatalogModel,
  now: Date,
  dryRun: boolean,
  excludedShare: number,
): Promise<{ codes: string[]; warnings: CheckWarning[] }> {
  const today = dateOnly(now);
  const yesterday = dateOnly(new Date(now.getTime() - DAY));
  const since180 = dateOnly(new Date(now.getTime() - 180 * DAY));
  const since365 = new Date(now.getTime() - 365 * DAY);
  const checks: CheckInput[] = [];
  const codes: string[] = [];

  for (const g of m.gens) {
    const dealerRows = await db
      .select({ price: dealerSales.price, miles: dealerSales.miles })
      .from(dealerSales)
      .where(
        and(
          eq(dealerSales.generationId, g.id),
          gte(dealerSales.soldDate, since180),
          isNull(dealerSales.excludedReason),
        ),
      );
    const auctionRows = await db
      .select({ price: auctionResults.hammerPrice, miles: auctionResults.miles })
      .from(auctionResults)
      .where(
        and(
          eq(auctionResults.generationId, g.id),
          eq(auctionResults.status, "sold"),
          gte(auctionResults.endedAt, since365),
          isNull(auctionResults.excludedReason),
        ),
      );
    const prev = await db
      .select()
      .from(marketDaily)
      .where(and(eq(marketDaily.generationId, g.id), eq(marketDaily.date, yesterday)));

    for (const [channel, rows] of [
      ["dealer", dealerRows],
      ["auction", auctionRows],
    ] as const) {
      const agg = aggregate(rows);
      const y = prev.find((p) => p.channel === channel);
      checks.push({
        generationCode: g.code,
        channel,
        todayN: agg.n,
        yesterdayN: y?.n ?? null,
        todayMedian: agg.median,
        yesterdayMedian: y?.median ?? null,
        excludedShare,
      });
      if (!dryRun) {
        await db
          .insert(marketDaily)
          .values({ generationId: g.id, date: today, channel, ...agg })
          .onConflictDoUpdate({
            target: [marketDaily.generationId, marketDaily.date, marketDaily.channel],
            set: {
              n: agg.n,
              median: agg.median,
              p25: agg.p25,
              p75: agg.p75,
              medianMiles: agg.medianMiles,
            },
          });
      }
    }
    codes.push(g.code);
  }
  return { codes, warnings: runChecks(checks) };
}

/**
 * The nightly job. Pull → normalize → dedupe → clean → aggregate → check, per model.
 *
 * dryRun (default): spends NO third-party API calls and writes nothing to
 * dealer_sale / dealer_active / auction_result / market_daily. It still runs
 * clean/aggregate/check over what is already in the database and reports what
 * a live run would change. A job_run row is always written.
 */
export async function runNightly(opts: NightlyOptions = {}): Promise<NightlySummary> {
  const db = opts.db ?? defaultDb;
  const dryRun = opts.dryRun ?? env.jobsDryRun;
  const log = opts.log ?? ((m: string) => console.log(`[nightly] ${m}`));
  const now = opts.now ?? new Date();
  const startedAt = now.toISOString();
  const errors: string[] = [];
  const summaries: ModelSummary[] = [];
  const po: PullOptions = {
    initial: opts.initial ?? false,
    soldWindowDays: opts.soldWindowDays ?? 2,
    initialSoldDays: opts.initialSoldDays ?? 365,
    ocd: opts.initial ?? false,
  };
  const refreshDays = opts.refreshDays ?? env.VISOR_REFRESH_DAYS;
  const timeBudgetMs = opts.timeBudgetMs ?? PULL_TIME_BUDGET_MS;
  const t0 = Date.now();
  let rotation: RotationSummary | undefined;
  let perNight = 0;
  /** A model's Visor walk stops shortly after the pull cap so one big model cannot overrun it. */
  const deadline = t0 + timeBudgetMs + 30_000;
  /** Sold window per model: the gap since its last pull; never-pulled models get the first-build window. */
  const perModel = (m: CatalogModel): PullOptions => {
    if (po.initial) return po;
    const days = soldWindowDays(m.dealerPulledAt, now, refreshDays);
    return days ? { ...po, soldWindowDays: days, deadline } : { ...po, initial: true, deadline };
  };

  const [run] = await db
    .insert(jobRuns)
    .values({ name: opts.modelSlugs?.length ? "report-build" : "nightly", dryRun, startedAt: now })
    .returning({ id: jobRuns.id });
  const jobRunId = run?.id ?? null;
  log(`start ${dryRun ? "(dry run)" : "(LIVE)"} job_run=${jobRunId}`);

  try {
    let catalog = await loadCatalog(db);
    let eligible: CatalogModel[] = [];
    if (opts.modelSlugs?.length) {
      const wanted = new Set(opts.modelSlugs);
      catalog = catalog.filter((m) => wanted.has(m.slug));
    } else {
      // The catalog holds hundreds of searchable models. A nightly refresh only spends
      // Visor budget on models that already have a report (or are mid-build), and only on
      // the stalest slice of those, so every model turns over about once per refreshDays.
      eligible = catalog.filter(
        (m) =>
          (m.reportStatus === "ready" || m.reportStatus === "building") &&
          m.aliases.some((a) => a.source === "visor"),
      );
      const r = pickRotation(eligible, now, refreshDays);
      perNight = r.perNight;
      // The rotation keeps to its share of the month and a nightly allowance, so report
      // builds always have Visor calls left. The queue is walked until perNight pulls succeed.
      const monthCap = Math.floor(env.VISOR_MONTHLY_BUDGET * VISOR_ROTATION_SHARE);
      const used = dryRun ? 0 : await callsUsed(db, "visor", now);
      const allowance = Math.max(
        0,
        Math.min(visorNightAllowance(env.VISOR_MONTHLY_BUDGET), monthCap - used),
      );
      rotation = {
        refreshDays,
        eligible: eligible.length,
        due: Math.min(perNight, r.queue.length),
        pulled: 0,
        remaining: 0,
        overdue: r.overdue,
        cleaned: 0,
        failed: 0,
        visorCalls: 0,
        allowance,
        budgetStopped: allowance === 0,
      };
      catalog = env.VISOR_API_KEY && allowance > 0 ? r.queue : [];
      if (!env.VISOR_API_KEY) log("rotation: no Visor key; nothing to refresh");
      else if (allowance === 0)
        log(`rotation: Visor share of the month spent (${used}/${monthCap}); nothing to refresh`);
      else
        log(
          `rotation: up to ${perNight} of ${eligible.length} models tonight (every ${refreshDays} days; ${r.overdue} overdue, ${r.fresh} pulled today; ${allowance} calls allowed)`,
        );
    }
    if (catalog.length === 0) log("no models with aliases; nothing to pull");

    const processedIds = new Set<string>();
    for (const m of catalog) {
      if (rotation) {
        if (rotation.pulled >= perNight || rotation.budgetStopped) break;
        if (rotation.visorCalls >= rotation.allowance) {
          rotation.remaining = perNight - rotation.pulled;
          log(
            `call allowance reached (${rotation.visorCalls}); ${rotation.remaining} pulls left for the next night`,
          );
          break;
        }
        if (Date.now() - t0 > timeBudgetMs) {
          rotation.remaining = perNight - rotation.pulled;
          log(`time cap: ${rotation.pulled} pulled, ${rotation.remaining} left for the next night`);
          break;
        }
      }
      processedIds.add(m.id);
      const s: ModelSummary = {
        model: `${m.makeSlug}/${m.slug}`,
        visorSold: 0,
        visorActive: 0,
        ocdAuctions: 0,
        unmatchedRows: 0,
        needsReview: 0,
        excluded: {},
        generationsAggregated: [],
        warnings: [],
        budgetStopped: [],
        errors: [],
        inserted: { sold: 0, active: 0, auctions: 0 },
        visorCalls: 0,
      };
      let visorOk = false;
      try {
        if (dryRun) {
          log(`${s.model}: dry run, skipping API pulls`);
        } else {
          const p = await pull(db, m, log, now, perModel(m), opts.fetchImpl);
          s.visorCalls = p.visorCalls;
          const visorBudget = p.budgetStopped.some((b) => b.includes("visor"));
          visorOk = p.visorRan && !visorBudget && !p.errors.some((e) => e.startsWith("visor"));
          if (rotation) {
            rotation.visorCalls += p.visorCalls;
            if (visorBudget) rotation.budgetStopped = true;
            else if (p.visorRan && !visorOk) rotation.failed++;
          }
          s.visorSold = p.sold.length;
          s.visorActive = p.active.length;
          s.ocdAuctions = p.auctions.length;
          s.unmatchedRows = p.unmatched;
          s.budgetStopped = p.budgetStopped;
          s.errors = p.errors;
          for (const err of p.errors) errors.push(`${s.model}: ${err}`);

          // Dedupe on the unique indexes: one row per source listing / per source+id.
          if (p.sold.length) {
            const res = await db
              .insert(dealerSales)
              .values(p.sold.map((r) => ({ ...toDealerInsert(m, r), soldDate: r.soldDate })))
              .onConflictDoNothing({ target: dealerSales.sourceListingId })
              .returning({ id: dealerSales.id });
            s.inserted.sold = res.length;
          }
          if (p.active.length) {
            const res = await db
              .insert(dealerActive)
              .values(
                p.active.map((r) => ({ ...toDealerInsert(m, r), snapshotDate: dateOnly(now) })),
              )
              .onConflictDoNothing({
                target: [dealerActive.sourceListingId, dealerActive.snapshotDate],
              })
              .returning({ id: dealerActive.id });
            s.inserted.active = res.length;
          }
          if (p.auctions.length) {
            const res = await db
              .insert(auctionResults)
              .values(p.auctions.map((r) => toAuctionInsert(m, r)))
              .onConflictDoNothing({ target: [auctionResults.source, auctionResults.sourceId] })
              .returning({ id: auctionResults.id });
            s.inserted.auctions = res.length;
          }
        }

        // Stamp the pull so the rotation moves on; a Visor failure or budget stop leaves the model due.
        if (!dryRun && visorOk) {
          await db.update(models).set({ dealerPulledAt: now }).where(eq(models.id, m.id));
          if (rotation) rotation.pulled++;
        }

        const c = await clean(db, m, now, dryRun);
        s.excluded = c.excluded;
        s.needsReview = c.needsReview;
        const a = await aggregateModel(db, m, now, dryRun, c.excludedShare);
        s.generationsAggregated = a.codes;
        s.warnings = a.warnings;
        for (const w of a.warnings)
          log(`warn ${s.model} ${w.generationCode}/${w.channel}: ${w.detail}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${s.model}: ${msg}`);
        log(`error ${s.model}: ${msg}`);
      }
      summaries.push(s);
    }

    // The ended-results sweep writes auction rows for any model without cleaning them;
    // re-clean models that gained rows in the last day and were not in tonight's slice.
    if (rotation && !dryRun) {
      const pulledIds = processedIds;
      const recent = await db
        .selectDistinct({ modelId: auctionResults.modelId })
        .from(auctionResults)
        .where(gte(auctionResults.fetchedAt, new Date(now.getTime() - DAY)));
      const recentIds = new Set(recent.map((r) => r.modelId));
      for (const m of eligible) {
        if (!recentIds.has(m.id) || pulledIds.has(m.id)) continue;
        if (Date.now() - t0 > timeBudgetMs + CLEAN_TIME_BUDGET_MS) {
          log("time cap: clean pass cut short");
          break;
        }
        try {
          await clean(db, m, now, dryRun);
          rotation.cleaned++;
        } catch (e) {
          errors.push(`${m.makeSlug}/${m.slug}: clean: ${describe(e)}`);
        }
      }
      if (rotation.cleaned) log(`re-cleaned ${rotation.cleaned} models with new auction rows`);
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  // Retention runs outside the pull so a failed pull still prunes. Full live runs only:
  // dry runs write nothing and on-demand report builds should stay short.
  let pruned: RetentionSummary | undefined;
  if (!dryRun && !opts.modelSlugs?.length) {
    try {
      pruned = await pruneOldRows(db);
      log(
        `retention: raw_fetch -${pruned.rawFetch}, car_view -${pruned.carView}, job_run -${pruned.jobRun}`,
      );
    } catch (e) {
      errors.push(`retention: ${describe(e)}`);
      log(`error retention: ${describe(e)}`);
    }
  }

  const finishedAt = new Date().toISOString();
  const summary: NightlySummary = {
    jobRunId,
    dryRun,
    startedAt,
    finishedAt,
    models: summaries,
    errors,
    ...(pruned ? { pruned } : {}),
    ...(rotation ? { rotation } : {}),
  };
  if (jobRunId) {
    await db
      .update(jobRuns)
      .set({
        finishedAt: new Date(finishedAt),
        ok: errors.length === 0,
        summary,
        error: errors.join("\n") || null,
        changed: summaries.reduce(
          (a, s) => a + s.inserted.sold + s.inserted.active + s.inserted.auctions,
          0,
        ),
      })
      .where(eq(jobRuns.id, jobRunId));
  }
  log(`done: ${summaries.length} models, ${errors.length} errors`);
  return summary;
}
