import "server-only";
import { and, desc, eq, gte, ilike, isNull, lt, lte, max, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { dealerActive, generations, makes, models } from "@/db/schema";
import { decodeDealerCursor, encodeDealerCursor } from "@/lib/listings/dealer-cursor";
import { searchTokens } from "@/lib/listings/search";

export const DEALER_PAGE_SIZE = 24;

/** A model's inventory older than this is not "listed now" even if it is the newest we hold. */
export const DEALER_STALE_DAYS = 28;

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
  /** Days on the market as of today (Visor's count aged by the days since the snapshot). */
  daysOnMarket: number | null;
  /** The day the car was listed (snapshot day minus days on market), YYYY-MM-DD. */
  listedOn: string | null;
  photo: string | null;
  /** The inventory snapshot day this row belongs to (YYYY-MM-DD). */
  snapshotDate: string;
}

const raw = dealerActive.rawJson;
const trimExpr = sql<string | null>`${raw}->>'trim'`;
const cityExpr = sql<string | null>`${raw}->>'city'`;
/** Days on market as of today; Visor's figure is as of the snapshot day. */
const daysExpr = sql<number | null>`(${dealerActive.daysOnMarket} + (current_date - ${dealerActive.snapshotDate}))`;
/** The listing date; null when Visor has no days-on-market for the row. */
const listedOnExpr = sql<string | null>`(${dealerActive.snapshotDate} - ${dealerActive.daysOnMarket})::text`;
const photoExpr = sql<string | null>`(select u from jsonb_array_elements_text(${raw}->'photo_urls') u where u like 'https://%' limit 1)`;
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
  daysOnMarket: daysExpr,
  listedOn: listedOnExpr,
  photo: photoExpr,
  snapshotDate: dealerActive.snapshotDate,
};

/**
 * Each model's newest inventory snapshot day, computed once per query (a few hundred
 * rows through dealer_active_model_day_idx) and joined, rather than a subquery per row.
 */
const latest = db
  .select({ modelId: dealerActive.modelId, day: max(dealerActive.snapshotDate).as("day") })
  .from(dealerActive)
  .groupBy(dealerActive.modelId)
  .as("latest");

/** "Listed now": rows of the newest snapshot, recent enough, not set aside by the cleaner. */
const listedNow = and(
  sql`${dealerActive.snapshotDate} >= current_date - ${DEALER_STALE_DAYS}`,
  isNull(dealerActive.excludedReason),
)!;

function fromListedNow() {
  return db
    .select(cardColumns)
    .from(dealerActive)
    .innerJoin(
      latest,
      and(eq(latest.modelId, dealerActive.modelId), eq(latest.day, dealerActive.snapshotDate)),
    )
    .innerJoin(models, eq(models.id, dealerActive.modelId))
    .innerJoin(makes, eq(makes.id, models.makeId));
}

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

const like = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

/**
 * Same immutable expression as dealer_active_search_trgm_idx (migration 0015), so the
 * `<<%` predicate is an index scan. Visor's own make and model strings are used, not the
 * catalog names, because an index cannot reach across the joins.
 */
const haystack = sql`lower(coalesce(${dealerActive.year}::text, '') || ' ' || coalesce(${raw}->>'make', '') || ' ' || coalesce(${raw}->>'model', '') || ' ' || coalesce(${raw}->>'trim', '') || ' ' || coalesce(${dealerActive.dealerName}, ''))`;

function conditions(filter: DealerFilter): { conds: SQL[]; relevance: SQL | null } {
  const conds: SQL[] = [listedNow];
  if (filter.make) conds.push(sql`lower(${makes.name}) = ${filter.make.toLowerCase()}`);
  if (filter.model) {
    // A catalog model name matches exactly (so "911 GT3" does not pull in "911 GT3 RS");
    // anything else matches the dealer's trim text.
    const m = filter.model.toLowerCase();
    conds.push(
      or(
        sql`lower(${models.name}) = ${m}`,
        sql`lower(${models.shortName}) = ${m}`,
        ilike(trimExpr, like(filter.model)),
      )!,
    );
  }
  if (filter.trim) conds.push(ilike(trimExpr, like(filter.trim)));
  if (filter.yearMin != null) conds.push(gte(dealerActive.year, filter.yearMin));
  if (filter.yearMax != null) conds.push(lte(dealerActive.year, filter.yearMax));
  if (filter.milesMin != null) conds.push(gte(dealerActive.miles, filter.milesMin));
  if (filter.milesMax != null) conds.push(lte(dealerActive.miles, filter.milesMax));
  if (filter.priceMin != null) conds.push(gte(dealerActive.price, filter.priceMin));
  if (filter.priceMax != null) conds.push(lte(dealerActive.price, filter.priceMax));
  const tokens = searchTokens(filter.q);
  for (const t of tokens) conds.push(sql`${t} <<% ${haystack}`);
  const relevance = tokens.length
    ? sql`(${sql.join(
        tokens.map((t) => sql`strict_word_similarity(${t}, ${haystack})`),
        sql` + `,
      )}) desc`
    : null;
  return { conds, relevance };
}

