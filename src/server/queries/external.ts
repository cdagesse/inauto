import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { externalListings, generations, makes, models } from "@/db/schema";
import {
  decodeExternalCursor,
  encodeExternalCursor,
  type ExternalPhase,
} from "@/lib/listings/external-cursor";
import { searchTokens } from "@/lib/listings/search";
import { isPlatformKey, type PlatformKey } from "@/lib/sources/platforms";

export const EXTERNAL_PAGE_SIZE = 24;

/**
 * The sync flags a row "live" until the platform reports a result, so between
 * runs a live row can be past its end time. Treat those as settled everywhere
 * a reader sees them, so a card never says "Live" over an ended auction.
 */
const liveNow = and(
  eq(externalListings.status, "live"),
  or(sql`${externalListings.endsAt} is null`, sql`${externalListings.endsAt} >= now()`),
)!;
const settled = or(
  inArray(externalListings.status, ["sold", "rnm", "ended", "withdrawn"]),
  sql`${externalListings.endsAt} < now()`,
)!;

export interface ExternalCardData {
  id: string;
  source: PlatformKey;
  sourceName: string;
  sourceId: string;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  miles: number | null;
  location: string | null;
  currency: string;
  country: string | null;
  photoUrls: string[];
  currentBid: number | null;
  bidCount: number | null;
  finalPrice: number | null;
  status: "live" | "sold" | "rnm" | "withdrawn" | "ended";
  endsAt: Date | null;
}

const cardColumns = {
  id: externalListings.id,
  source: externalListings.source,
  sourceName: externalListings.sourceName,
  sourceId: externalListings.sourceId,
  title: externalListings.title,
  year: externalListings.year,
  make: externalListings.make,
  model: externalListings.model,
  miles: externalListings.miles,
  location: externalListings.location,
  currency: externalListings.currency,
  country: externalListings.country,
  photoUrls: externalListings.photoUrls,
  currentBid: externalListings.currentBid,
  bidCount: externalListings.bidCount,
  finalPrice: externalListings.finalPrice,
  status: externalListings.status,
  endsAt: externalListings.endsAt,
};

function asCard(
  r: typeof cardColumns extends infer T ? { [K in keyof T]: unknown } : never,
): ExternalCardData {
  const row = r as unknown as Omit<ExternalCardData, "source"> & { source: string };
  return { ...row, source: isPlatformKey(row.source) ? row.source : "other" };
}

export interface ExternalFilter {
  source?: PlatformKey;
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
  /** Fuzzy search; results come best match first and are not paged. */
  q?: string;
  /** Live auctions (default) or settled results. */
  phase?: ExternalPhase;
  /** Past phase only: only those that sold, or only those that did not. */
  result?: "sold" | "unsold";
  limit?: number;
}

/**
 * Live auctions soonest ending first, or, with `phase: "past"`, settled ones
 * newest first. Keyset paginated so deep pages stay cheap. A cursor from the
 * other phase is ignored, so the request starts from the first page.
 */
export async function listExternalListings(filter: ExternalFilter = {}) {
  const limit = Math.min(filter.limit ?? EXTERNAL_PAGE_SIZE, 100);
  const phase: ExternalPhase = filter.phase ?? "live";
  const tokens = searchTokens(filter.q);
  // Relevance ordering has no stable key to page on, so a search is a single page.
  const decoded = tokens.length ? null : decodeExternalCursor(filter.cursor);
  const cur = decoded?.phase === phase ? decoded : null;
  const conds = [] as ReturnType<typeof eq>[];
  // Same immutable expression as external_listing_search_trgm_idx (migration 0014), so `<<%` uses it.
  const haystack = sql`lower(coalesce(${externalListings.year}::text, '') || ' ' || coalesce(${externalListings.make}, '') || ' ' || coalesce(${externalListings.model}, '') || ' ' || coalesce(${externalListings.trim}, '') || ' ' || coalesce(${externalListings.title}, ''))`;
  for (const t of tokens) conds.push(sql`${t} <<% ${haystack}`);
  const relevance = tokens.length
    ? sql`(${sql.join(
        tokens.map((t) => sql`strict_word_similarity(${t}, ${haystack})`),
        sql` + `,
      )}) desc`
    : null;
  if (filter.source) conds.push(eq(externalListings.source, filter.source));
  if (filter.make) conds.push(sql`lower(${externalListings.make}) = ${filter.make.toLowerCase()}`);
  const like = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  if (filter.model)
    conds.push(
      or(
        ilike(externalListings.model, like(filter.model)),
        ilike(externalListings.title, like(filter.model)),
      )!,
    );
  if (filter.trim)
    conds.push(
      or(
        ilike(externalListings.trim, like(filter.trim)),
        ilike(externalListings.title, like(filter.trim)),
      )!,
    );
  if (filter.yearMin != null) conds.push(gte(externalListings.year, filter.yearMin));
  if (filter.yearMax != null) conds.push(lte(externalListings.year, filter.yearMax));
  if (filter.milesMin != null) conds.push(gte(externalListings.miles, filter.milesMin));
  if (filter.milesMax != null) conds.push(lte(externalListings.miles, filter.milesMax));
  const priceExpr = sql<
    number | null
  >`coalesce(${externalListings.finalPrice}, ${externalListings.currentBid})`;
  if (filter.priceMin != null) conds.push(sql`${priceExpr} >= ${filter.priceMin}`);
  if (filter.priceMax != null) conds.push(sql`${priceExpr} <= ${filter.priceMax}`);

  const endsAt = externalListings.endsAt;
  const id = externalListings.id;
  let order: SQL[];
  if (phase === "live") {
    conds.push(liveNow);
    // ends_at asc nulls last (Postgres' default for asc, spelled out to match the
    // predicate), then id asc. Rows without an end time sit at the tail, so once
    // the cursor is inside them only later ids of that group remain.
    if (cur)
      conds.push(
        cur.endsAt
          ? or(gt(endsAt, cur.endsAt), isNull(endsAt), and(eq(endsAt, cur.endsAt), gt(id, cur.id)))!
          : and(isNull(endsAt), gt(id, cur.id))!,
      );
    order = [sql`${endsAt} asc nulls last`, asc(id)];
  } else {
    conds.push(settled);
    if (filter.result === "sold") conds.push(eq(externalListings.status, "sold"));
    else if (filter.result === "unsold")
      conds.push(inArray(externalListings.status, ["rnm", "withdrawn"]));
    // ends_at desc nulls first (Postgres' default for desc), then id desc. Rows
    // without an end time come first, so a null cursor still has to admit every
    // dated row after the rest of the null group.
    if (cur)
      conds.push(
        cur.endsAt
          ? or(lt(endsAt, cur.endsAt), and(eq(endsAt, cur.endsAt), lt(id, cur.id)))!
          : or(and(isNull(endsAt), lt(id, cur.id)), isNotNull(endsAt))!,
      );
    order = [sql`${endsAt} desc nulls first`, desc(id)];
  }

  const rows = await db
    .select(cardColumns)
    .from(externalListings)
    .where(and(...conds))
    .orderBy(...(relevance ? [relevance, ...order] : order))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    rows: page.map(asCard),
    nextCursor:
      rows.length > limit && !relevance ? encodeExternalCursor(phase, page[page.length - 1]) : null,
    /** A search shows its best matches only; true when more matched than fit the page. */
    truncated: !!relevance && rows.length > limit,
  };
}

