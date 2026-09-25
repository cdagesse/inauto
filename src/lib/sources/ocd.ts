/**
 * Old Cars Data API client (https://api.oldcarsdata.com).
 *
 * Known from the spec: Bearer auth, a real User-Agent is mandatory (403 otherwise),
 * endpoints /auctions, /stats, /makes, /models, /auctions/live, /auctions/{id}/bids,
 * OpenAPI at /openapi.json. Free plan: 20 rows per search, 10 searches a month.
 *
 * ASSUMPTIONS:
 *   - `GET /auctions?make=&model=&ended_after=<ISO>&page=&per_page=`
 *   - Response `{ data: Row[], page, total_pages }` (also tolerates a bare array / `{ auctions }`)
 *   - Row fields: id, platform|source|auction_house, url, vin, year, make, model, title,
 *     mileage|miles, price|hammer_price|sold_price|high_bid, status ("sold" | "reserve_not_met" | ...),
 *     ended_at|end_date|date
 *   - `GET /auctions/live?make=&model=&platform=&page=&per_page=` returns in-progress auctions with
 *     the same row shape plus current_bid|high_bid, bid_count|bids, reserve_met, starts_at|start_date,
 *     ends_at|end_date, images|photos|image_url, location, description|summary, trim, color
 *   - `GET /auctions/{id}/bids` returns `{ data: [{ amount, bidder, placed_at }] }` (or a bare array)
 *
 * TODO verify against https://api.oldcarsdata.com/openapi.json before the first live run.
 */
import { fetchJson, redactParams } from "./http";
import { toInt, toIso, toStr, pick } from "./parse";
import { resolvePlatform } from "./platforms";
import type { CallRecorder, NormalizedAuctionRow } from "./types";

export const OCD_BASE = "https://api.oldcarsdata.com";

export interface OcdClientOptions {
  apiKey: string;
  record: CallRecorder;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxPages?: number;
  perPage?: number;
}

function rows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const d = pick(body, "data", "auctions", "results", "items");
  return Array.isArray(d) ? d : [];
}

export function normalizeOcdStatus(v: unknown): NormalizedAuctionRow["status"] {
  const s = (toStr(v) ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "sold" || s === "won" || s === "completed_sold") return "sold";
  if (s === "withdrawn" || s === "cancelled" || s === "canceled") return "withdrawn";
  // reserve_not_met, rnm, not_sold, unsold, bid_to, ended
  return "rnm";
}

export function normalizeOcdRow(r: unknown): NormalizedAuctionRow | null {
  const id = toStr(pick(r, "id", "auction_id", "listing_id"));
  if (!id) return null;
  const status = normalizeOcdStatus(pick(r, "status", "result", "outcome"));
  const price =
    status === "sold"
      ? toInt(pick(r, "hammer_price", "sold_price", "price", "final_price", "high_bid"))
      : toInt(pick(r, "high_bid", "highest_bid", "price", "hammer_price", "final_price"));
  return {
    source: toStr(pick(r, "platform", "source", "auction_house", "site")) ?? "Unknown",
    sourceId: id,
    url: toStr(pick(r, "url", "link")),
    vin: toStr(pick(r, "vin")),
    year: toInt(pick(r, "year")),
    rawMake: toStr(pick(r, "make")),
    rawModel: toStr(pick(r, "model")),
    title: toStr(pick(r, "title", "name")),
    miles: toInt(pick(r, "mileage", "miles", "odometer")),
    hammerPrice: price,
    status,
    endedAt: toIso(pick(r, "ended_at", "end_date", "end_time", "date", "sold_at")),
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
  make: string | null;
  model: string | null;
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
    if (["true", "yes", "1", "met"].includes(s)) return true;
    if (["false", "no", "0", "not met", "not_met"].includes(s)) return false;
  }
  return null;
}

