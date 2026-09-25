import "server-only";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import {
  auctionResults,
  dealerActive,
  dealerSales,
  generations,
  jobRuns,
  makes,
  marketDaily,
  modelAliases,
  models,
} from "@/db/schema";
import { env } from "@/env/server";
import { BudgetExceeded, withBudget } from "@/lib/sources/budget";
import { createOcdClient, ocdRowMatches, parseOcdAlias } from "@/lib/sources/ocd";
import { createVisorClient } from "@/lib/sources/visor";
import type { NormalizedAuctionRow, NormalizedDealerRow } from "@/lib/sources/types";
import { classify } from "./lib/clean";
import { runChecks, type CheckInput, type CheckWarning } from "./lib/check";
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
  /** Visor `sold_within_days` for a routine run (default 2, overlapping the previous night). */
  soldWindowDays?: number;
  initialSoldDays?: number;
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
}

export interface NightlySummary {
  jobRunId: string | null;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  models: ModelSummary[];
  errors: string[];
}

const DAY = 86_400_000;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

interface CatalogModel {
  id: string;
  slug: string;
  makeName: string;
  makeSlug: string;
  name: string;
  reportStatus: string;
  yearStart: number | null;
  yearEnd: number | null;
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
  const years = yearRange(m);

  const visorAliases = m.aliases.filter((a) => a.source === "visor");
  if (env.VISOR_API_KEY && visorAliases.length) {
    try {
      await withBudget(
        db,
        "visor",
        env.VISOR_MONTHLY_BUDGET,
        async (record) => {
          const client = createVisorClient({ apiKey: env.VISOR_API_KEY!, record, fetchImpl });
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
  if (env.OCD_API_KEY && ocdAliases.length) {
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
  } else log(`ocd: skipped for ${m.slug} (no key or no alias)`);

  return { sold, active, auctions, unmatched, budgetStopped, errors };
}

/** Re-run cleaning over every non-manual dealer sale and auction result of the model. */
async function clean(db: Db, m: CatalogModel, now: Date, dryRun: boolean) {
  const genIds = m.gens.map((g) => g.id);
  const medians = await trailingMedians(db, genIds, now);
  const excluded: Record<string, number> = {};
  const bump = (k: string | null) => {
    if (k) excluded[k] = (excluded[k] ?? 0) + 1;
  };

  const sales = await db.select().from(dealerSales).where(eq(dealerSales.modelId, m.id));
  for (const s of sales) {
    const reason = classify(m.slug, {
      price: s.price,
      miles: s.miles,
      year: s.year,
      genMedian: s.generationId ? (medians.get(s.generationId) ?? null) : null,
      existing: s.excludedReason,
    });
    bump(reason);
    if (!dryRun && reason !== s.excludedReason) {
      await db.update(dealerSales).set({ excludedReason: reason }).where(eq(dealerSales.id, s.id));
    }
  }
  const aucs = await db.select().from(auctionResults).where(eq(auctionResults.modelId, m.id));
  for (const a of aucs) {
    const reason = classify(m.slug, {
      price: a.hammerPrice,
      miles: a.miles,
      year: a.year,
      genMedian: a.generationId ? (medians.get(a.generationId) ?? null) : null,
      existing: a.excludedReason,
    });
    bump(reason);
    if (!dryRun && reason !== a.excludedReason) {
      await db
        .update(auctionResults)
        .set({ excludedReason: reason })
        .where(eq(auctionResults.id, a.id));
    }
  }
  const needsReview =
    sales.filter((s) => s.needsReview).length + aucs.filter((a) => a.needsReview).length;
  const total = sales.length + aucs.length;
  const excludedTotal = Object.values(excluded).reduce((a, b) => a + b, 0);
  return { excluded, needsReview, excludedShare: total ? excludedTotal / total : 0 };
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
  };

  const [run] = await db
    .insert(jobRuns)
    .values({ name: "nightly", dryRun, startedAt: now })
    .returning({ id: jobRuns.id });
  const jobRunId = run?.id ?? null;
  log(`start ${dryRun ? "(dry run)" : "(LIVE)"} job_run=${jobRunId}`);

  try {
    let catalog = await loadCatalog(db);
    if (opts.modelSlugs?.length) {
      const wanted = new Set(opts.modelSlugs);
      catalog = catalog.filter((m) => wanted.has(m.slug));
    } else {
      // The catalog holds hundreds of searchable models. A nightly refresh only
      // spends API budget on models that already have a report (or are mid-build);
      // new models enter through the on-demand report job.
      catalog = catalog.filter((m) => m.reportStatus === "ready" || m.reportStatus === "building");
    }
    if (catalog.length === 0) log("no models with aliases; nothing to pull");

    for (const m of catalog) {
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
      };
      try {
        if (dryRun) {
          log(`${s.model}: dry run, skipping API pulls`);
        } else {
          const p = await pull(db, m, log, now, po, opts.fetchImpl);
          s.visorSold = p.sold.length;
          s.visorActive = p.active.length;
          s.ocdAuctions = p.auctions.length;
          s.unmatchedRows = p.unmatched;
          s.budgetStopped = p.budgetStopped;
          s.errors = p.errors;
          for (const err of p.errors) errors.push(`${s.model}: ${err}`);

          // Dedupe on the unique indexes: one row per source listing / per source+id.
          if (p.sold.length) {
            await db
              .insert(dealerSales)
              .values(p.sold.map((r) => ({ ...toDealerInsert(m, r), soldDate: r.soldDate })))
              .onConflictDoNothing({ target: dealerSales.sourceListingId });
          }
          if (p.active.length) {
            await db
              .insert(dealerActive)
              .values(
                p.active.map((r) => ({ ...toDealerInsert(m, r), snapshotDate: dateOnly(now) })),
              )
              .onConflictDoNothing({
                target: [dealerActive.sourceListingId, dealerActive.snapshotDate],
              });
          }
          if (p.auctions.length) {
            await db
              .insert(auctionResults)
              .values(p.auctions.map((r) => toAuctionInsert(m, r)))
              .onConflictDoNothing({ target: [auctionResults.source, auctionResults.sourceId] });
          }
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
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  const finishedAt = new Date().toISOString();
  const summary: NightlySummary = {
    jobRunId,
    dryRun,
    startedAt,
    finishedAt,
    models: summaries,
    errors,
  };
  if (jobRunId) {
    await db
      .update(jobRuns)
      .set({
        finishedAt: new Date(finishedAt),
        ok: errors.length === 0,
        summary,
        error: errors.join("\n") || null,
      })
      .where(eq(jobRuns.id, jobRunId));
  }
  log(`done: ${summaries.length} models, ${errors.length} errors`);
  return summary;
}
