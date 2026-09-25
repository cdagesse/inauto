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
 *
 * TODO verify against https://api.oldcarsdata.com/openapi.json before the first live run.
 */
import { fetchJson, redactParams } from "./http";
import { toInt, toIso, toStr, pick } from "./parse";
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
    async makes(): Promise<unknown[]> {
      return (await call("/makes", {})).rs;
    },
    async models(make: string): Promise<unknown[]> {
      return (await call("/models", { make })).rs;
    },
  };
}
export type OcdClient = ReturnType<typeof createOcdClient>;