/**
 * Dealer inventory for the Buy page, most recently listed first (unknown listing dates
 * last), keyset paginated. A search is a single page of best matches.
 */
export async function listDealerListings(
  filter: DealerFilter = {},
): Promise<{ rows: DealerCardData[]; nextCursor: string | null }> {
  const limit = Math.min(filter.limit ?? DEALER_PAGE_SIZE, 100);
  const { conds, relevance } = conditions(filter);
  const cur = relevance ? null : decodeDealerCursor(filter.cursor);
  const id = dealerActive.id;
  if (cur)
    conds.push(
      cur.listedOn
        ? or(
            sql`${listedOnExpr} < ${cur.listedOn}`,
            sql`${listedOnExpr} is null`,
            and(sql`${listedOnExpr} = ${cur.listedOn}`, lt(id, cur.id)),
          )!
        : and(sql`${listedOnExpr} is null`, lt(id, cur.id))!,
    );
  const order = [sql`${listedOnExpr} desc nulls last`, desc(id)];
  const rows = await fromListedNow()
    .where(and(...conds))
    .orderBy(...(relevance ? [relevance, ...order] : order))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    rows: page,
    nextCursor:
      rows.length > limit && !relevance && last
        ? encodeDealerCursor({ listedOn: last.listedOn, id: last.id })
        : null,
  };
}

/** How many dealer listings are on the Buy page right now. Request-cached. */
export const countDealerListings = cache(async (): Promise<number> => {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dealerActive)
    .innerJoin(
      latest,
      and(eq(latest.modelId, dealerActive.modelId), eq(latest.day, dealerActive.snapshotDate)),
    )
    .where(listedNow);
  return Number(r?.n ?? 0);
});

/** Dealer listings of one model for its report page, most recently listed first, with the total. */
export async function listDealerListingsForModel(
  makeSlug: string,
  modelSlug: string,
  limit = 8,
): Promise<{ rows: DealerCardData[]; total: number }> {
  const scope = and(listedNow, eq(makes.slug, makeSlug), eq(models.slug, modelSlug))!;
  const [rows, [count]] = await Promise.all([
    fromListedNow()
      .where(scope)
      .orderBy(
        sql`${listedOnExpr} desc nulls last`,
        sql`${dealerActive.price} desc nulls last`,
        desc(dealerActive.id),
      )
      .limit(limit),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(dealerActive)
      .innerJoin(
        latest,
        and(eq(latest.modelId, dealerActive.modelId), eq(latest.day, dealerActive.snapshotDate)),
      )
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
  /** ISO-ish timestamp from Visor, validated to parse. */
  listedAt: string | null;
  fetchedAt: Date;
  /** Whether this row is in the model's newest, recent enough snapshot. */
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
      current: sql<boolean>`${dealerActive.snapshotDate} = (select max(b.snapshot_date) from dealer_active b where b.model_id = ${dealerActive.modelId}) and ${dealerActive.snapshotDate} >= current_date - ${DEALER_STALE_DAYS} and ${dealerActive.excludedReason} is null`,
    })
    .from(dealerActive)
    .innerJoin(models, eq(models.id, dealerActive.modelId))
    .innerJoin(makes, eq(makes.id, models.makeId))
    .leftJoin(generations, eq(generations.id, dealerActive.generationId))
    .where(eq(dealerActive.id, id))
    .limit(1);
  if (!r) return null;
  const { raw, generationCode, reportStatus, reportError, current, ...rest } = r;
  const j = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) =>
    typeof j[k] === "string" && (j[k] as string).trim() ? (j[k] as string) : null;
  const photos = Array.isArray(j.photo_urls)
    ? (j.photo_urls as unknown[]).filter(
        (u): u is string => typeof u === "string" && /^https:\/\//.test(u),
      )
    : [];
  const url = str("vdp_url");
  const listedAt = str("listed_at");
  return {
    ...rest,
    photos,
    url: url && /^https?:\/\//.test(url) ? url : null,
    stockNumber: str("stock_number"),
    listedAt: listedAt && !Number.isNaN(Date.parse(listedAt)) ? listedAt : null,
    current: !!current,
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
