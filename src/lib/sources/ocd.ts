/**
 * Old Cars Data API client (https://api.oldcarsdata.com).
 *
 * Verified against https://api.oldcarsdata.com/openapi.json:
 *   - Auth `Authorization: Bearer <OCD_API_KEY>`; a real User-Agent is mandatory.
 *   - `/makes` and `/models?make=` are PUBLIC (no auth, not counted against the budget).
 *   - `GET /auctions` params: make, model, vin, seller_username, year_min, year_max, price_min,
 *     price_max, status, source, keyword, sort, direction, pagination (`cursor` recommended),
 *     cursor, page, limit (1–100). Cursor response: `meta.has_more`, `meta.next_cursor`;
 *     page response: `meta.total, meta.page, meta.limit, meta.total_pages`. Rows in `data`.
 *   - `GET /auctions/live` params: make, model, vin, seller_username, year_min, year_max,
 *     price_min, price_max, source, keyword, ending_after, ending_before, updated_since, sort,
 *     direction, page, limit.
 *   - `GET /auctions/{auction_id}/bids` (integer id): bid_after, bid_before, sort, direction,
 *     page, limit.
 *   - Auction object: id, source (platform), url, vin, seller_username, year, listing_make,
 *     listing_model, ocd_make_name, ocd_model_name, engine, drivetrain, transmission, body_style,
 *     title_status, mileage, mileage_unit, exterior_color, standard_exterior_color,
 *     interior_color, modifications, known_flaws, recent_service_history, title, description,
 *     auction_status (sold | result unavailable | reserve not met | canceled | unknown | active |
 *     withdrawn), has_reserve, auction_end_at, auction_end_precision, price, currency, city,
 *     state, zip, country_code, stats { views, watches, likes, bids, unique_bidder_count },
 *     featured_image_url, created_at, seller_type, listing_details, ownership_history.
 *   - OCD "models" are LINES (Porsche "911", Mercedes-Benz "S-Class"): variants such as
 *     "GT3 RS" or "S63" are found with `keyword`. Our alias therefore stores the line in
 *     rawModel ("" when OCD has no matching line) and the keyword in rawTrimPattern.
 *
 * Whether `sort=auction_end_at` is accepted is not stated by the spec; the client tries it and
 * falls back to unsorted paging (with a page cap) on a validation error.
 */
import { fetchJson, redactParams } from "./http";
import { toInt, toIso, toStr, pick } from "./parse";
import { resolvePlatform } from "./platforms";
import type { CallRecorder, NormalizedAuctionRow } from "./types";

export const OCD_BASE = "https://api.oldcarsdata.com";
export const OCD_PAGE_SIZE = 100;
const KM_TO_MILES = 0.621371;

export interface OcdClientOptions {
  apiKey: string;
  record: CallRecorder;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxPages?: number;
  perPage?: number;
}

