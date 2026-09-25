import "server-only";
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { externalListings, generations, makes, models } from "@/db/schema";
import { isPlatformKey, type PlatformKey } from "@/lib/sources/platforms";

export const EXTERNAL_PAGE_SIZE = 24;

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

/** Cursor for the external feed: "<endsAtISO|null>|<id>". Live rows sort by endsAt asc, then settled rows by endsAt desc. */
function decodeCursor(
  c?: string,
): { endsAt: Date | null; id: string; phase: "live" | "done" } | null {
  if (!c) return null;
  try {
    const [phase, ts, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
    if ((phase !== "live" && phase !== "done") || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const d = ts === "null" ? null : new Date(ts);
    if (d && Number.isNaN(d.getTime())) return null;
    return { endsAt: d, id, phase };
  } catch {
    return null;
  }
}
function encodeCursor(phase: "live" | "done", row: { endsAt: Date | null; id: string }): string {
  return Buffer.from(
    `${phase}|${row.endsAt ? row.endsAt.toISOString() : "null"}|${row.id}`,
  ).toString("base64url");
}

export interface ExternalFilter {
  source?: PlatformKey;
  make?: string;
  cursor?: string;
  /** Live only (default) or include recently settled results. */
  includeSettled?: boolean;
  limit?: number;
}

/**
 * Live auctions first (soonest ending first), then, when asked, settled ones
 * newest first. Keyset paginated so deep pages stay cheap.
 */
export async function listExternalListings(filter: ExternalFilter = {}) {
  const limit = Math.min(filter.limit ?? EXTERNAL_PAGE_SIZE, 100);
  const cur = decodeCursor(filter.cursor);
  const base = [] as ReturnType<typeof eq>[];
  if (filter.source) base.push(eq(externalListings.source, filter.source));
  if (filter.make) base.push(sql`lower(${externalListings.make}) = ${filter.make.toLowerCase()}`);

  const out: ExternalCardData[] = [];
  let nextCursor: string | null = null;

  if (!cur || cur.phase === "live") {
    const conds = [...base, eq(externalListings.status, "live")];
    if (cur)
      conds.push(
        or(
          cur.endsAt ? gt(externalListings.endsAt, cur.endsAt) : sql`false`,
          and(
            cur.endsAt
              ? eq(externalListings.endsAt, cur.endsAt)
              : sql`${externalListings.endsAt} is null`,
            gt(externalListings.id, cur.id),
          ),
        )!,
      );
    const rows = await db
      .select(cardColumns)
      .from(externalListings)
      .where(and(...conds))
      .orderBy(asc(externalListings.endsAt), asc(externalListings.id))
      .limit(limit + 1);
    if (rows.length > limit) {
      const page = rows.slice(0, limit);
      out.push(...page.map(asCard));
      return { rows: out, nextCursor: encodeCursor("live", page[page.length - 1]) };
    }
    out.push(...rows.map(asCard));
    if (!filter.includeSettled) return { rows: out, nextCursor: null };
  }

  const remaining = limit - out.length;
  if (remaining <= 0)
    return {
      rows: out,
      nextCursor: cur
        ? encodeCursor("done", { endsAt: null, id: "00000000-0000-0000-0000-000000000000" })
        : null,
    };
  const conds = [...base, inArray(externalListings.status, ["sold", "rnm", "ended", "withdrawn"])];
  if (cur?.phase === "done")
    conds.push(
      or(
        cur.endsAt ? lt(externalListings.endsAt, cur.endsAt) : sql`false`,
        and(
          cur.endsAt
            ? eq(externalListings.endsAt, cur.endsAt)
            : sql`${externalListings.endsAt} is null`,
          lt(externalListings.id, cur.id),
        ),
      )!,
    );
  const rows = await db
    .select(cardColumns)
    .from(externalListings)
    .where(and(...conds))
    .orderBy(desc(externalListings.endsAt), desc(externalListings.id))
    .limit(remaining + 1);
  const page = rows.slice(0, remaining);
  out.push(...page.map(asCard));
  if (rows.length > remaining) nextCursor = encodeCursor("done", page[page.length - 1]);
  return { rows: out, nextCursor };
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
  market: {
    makeSlug: string;
    modelSlug: string;
    modelName: string;
    generationCode: string | null;
    reportStatus: "none" | "requested" | "building" | "ready" | "failed";
    reportError: string | null;
  } | null;
}

export async function getExternalListing(
  source: PlatformKey,
  sourceId: string,
): Promise<ExternalDetail | null> {
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
  const { makeSlug, modelSlug, modelName, generationCode, reportStatus, reportError, ...rest } = r;
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
}

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
    .where(eq(externalListings.status, "live"))
    .groupBy(externalListings.source);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.source] = Number(r.n);
  return out;
}
