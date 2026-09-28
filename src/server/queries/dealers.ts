import "server-only";
import { and, asc, desc, eq, gt, gte, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { dealerActive, generations, makes, models } from "@/db/schema";
import { decodeDealerCursor, encodeDealerCursor } from "@/lib/listings/dealer-cursor";
import { SEARCH_MIN_SIMILARITY, searchTokens } from "@/lib/listings/search";

export const DEALER_PAGE_SIZE = 24;

/** A dealer inventory listing as the Buy page card shows it. */
export interface DealerCardData {
  id: string;
  year: number | null;
  make: string;
  makeSlug: string;
  model: string;
  modelSlug: string;
  modelShort: string | null;
  trim: string | null;
  miles: number | null;
  price: number | null;
  color: string | null;
  dealerName: string | null;
  city: string | null;
  state: string | null;
  daysOnMarket: number | null;
  photo: string | null;
  /** The inventory snapshot day this row belongs to (YYYY-MM-DD). */
  snapshotDate: string;
}

const raw = dealerActive.rawJson;
const trimExpr = sql<string | null>`${raw}->>'trim'`;
const cityExpr = sql<string | null>`${raw}->>'city'`;
const cardColumns = {
  id: dealerActive.id,
  year: dealerActive.year,
  make: makes.name,
  makeSlug: makes.slug,
  model: models.name,
  modelSlug: models.slug,
  modelShort: models.shortName,
  trim: trimExpr,
  miles: dealerActive.miles,
  price: dealerActive.price,
  color: dealerActive.color,
  dealerName: dealerActive.dealerName,
  city: cityExpr,
  state: dealerActive.state,
  daysOnMarket: dealerActive.daysOnMarket,
  photo: sql<string | null>`${raw}->'photo_urls'->>0`,
  snapshotDate: dealerActive.snapshotDate,
};

/**
 * "Listed now": rows from each model's newest inventory snapshot (every model is refreshed
 * about every two weeks), excluding rows the cleaner set aside.
 */
const listedNow = and(
  sql`${dealerActive.snapshotDate} = (select max(b.snapshot_date) from dealer_active b where b.model_id = ${dealerActive.modelId})`,
  isNull(dealerActive.excludedReason),
)!;

export interface DealerFilter {
  q?: string;
  make?: string;
  model?: string;
  trim?: string;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  milesMin?: number;
  milesMax?: number;
  cursor?: string;
  limit?: number;
}

const esc = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`);
const like = (s: string) => `%${esc(s)}%`;

function conditions(filter: DealerFilter): { conds: SQL[]; relevance: SQL | null } {
  const conds: SQL[] = [listedNow];
  if (filter.make) conds.push(sql`lower(${makes.name}) = ${filter.make.toLowerCase()}`);
  if (filter.model)
    conds.push(or(ilike(models.name, like(filter.model)), ilike(trimExpr, like(filter.model)))!);
  if (filter.trim) conds.push(ilike(trimExpr, like(filter.trim)));
  if (filter.yearMin != null) conds.push(gte(dealerActive.year, filter.yearMin));
  if (filter.yearMax != null) conds.push(lte(dealerActive.year, filter.yearMax));
  if (filter.milesMin != null) conds.push(gte(dealerActive.miles, filter.milesMin));
  if (filter.milesMax != null) conds.push(lte(dealerActive.miles, filter.milesMax));
  if (filter.priceMin != null) conds.push(gte(dealerActive.price, filter.priceMin));
  if (filter.priceMax != null) conds.push(lte(dealerActive.price, filter.priceMax));
  const tokens = searchTokens(filter.q);
  const haystack = sql`lower(concat_ws(' ', ${dealerActive.year}, ${makes.name}, ${models.name}, ${models.shortName}, ${trimExpr}, ${dealerActive.dealerName}))`;
  for (const t of tokens)
    conds.push(
      or(
        sql`${haystack} like ${like(t)}`,
        sql`word_similarity(${t}, ${haystack}) >= ${SEARCH_MIN_SIMILARITY}`,
      )!,
    );
  const relevance = tokens.length
    ? sql`(${sql.join(
        tokens.map((t) => sql`word_similarity(${t}, ${haystack})`),
        sql` + `,
      )}) desc`
    : null;
  return { conds, relevance };
}

/**
 * Dealer inventory for the Buy page, freshest at the dealer first (days on market, then
 * id), keyset paginated. A search is a single page of best matches.
 */
export async function listDealerListings(
  filter: DealerFilter = {},
): Promise<{ rows: DealerCardData[]; nextCursor: string | null }> {
  const limit = Math.min(filter.limit ?? DEALER_PAGE_SIZE, 100);
  const { conds, relevance } = conditions(filter);
  const cur = relevance ? null : decodeDealerCursor(filter.cursor);
  const dom = dealerActive.daysOnMarket;
  const id = dealerActive.id;
  if (cur)
    conds.push(
      cur.daysOnMarket != null
        ? or(
            gt(dom, cur.daysOnMarket),
            isNull(dom),
            and(eq(dom, cur.daysOnMarket), gt(id, cur.id)),
          )!
        : and(isNull(dom), gt(id, cur.id))!,
    );
  const order = [sql`${dom} asc nulls last`, asc(id)];
  const rows = await db
    .select(cardColumns)
    .from(dealerActive)
    .innerJoin(models, eq(models.id, dealerActive.modelId))
    .innerJoin(makes, eq(makes.id, models.makeId))
    .where(and(...conds))
    .orderBy(...(relevance ? [relevance, ...order] : order))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    rows: page,
    nextCursor:
      rows.length > limit && !relevance && last
        ? encodeDealerCursor({ daysOnMarket: last.daysOnMarket, id: last.id })
        : null,
  };
}

/** How many dealer listings are on the Buy page right now. Request-cached. */
export const countDealerListings = cache(async (): Promise<number> => {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dealerActive)
    .where(listedNow);
  return Number(r?.n ?? 0);
});

/** Dealer listings of one model for its report page, freshest first, with the total. */
export async function listDealerListingsForModel(
  makeSlug: string,
  modelSlug: string,
  limit = 8,
): Promise<{ rows: DealerCardData[]; total: number }> {
  const scope = and(listedNow, eq(makes.slug, makeSlug), eq(models.slug, modelSlug))!;
  const [rows, [count]] = await Promise.all([
    db
      .select(cardColumns)
      .from(dealerActive)
      .innerJoin(models, eq(models.id, dealerActive.modelId))
      .innerJoin(makes, eq(makes.id, models.makeId))
      .where(scope)
      .orderBy(sql`${dealerActive.daysOnMarket} asc nulls last`, desc(dealerActive.price))
      .limit(limit),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(dealerActive)
      .innerJoin(models, eq(models.id, dealerActive.modelId))
      .innerJoin(makes, eq(makes.id, models.makeId))
      .where(scope),
  ]);
  return { rows, total: Number(count?.n ?? 0) };
}

export interface DealerDetail extends DealerCardData {
  vin: string | null;
  packages: string[];
  photos: string[];
  url: string | null;
  stockNumber: string | null;
  listedAt: string | null;
  fetchedAt: Date;
  /** Whether this row is still in the model's newest snapshot. */
  current: boolean;
  market: {
    makeSlug: string;
    modelSlug: string;
    modelName: string;
    generationCode: string | null;
    reportStatus: "none" | "requested" | "building" | "ready" | "failed";
    reportError: string | null;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One dealer listing with everything the detail page shows, or null. Request-cached. */
export const getDealerListing = cache(async (id: string): Promise<DealerDetail | null> => {
  if (!UUID.test(id)) return null;
  const [r] = await db
    .select({
      ...cardColumns,
      vin: dealerActive.vin,
      packages: dealerActive.packages,
      raw: dealerActive.rawJson,
      fetchedAt: dealerActive.fetchedAt,
      generationCode: generations.code,
      reportStatus: models.reportStatus,
      reportError: models.reportError,
      current: sql<boolean>`${dealerActive.snapshotDate} = (select max(b.snapshot_date) from dealer_active b where b.model_id = ${dealerActive.modelId})`,
    })
    .from(dealerActive)
    .innerJoin(models, eq(models.id, dealerActive.modelId))
    .innerJoin(makes, eq(makes.id, models.makeId))
    .leftJoin(generations, eq(generations.id, dealerActive.generationId))
    .where(eq(dealerActive.id, id))
    .limit(1);
  if (!r) return null;
  const { raw, generationCode, reportStatus, reportError, ...rest } = r;
  const j = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) =>
    typeof j[k] === "string" && (j[k] as string).trim() ? (j[k] as string) : null;
  const photos = Array.isArray(j.photo_urls)
    ? (j.photo_urls as unknown[]).filter(
        (u): u is string => typeof u === "string" && /^https:\/\//.test(u),
      )
    : [];
  const url = str("vdp_url");
  return {
    ...rest,
    photos,
    url: url && /^https?:\/\//.test(url) ? url : null,
    stockNumber: str("stock_number"),
    listedAt: str("listed_at"),
    current: !!r.current,
    market: {
      makeSlug: r.makeSlug,
      modelSlug: r.modelSlug,
      modelName: r.model,
      generationCode: generationCode ?? null,
      reportStatus,
      reportError,
    },
  };
});