export interface ExternalDetail extends ExternalCardData {
  url: string;
  trim: string | null;
  vin: string | null;
  color: string | null;
  description: string | null;
  reserveMet: boolean | null;
  startedAt: Date | null;
  fetchedAt: Date;
  /** The source row as fetched; extra listing details (engine, flaws, history) live here. */
  raw: Record<string, unknown> | null;
  market: {
    makeSlug: string;
    modelSlug: string;
    modelName: string;
    generationCode: string | null;
    reportStatus: "none" | "requested" | "building" | "ready" | "failed";
    reportError: string | null;
  } | null;
}

/** One external listing with its catalog match. Request-cached: generateMetadata and the page share one read. */
export const getExternalListing = cache(
  async (source: PlatformKey, sourceId: string): Promise<ExternalDetail | null> => {
    const [r] = await db
      .select({
        ...cardColumns,
        url: externalListings.url,
        trim: externalListings.trim,
        vin: externalListings.vin,
        color: externalListings.color,
        description: externalListings.description,
        reserveMet: externalListings.reserveMet,
        startedAt: externalListings.startedAt,
        fetchedAt: externalListings.fetchedAt,
        rawJson: externalListings.rawJson,
        makeSlug: makes.slug,
        modelSlug: models.slug,
        modelName: models.name,
        generationCode: generations.code,
        reportStatus: models.reportStatus,
        reportError: models.reportError,
      })
      .from(externalListings)
      .leftJoin(models, eq(models.id, externalListings.modelId))
      .leftJoin(makes, eq(makes.id, models.makeId))
      .leftJoin(generations, eq(generations.id, externalListings.generationId))
      .where(and(eq(externalListings.source, source), eq(externalListings.sourceId, sourceId)))
      .limit(1);
    if (!r) return null;
    const { makeSlug, modelSlug, modelName, generationCode, reportStatus, reportError, ...rest } =
      r;
    return {
      ...asCard(rest),
      url: rest.url,
      trim: rest.trim,
      vin: rest.vin,
      color: rest.color,
      description: rest.description,
      reserveMet: rest.reserveMet,
      startedAt: rest.startedAt,
      fetchedAt: rest.fetchedAt,
      raw:
        rest.rawJson && typeof rest.rawJson === "object" && !Array.isArray(rest.rawJson)
          ? (rest.rawJson as Record<string, unknown>)
          : null,
      market:
        makeSlug && modelSlug && modelName && reportStatus
          ? {
              makeSlug,
              modelSlug,
              modelName,
              generationCode: generationCode ?? null,
              reportStatus,
              reportError: reportError ?? null,
            }
          : null,
    };
  },
);

/** For the outbound redirect: the id and destination only. */
export async function getExternalTarget(id: string): Promise<{ id: string; url: string } | null> {
  const [r] = await db
    .select({ id: externalListings.id, url: externalListings.url })
    .from(externalListings)
    .where(eq(externalListings.id, id))
    .limit(1);
  return r ?? null;
}

/** Counts per platform among live listings, for the source filter chips. */
export async function countLiveBySource(): Promise<Record<string, number>> {
  const rows = await db
    .select({ source: externalListings.source, n: sql<number>`count(*)::int` })
    .from(externalListings)
    .where(liveNow)
    .groupBy(externalListings.source);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.source] = Number(r.n);
  return out;
}