export class OcdApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`OCD ${endpoint} returned ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "OcdApiError";
  }
}

function rows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const d = pick(body, "data");
  return Array.isArray(d) ? d : [];
}
function meta(body: unknown) {
  const m = pick(body, "meta");
  return {
    hasMore: pick(m, "has_more") === true,
    nextCursor: toStr(pick(m, "next_cursor")),
    totalPages: toInt(pick(m, "total_pages")),
  };
}
function errorDetail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const err = pick(body, "error", "message", "detail");
  const text =
    typeof err === "string"
      ? err
      : err && typeof err === "object"
        ? String(pick(err, "message", "code") ?? "")
        : "";
  return text.replace(/\s+/g, " ").slice(0, 160);
}

/* ------------------------------------------------------------------ */
/* Alias encoding: rawModel = OCD line ("" = any), rawTrimPattern = keyword [!~ exclude] */
/* ------------------------------------------------------------------ */

export const OCD_EXCLUDE_SEP = " !~ ";

export interface OcdAlias {
  make: string;
  /** OCD model line, or "" to match any line of the make. */
  model: string;
  keyword: string | null;
  excludeKeyword: string | null;
}

export function encodeOcdKeyword(keyword?: string | null, exclude?: string | null): string | null {
  const k = (keyword ?? "").trim();
  const x = (exclude ?? "").trim();
  if (!k && !x) return null;
  return x ? `${k}${OCD_EXCLUDE_SEP}${x}` : k;
}

export function parseOcdAlias(a: {
  rawMake: string;
  rawModel: string | null;
  rawTrimPattern: string | null;
}): OcdAlias {
  const raw = (a.rawTrimPattern ?? "").trim();
  const i = raw.indexOf(OCD_EXCLUDE_SEP);
  const keyword = (i >= 0 ? raw.slice(0, i) : raw).trim() || null;
  const excludeKeyword = (i >= 0 ? raw.slice(i + OCD_EXCLUDE_SEP.length) : "").trim() || null;
  return { make: a.rawMake, model: (a.rawModel ?? "").trim(), keyword, excludeKeyword };
}

const squash = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const hasWord = (text: string, word: string) =>
  new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(
    text,
  );

/** Does a normalized OCD row belong to this alias? Keyword matching ignores spacing ("S 63" = "S63"). */
export function ocdRowMatches(
  alias: OcdAlias,
  row: {
    rawMake: string | null;
    rawModel: string | null;
    title: string | null;
    year?: number | null;
  },
  years?: { start: number | null; end: number | null },
): boolean {
  if (squash(alias.make) !== squash(row.rawMake)) return false;
  if (alias.model && squash(alias.model) !== squash(row.rawModel)) return false;
  const title = row.title ?? "";
  if (alias.keyword && !squash(title).includes(squash(alias.keyword))) return false;
  if (alias.excludeKeyword && hasWord(title, alias.excludeKeyword)) return false;
  if (years && row.year != null) {
    if (years.start != null && row.year < years.start) return false;
    if (years.end != null && row.year > years.end) return false;
  }
  return true;
}

/** Resolve a row to the first matching OCD alias rule's model id. */
export function matchOcdRules(
  rules: {
    modelId: string;
    source: string;
    rawMake: string;
    rawModel: string | null;
    rawTrimPattern: string | null;
  }[],
  row: { rawMake: string | null; rawModel: string | null; title: string | null },
): string | null {
  for (const r of rules) {
    if (r.source !== "ocd") continue;
    if (ocdRowMatches(parseOcdAlias(r), row)) return r.modelId;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Normalizers                                                         */
/* ------------------------------------------------------------------ */

export type OcdStatus = "sold" | "rnm" | "withdrawn" | "active" | "unknown";

/** Map `auction_status` to our vocabulary. "active" and "unknown" are kept distinct for callers. */
export function normalizeOcdStatus(v: unknown): OcdStatus {
  const s = (toStr(v) ?? "")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
  if (s === "sold") return "sold";
  if (s === "reserve not met" || s === "rnm" || s === "not sold" || s === "unsold") return "rnm";
  if (s === "withdrawn" || s === "canceled" || s === "cancelled") return "withdrawn";
  if (s === "active" || s === "live") return "active";
  return "unknown"; // "unknown", "result unavailable", ""
}

function toMiles(r: unknown): number | null {
  const n = toInt(pick(r, "mileage"));
  if (n == null) return null;
  const unit = (toStr(pick(r, "mileage_unit")) ?? "mi").toLowerCase();
  return unit.startsWith("k") ? Math.round(n * KM_TO_MILES) : n;
}
function isUsd(r: unknown): boolean {
  const c = toStr(pick(r, "currency"));
  return !c || c.toUpperCase() === "USD";
}
function locationOf(r: unknown): string | null {
  const parts = [toStr(pick(r, "city")), toStr(pick(r, "state"))].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** An ended auction as we store it in auction_result. Returns null for rows without an id or still active. */
export function normalizeOcdRow(r: unknown): NormalizedAuctionRow | null {
  const id = toStr(pick(r, "id"));
  if (!id) return null;
  const s = normalizeOcdStatus(pick(r, "auction_status"));
  if (s === "active") return null;
  const status: NormalizedAuctionRow["status"] =
    s === "sold" ? "sold" : s === "withdrawn" ? "withdrawn" : "rnm";
  const url = toStr(pick(r, "url"));
  return {
    source: resolvePlatform(url, toStr(pick(r, "source"))).name,
    sourceId: id,
    url,
    vin: toStr(pick(r, "vin")),
    year: toInt(pick(r, "year")),
    rawMake: toStr(pick(r, "ocd_make_name")) ?? toStr(pick(r, "listing_make")),
    rawModel: toStr(pick(r, "ocd_model_name")) ?? toStr(pick(r, "listing_model")),
    title: toStr(pick(r, "title")),
    miles: toMiles(r),
    hammerPrice: toInt(pick(r, "price")), // hammer when sold, high bid otherwise
    status,
    endedAt: toIso(pick(r, "auction_end_at")),
    needsReview: s === "unknown" || !isUsd(r),
    raw: r,
  };
}

/** A third-party auction that is (or was) in progress, as we store it in external_listing. */
export interface NormalizedLiveRow {
  source: string; // platform key
  sourceName: string; // platform display name
  sourceId: string;
  url: string;
  title: string;
  make: string | null; // ocd_make_name
  model: string | null; // ocd_model_name (line)
  year: number | null;
  trim: string | null;
  vin: string | null;
  miles: number | null;
  color: string | null;
  location: string | null;
  description: string | null;
  photoUrls: string[];
  currentBid: number | null;
  bidCount: number | null;
  reserveMet: boolean | null;
  hasReserve: boolean | null;
  startedAt: string | null; // ISO
  endsAt: string | null; // ISO
  status: "live" | "sold" | "rnm" | "withdrawn" | "ended";
  raw: unknown;
}

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "yes", "1"].includes(s)) return true;
    if (["false", "no", "0"].includes(s)) return false;
  }
  return null;
}

function toPhotoUrls(v: unknown): string[] {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  const out: string[] = [];
  for (const item of list) {
    const u = typeof item === "string" ? item : toStr(pick(item, "url", "src"));
    if (!u) continue;
    try {
      if (new URL(u).protocol === "https:") out.push(u);
    } catch {
      /* skip */
    }
    if (out.length >= 24) break;
  }
  return out;
}

export function normalizeLiveStatus(v: unknown, endsAt: string | null, now = new Date()) {
  const s = normalizeOcdStatus(v);
  if (s === "active" || (s === "unknown" && !toStr(v))) {
    return endsAt && new Date(endsAt).getTime() < now.getTime()
      ? ("ended" as const)
      : ("live" as const);
  }
  if (s === "withdrawn") return "withdrawn" as const;
  if (s === "sold") return "sold" as const;
  if (s === "rnm") return "rnm" as const;
  // "unknown" / "result unavailable" with an explicit value: the auction is over, result pending.
  return "ended" as const;
}

/** Mapping of a live-auction row. Returns null only when there is no id or no URL. */
export function normalizeLiveRow(r: unknown, now = new Date()): NormalizedLiveRow | null {
  const id = toStr(pick(r, "id"));
  const url = toStr(pick(r, "url"));
  if (!id || !url) return null;
  const platform = resolvePlatform(url, toStr(pick(r, "source")));
  const year = toInt(pick(r, "year"));
  const make = toStr(pick(r, "ocd_make_name")) ?? toStr(pick(r, "listing_make"));
  const model = toStr(pick(r, "ocd_model_name")) ?? toStr(pick(r, "listing_model"));
  const endsAt = toIso(pick(r, "auction_end_at"));
  const title = toStr(pick(r, "title")) ?? [year, make, model].filter(Boolean).join(" ");
  const stats = pick(r, "stats");
  return {
    source: platform.key,
    sourceName:
      platform.key === "other" ? (toStr(pick(r, "source")) ?? platform.name) : platform.name,
    sourceId: id,
    url,
    title: title || "Listing",
    make,
    model,
    year,
    trim: toStr(pick(r, "listing_model")) === model ? null : toStr(pick(r, "listing_model")),
    vin: toStr(pick(r, "vin")),
    miles: toMiles(r),
    color: toStr(pick(r, "exterior_color")) ?? toStr(pick(r, "standard_exterior_color")),
    location: locationOf(r),
    description: toStr(pick(r, "description")),
    photoUrls: toPhotoUrls(pick(r, "featured_image_url")),
    currentBid: toInt(pick(r, "price")),
    bidCount: toInt(pick(stats, "bids")),
    reserveMet: null, // has_reserve says only whether a reserve exists
    hasReserve: toBool(pick(r, "has_reserve")),
    startedAt: toIso(pick(r, "created_at")),
    endsAt,
    status: normalizeLiveStatus(pick(r, "auction_status"), endsAt, now),
    raw: r,
  };
}

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

export interface OcdAuctionQuery {
  make: string;
  /** OCD line; omit or "" to search the whole make. */
  model?: string;
  keyword?: string | null;
  yearMin?: number | null;
  yearMax?: number | null;
}

export interface LiveAuctionParams extends Partial<OcdAuctionQuery> {
  /** ISO timestamp; only auctions updated since then (used for the unfiltered "all" sweep). */
  updatedSince?: string;
  source?: string;
}

type Params = Record<string, string | number>;

function queryParams(q: Partial<OcdAuctionQuery>): Params {
  const p: Params = {};
  if (q.make) p.make = q.make;
  if (q.model) p.model = q.model;
  if (q.keyword) p.keyword = q.keyword;
  if (q.yearMin != null) p.year_min = q.yearMin;
  if (q.yearMax != null) p.year_max = q.yearMax;
  return p;
}

export function createOcdClient(o: OcdClientOptions) {
  const base = o.baseUrl ?? OCD_BASE;
  const maxPages = o.maxPages ?? 20;
  const perPage = Math.min(o.perPage ?? OCD_PAGE_SIZE, 100);
  const headers = { Authorization: `Bearer ${o.apiKey}` };
  /** Whether /auctions accepts sort=auction_end_at; flipped off for the client's lifetime on a rejection. */
  let sortSupported = true;

  async function call(path: string, params: Params, free = false) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const url = `${base}${path}${qs.size ? `?${qs}` : ""}`;
    await o.record.reserve(path, { free });
    const res = await fetchJson(url, { headers: free ? {} : headers, fetchImpl: o.fetchImpl });
    const rs = rows(res.body);
    await o.record.record({
      endpoint: path,
      params: redactParams(params),
      status: res.status,
      rateLimit: res.rateLimit,
      rowCount: rs.length,
      body: res.body,
    });
    if (!res.ok) throw new OcdApiError(path, res.status, errorDetail(res.body));
    return { res, rs };
  }

  /**
   * Cursor-paged walk over /auctions. `since` (ISO) stops the walk once a page's newest row is
   * older than it, which only works when the API honours newest-first sorting; otherwise the
   * walk relies on the page cap.
   */
  async function walkAuctions(
    baseParams: Params,
    since: string | null,
    out: NormalizedAuctionRow[],
    seen: Set<string>,
  ) {
    let cursor: string | null = null;
    for (let page = 0; page < maxPages; page++) {
      const sorted = sortSupported;
      const params: Params = { ...baseParams, pagination: "cursor", limit: perPage };
      if (sorted) {
        params.sort = "auction_end_at";
        params.direction = "desc";
      }
      if (cursor) params.cursor = cursor;
      let result: Awaited<ReturnType<typeof call>>;
      try {
        result = await call("/auctions", params);
      } catch (e) {
        if (sorted && e instanceof OcdApiError && (e.status === 400 || e.status === 422)) {
          sortSupported = false; // sort not accepted: retry this page unsorted
          page--;
          continue;
        }
        throw e;
      }
      let oldest: number | null = null;
      for (const r of result.rs) {
        const n = normalizeOcdRow(r);
        if (!n || seen.has(n.sourceId)) continue;
        seen.add(n.sourceId);
        const t = n.endedAt ? new Date(n.endedAt).getTime() : null;
        if (t != null) oldest = oldest == null ? t : Math.min(oldest, t);
        if (since && t != null && t < new Date(since).getTime()) continue;
        out.push(n);
      }
      const m = meta(result.res.body);
      if (sorted && since && oldest != null && oldest < new Date(since).getTime()) break;
      if (!m.hasMore || !m.nextCursor) break;
      cursor = m.nextCursor;
    }
  }

  return {
    /**
     * Ended auctions (sold and reserve-not-met, plus withdrawn) for a query, newest first, back to
     * `since` (ISO) or the page cap. One budget unit per page.
     */
    async auctions(q: OcdAuctionQuery, since: string | null): Promise<NormalizedAuctionRow[]> {
      const out: NormalizedAuctionRow[] = [];
      const seen = new Set<string>();
      // Two status-scoped walks keep each one short; unknown statuses are dropped by the normalizer.
      for (const status of ["sold", "reserve not met"]) {
        await walkAuctions({ ...queryParams(q), status }, since, out, seen);
      }
      return out;
    },
    /** In-progress auctions. One budget unit per page. */
    async live(q: LiveAuctionParams = {}, now = new Date()): Promise<NormalizedLiveRow[]> {
      const out: NormalizedLiveRow[] = [];
      const params: Params = { ...queryParams(q), limit: perPage };
      if (q.updatedSince) params.updated_since = q.updatedSince;
      if (q.source) params.source = q.source;
      for (let page = 1; page <= maxPages; page++) {
        const { res, rs } = await call("/auctions/live", { ...params, page });
        for (const r of rs) {
          const n = normalizeLiveRow(r, now);
          if (n) out.push(n);
        }
        const m = meta(res.body);
        if (rs.length < perPage) break;
        if (m.totalPages != null && page >= m.totalPages) break;
        if (m.hasMore === false) break;
      }
      return out;
    },
    /** Bid history for one auction (integer id). One budget unit. */
    async bids(id: string | number): Promise<{ amount: number | null; placedAt: string | null }[]> {
      const safe = encodeURIComponent(String(id));
      const { rs } = await call(`/auctions/${safe}/bids`, { limit: perPage });
      return rs.map((b) => ({
        amount: toInt(pick(b, "amount", "bid_amount", "price")),
        placedAt: toIso(pick(b, "bid_at", "placed_at", "created_at")),
      }));
    },
    /** Public: make names. Not counted against the budget. */
    async makes(): Promise<string[]> {
      return (await call("/makes", {}, true)).rs.map(String);
    },
    /** Public: model lines for a make. Not counted against the budget. */
    async models(make: string): Promise<string[]> {
      return (await call("/models", { make }, true)).rs.map(String);
    },
  };
}
export type OcdClient = ReturnType<typeof createOcdClient>;

/** Convenience wrappers matching the job's call sites. */
export function fetchLiveAuctions(
  opts: OcdClientOptions,
  params: LiveAuctionParams = {},
  now = new Date(),
): Promise<NormalizedLiveRow[]> {
  return createOcdClient(opts).live(params, now);
}
export function fetchAuctionBids(opts: OcdClientOptions, id: string | number) {
  return createOcdClient(opts).bids(id);
}
