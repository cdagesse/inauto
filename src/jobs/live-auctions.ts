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
  budgetStopped: string | null;
  errors: string[];
}

interface CatalogModel {
  id: string;
  gens: GenerationRange[];
}

async function loadCatalog(
  db: Db,
): Promise<{ rules: AliasRule[]; byId: Map<string, CatalogModel> }> {
  const rows = await db
    .select({ id: models.id })
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
  for (const id of ids) {
    byId.set(id, {
      id,
      gens: gens
        .filter((g) => g.modelId === id && g.code !== "all")
        .map((g) => ({
          id: g.id,
          code: g.code,
          yearStart: g.yearStart,
          yearEnd: g.yearEnd,
          disambiguate: g.notes?.startsWith("match:")
            ? new RegExp(g.notes.slice(6), "i")
            : undefined,
        })),
    });
  }
  // Most specific first: keyworded aliases (S63) before bare lines (S-Class) so a row lands on
  // the narrow model when both would match.
  const rules: AliasRule[] = aliases
    .map((a) => ({
      modelId: a.modelId,
      source: a.source,
      rawMake: a.rawMake,
      rawModel: a.rawModel,
      rawTrimPattern: a.rawTrimPattern,
    }))
    .sort((x, y) => (y.rawTrimPattern?.length ?? 0) - (x.rawTrimPattern?.length ?? 0));
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

/** Pull live auctions within budget. Returns normalized rows; never throws on budget stop. */
async function pull(
  db: Db,
  scope: "all" | "catalog",
  rules: AliasRule[],
  log: (s: string) => void,
  now: Date,
  fetchImpl?: typeof fetch,
): Promise<{ rows: NormalizedLiveRow[]; budgetStopped: string | null }> {
  const rows: NormalizedLiveRow[] = [];
  if (!env.OCD_API_KEY) {
    log("ocd: skipped (no key)");
    return { rows, budgetStopped: null };
  }
  try {
    await withBudget(
      db,
      "ocd",
      env.OCD_MONTHLY_BUDGET,
      async (record) => {
        const client = createOcdClient({ apiKey: env.OCD_API_KEY!, record, fetchImpl });
        if (scope === "all") {
          // One sweep of everything that changed since the last run (default: 36 hours back).
          const updatedSince = new Date(now.getTime() - 36 * 3_600_000).toISOString();
          rows.push(...(await client.live({ updatedSince }, now)));
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
    return { rows, budgetStopped: null };
  } catch (e) {
    if (e instanceof BudgetExceeded) {
      log(`stop: ${e.message}`);
      return { rows, budgetStopped: e.message };
    }
    throw e;
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
      .values({ name: "live-auctions", dryRun })
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

  try {
    const { rules, byId } = await loadCatalog(db);

    if (!dryRun) {
      const res = await pull(db, scope, rules, log, now, opts.fetchImpl);
      budgetStopped = res.budgetStopped;
      pulled = res.rows.length;
      // Dedupe within the pull (paging overlap) on source+sourceId, last one wins.
      const uniq = new Map<string, NormalizedLiveRow>();
      for (const r of res.rows) uniq.set(`${r.source}|${r.sourceId}`, r);
      for (const r of uniq.values()) {
        const modelId = matchOcdRules(rules, {
          rawMake: r.make,
          rawModel: r.model,
          title: r.title,
        });
        let generationId: string | null = null;
        if (modelId) {
          matched++;
          const m = byId.get(modelId);
          if (m && m.gens.length > 0)
            generationId = assignGeneration(m.gens, r.year, r.title).generationId;
        }
        const values = toInsert(r, modelId, generationId);
        await db
          .insert(externalListings)
          .values(values)
          .onConflictDoUpdate({
            target: [externalListings.source, externalListings.sourceId],
            set: {
              url: values.url,
              status: values.status,
              title: values.title,
              year: values.year,
              trim: values.trim,
              vin: sql`coalesce(${externalListings.vin}, excluded.vin)`,
              miles: values.miles,
              color: values.color,
              location: values.location,
              description: values.description,
              photoUrls: values.photoUrls,
              currentBid: values.currentBid,
              bidCount: values.bidCount,
              reserveMet: values.reserveMet,
              startedAt: values.startedAt,
              endsAt: values.endsAt,
              modelId: sql`coalesce(excluded.model_id, ${externalListings.modelId})`,
              generationId: sql`coalesce(excluded.generation_id, ${externalListings.generationId})`,
              rawJson: values.rawJson,
              fetchedAt: values.fetchedAt,
            },
          });
        upserted++;
      }
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
    budgetStopped,
    errors,
  };
  if (jobRunId) {
    try {
      await db
        .update(jobRuns)
        .set({ finishedAt: new Date(), ok: errors.length === 0, summary, error: errors[0] ?? null })
        .where(eq(jobRuns.id, jobRunId));
    } catch (e) {
      log(`job_run update failed: ${(e as Error).message}`);
    }
  }
  return summary;
}
