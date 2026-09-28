import "server-only";
import { eq, isNull, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import { auctionResults, externalListings, makes, models } from "@/db/schema";
import { matchOcdRules } from "@/lib/sources/ocd";
import { assignGeneration } from "./lib/normalize";
import { loadCatalog, type CatalogModel } from "./live-auctions";

export const REMATCH_JOB = "rematch-listings";

/** unmatched: rows with no model. all: every row, moved when the catalog now places it elsewhere. */
export type RematchScope = "unmatched" | "all";

export interface RematchSummary {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  scope: RematchScope;
  /** Platform listings looked at. */
  scanned: number;
  /** Of those, how many the current aliases and matcher place somewhere new. */
  matched: number;
  /** Listing rows written (0 on a dry run). */
  updated: number;
  /** Auction results looked at, placed elsewhere, and written; only with scope "all". */
  auctionsScanned: number;
  auctionsMatched: number;
  auctionsUpdated: number;
  /** Moved rows per catalog model, largest first, capped. */
  byModel: { model: string; n: number }[];
  /** With scope "all": the make/model slugs a move must start or end in; empty = any. */
  onlyModels: string[];
  errors: string[];
}

const WRITE_CHUNK = 25;
const TOP_MODELS = 12;

interface Candidate {
  id: string;
  make: string | null;
  model: string | null;
  title: string | null;
  year: number | null;
  modelId: string | null;
}

interface Update {
  id: string;
  modelId: string;
  generationId: string | null;
}

type Rules = Awaited<ReturnType<typeof loadCatalog>>["rules"];

const squash = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Rules grouped by make, in their original order, so a row only tries its own make's rules. */
function rulesByMake(rules: Rules): Map<string, Rules> {
  const out = new Map<string, Rules>();
  for (const r of rules) {
    const k = squash(r.rawMake);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

function plan(
  rows: Candidate[],
  rules: Rules,
  byId: Map<string, CatalogModel>,
  perModel: Map<string, number>,
  only: Set<string> | null,
): Update[] {
  const out: Update[] = [];
  const grouped = rulesByMake(rules);
  for (const r of rows) {
    const own = grouped.get(squash(r.make));
    if (!own) continue;
    const modelId = matchOcdRules(
      own,
      { rawMake: r.make, rawModel: r.model, title: r.title, year: r.year },
      (id) => byId.get(id)?.years,
    );
    // A row that matches nothing keeps whatever it has; only a different, real match moves it.
    if (!modelId || modelId === r.modelId) continue;
    // A targeted run only touches rows leaving or entering the named models.
    if (only && !only.has(modelId) && !(r.modelId && only.has(r.modelId))) continue;
    const m = byId.get(modelId);
    const generationId =
      m && m.gens.length > 0 ? assignGeneration(m.gens, r.year, r.title).generationId : null;
    out.push({ id: r.id, modelId, generationId });
    perModel.set(modelId, (perModel.get(modelId) ?? 0) + 1);
  }
  return out;
}

async function write(
  db: Db,
  table: typeof externalListings | typeof auctionResults,
  updates: Update[],
  errors: string[],
): Promise<number> {
  let updated = 0;
  for (let i = 0; i < updates.length; i += WRITE_CHUNK) {
    const slice = updates.slice(i, i + WRITE_CHUNK);
    const results = await Promise.allSettled(
      slice.map((u) =>
        db
          .update(table)
          .set({ modelId: u.modelId, generationId: u.generationId })
          .where(eq(table.id, u.id)),
      ),
    );
    let failed = 0;
    for (const r of results) {
      if (r.status === "fulfilled") updated++;
      else {
        failed++;
        if (errors.length < 10)
          errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
      }
    }
    // A whole slice failing means the database is away; stop rather than hammer it.
    if (failed === slice.length) break;
  }
  return updated;
}

/**
 * Re-runs catalog matching over platform listings. Run by hand after an alias or matcher
 * change: the live sweep re-matches live rows on its own, but sold and ended rows are only
 * rewritten here. Scope "unmatched" (the default) fills in rows that have no model; scope
 * "all" also moves listings and auction results whose match changed, which is what a
 * catalog split needs (a new "360 Challenge Stradale" model taking rows from the "360").
 * Rows that match nothing are left as they are.
 */
export async function rematchListings(opts: {
  db?: Db;
  dryRun: boolean;
  scope?: RematchScope;
  /** "make/model" slugs; with scope "all", only moves leaving or entering these models. */
  onlyModels?: string[];
  log?: (m: string) => void;
  now?: Date;
}): Promise<RematchSummary> {
  const db = opts.db ?? defaultDb;
  const log = opts.log ?? (() => {});
  const scope: RematchScope = opts.scope ?? "unmatched";
  const startedAt = (opts.now ?? new Date()).toISOString();
  const errors: string[] = [];
  const perModel = new Map<string, number>();
  const { rules, byId } = await loadCatalog(db);
  const onlyModels = scope === "all" ? (opts.onlyModels ?? []) : [];
  let only: Set<string> | null = null;
  if (onlyModels.length) {
    const rows = await db
      .select({ id: models.id, make: makes.slug, slug: models.slug })
      .from(models)
      .innerJoin(makes, eq(makes.id, models.makeId));
    const wanted = new Set(onlyModels);
    only = new Set(rows.filter((r) => wanted.has(`${r.make}/${r.slug}`)).map((r) => r.id));
    const missing = onlyModels.filter((m) => !rows.some((r) => `${r.make}/${r.slug}` === m));
    if (missing.length) errors.push(`unknown models: ${missing.join(", ")}`);
  }

  const listingCols = {
    id: externalListings.id,
    make: externalListings.make,
    model: externalListings.model,
    title: externalListings.title,
    year: externalListings.year,
    modelId: externalListings.modelId,
  };
  const listings: Candidate[] =
    scope === "all"
      ? await db.select(listingCols).from(externalListings)
      : await db.select(listingCols).from(externalListings).where(isNull(externalListings.modelId));
  log(`rematch(${scope}): ${listings.length} listings, ${rules.length} rules`);
  const listingUpdates = plan(listings, rules, byId, perModel, only);
  const updated = opts.dryRun ? 0 : await write(db, externalListings, listingUpdates, errors);

  let auctions: Candidate[] = [];
  let auctionUpdates: Update[] = [];
  let auctionsUpdated = 0;
  if (scope === "all") {
    // Auction results only exist when they matched a model, so only "all" can move them; the
    // feed's names live in the raw row.
    // Only the three name fields, not the whole raw row: 56k full JSON rows would take minutes.
    const rows = await db
      .select({
        id: auctionResults.id,
        year: auctionResults.year,
        modelId: auctionResults.modelId,
        make: sql<
          string | null
        >`coalesce(${auctionResults.rawJson}->>'ocd_make_name', ${auctionResults.rawJson}->>'listing_make')`,
        model: sql<
          string | null
        >`coalesce(${auctionResults.rawJson}->>'ocd_model_name', ${auctionResults.rawJson}->>'listing_model')`,
        title: sql<string | null>`${auctionResults.rawJson}->>'title'`,
      })
      .from(auctionResults);
    auctions = rows;
    auctionUpdates = plan(auctions, rules, byId, perModel, only);
    auctionsUpdated = opts.dryRun ? 0 : await write(db, auctionResults, auctionUpdates, errors);
    log(`rematch(all): ${auctions.length} auction results, ${auctionUpdates.length} move`);
  }

  const byModel = [...perModel.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_MODELS)
    .map(([model, n]) => ({ model, n }));
  log(`rematch: listings matched ${listingUpdates.length}, wrote ${updated}`);
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun: opts.dryRun,
    scope,
    scanned: listings.length,
    matched: listingUpdates.length,
    updated,
    auctionsScanned: auctions.length,
    auctionsMatched: auctionUpdates.length,
    auctionsUpdated,
    byModel,
    onlyModels,
    errors,
  };
}