function toPhotoUrls(v: unknown): string[] {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  const out: string[] = [];
  for (const item of list) {
    const u =
      typeof item === "string" ? item : toStr(pick(item, "url", "src", "large", "medium", "image"));
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
  const s = (toStr(v) ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (["live", "active", "open", "in_progress", "running", ""].includes(s)) {
    return endsAt && new Date(endsAt).getTime() < now.getTime()
      ? ("ended" as const)
      : ("live" as const);
  }
  if (s === "withdrawn" || s === "cancelled" || s === "canceled") return "withdrawn" as const;
  if (s === "sold" || s === "won" || s === "completed_sold") return "sold" as const;
  if (s === "ended" || s === "closed") return "ended" as const;
  return "rnm" as const;
}

/** Tolerant mapping of a live-auction row. Returns null only when there is no id or no URL. */
export function normalizeLiveRow(r: unknown, now = new Date()): NormalizedLiveRow | null {
  const id = toStr(pick(r, "id", "auction_id", "listing_id"));
  const url = toStr(pick(r, "url", "link"));
  if (!id || !url) return null;
  const platform = resolvePlatform(
    url,
    toStr(pick(r, "platform", "source", "auction_house", "site")),
  );
  const year = toInt(pick(r, "year"));
  const make = toStr(pick(r, "make"));
  const model = toStr(pick(r, "model"));
  const endsAt = toIso(pick(r, "ends_at", "end_date", "end_time", "ended_at", "closes_at"));
  const title =
    toStr(pick(r, "title", "name")) ?? [year, make, model].filter(Boolean).join(" ") ?? "Listing";
  return {
    source: platform.key,
    sourceName:
      platform.key === "other"
        ? (toStr(pick(r, "platform", "source")) ?? platform.name)
        : platform.name,
    sourceId: id,
    url,
    title: title || "Listing",
    make,
    model,
    year,
    trim: toStr(pick(r, "trim", "variant")),
    vin: toStr(pick(r, "vin")),
    miles: toInt(pick(r, "mileage", "miles", "odometer")),
    color: toStr(pick(r, "color", "exterior_color", "exterior")),
    location: toStr(pick(r, "location", "city_state", "seller_location")),
    description: toStr(pick(r, "description", "summary", "excerpt")),
    photoUrls: toPhotoUrls(pick(r, "images", "photos", "image_urls", "image_url", "thumbnail")),
    currentBid: toInt(pick(r, "current_bid", "high_bid", "highest_bid", "price")),
    bidCount: toInt(pick(r, "bid_count", "bids", "num_bids")),
    reserveMet: toBool(pick(r, "reserve_met", "reserveMet")),
    startedAt: toIso(pick(r, "starts_at", "start_date", "started_at", "listed_at")),
    endsAt,
    status: normalizeLiveStatus(pick(r, "status", "state"), endsAt, now),
    raw: r,
  };
}

export interface LiveAuctionParams {
  make?: string;
  model?: string;
  platform?: string;
}

export function createOcdClient(o: OcdClientOptions) {
  const base = o.baseUrl ?? OCD_BASE;
  const maxPages = o.maxPages ?? 20;
  const perPage = o.perPage ?? 100;
  const headers = { Authorization: `Bearer ${o.apiKey}` };

  async function call(path: string, params: Record<string, string | number>) {
    const url = `${base}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
    await o.record.reserve(path);
    const res = await fetchJson(url, { headers, fetchImpl: o.fetchImpl });
    const rs = rows(res.body);
    await o.record.record({
      endpoint: path,
      params: redactParams(params),
      status: res.status,
      rateLimit: res.rateLimit,
      rowCount: rs.length,
      body: res.body,
    });
    if (!res.ok) throw new Error(`OCD ${path} returned ${res.status}`);
    return { res, rs };
  }

  return {
    /** Auction results for a make/model that ended after `since` (ISO). One budget unit per page. */
    async auctions(
      q: { make: string; model: string },
      since: string,
    ): Promise<NormalizedAuctionRow[]> {
      const out: NormalizedAuctionRow[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const { res, rs } = await call("/auctions", {
          make: q.make,
          model: q.model,
          ended_after: since,
          page,
          per_page: perPage,
        });
        for (const r of rs) {
          const n = normalizeOcdRow(r);
          if (n) out.push(n);
        }
        const tp = toInt(pick(res.body, "total_pages", "totalPages"));
        if (rs.length < perPage) break;
        if (tp != null && page >= tp) break;
      }
      return out;
    },
    /** In-progress auctions, optionally filtered. One budget unit per page. */
    async live(q: LiveAuctionParams = {}, now = new Date()): Promise<NormalizedLiveRow[]> {
      const out: NormalizedLiveRow[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const params: Record<string, string | number> = { page, per_page: perPage };
        if (q.make) params.make = q.make;
        if (q.model) params.model = q.model;
        if (q.platform) params.platform = q.platform;
        const { res, rs } = await call("/auctions/live", params);
        for (const r of rs) {
          const n = normalizeLiveRow(r, now);
          if (n) out.push(n);
        }
        const tp = toInt(pick(res.body, "total_pages", "totalPages"));
        if (rs.length < perPage) break;
        if (tp != null && page >= tp) break;
      }
      return out;
    },
    /** Bid history for one auction. One budget unit. */
    async bids(id: string): Promise<{ amount: number | null; placedAt: string | null }[]> {
      const safe = encodeURIComponent(id);
      const { rs } = await call(`/auctions/${safe}/bids`, {});
      return rs.map((b) => ({
        amount: toInt(pick(b, "amount", "bid", "value")),
        placedAt: toIso(pick(b, "placed_at", "created_at", "time", "date")),
      }));
    },
    async makes(): Promise<unknown[]> {
      return (await call("/makes", {})).rs;
    },
    async models(make: string): Promise<unknown[]> {
      return (await call("/models", { make })).rs;
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
export function fetchAuctionBids(opts: OcdClientOptions, id: string) {
  return createOcdClient(opts).bids(id);
}
