/**
 * Visor API client (https://api.visor.vin).
 *
 * ASSUMPTIONS (the spec gives fields, not request shapes):
 *   - `GET /v1/listings/sold?make=&model=&trim=&days=&page=&limit=100`
 *   - `GET /v1/listings/active?make=&model=&trim=&page=&limit=100`
 *   - Auth header `X-API-Key: <VISOR_API_KEY>`
 *   - Response `{ data: Row[], page, total_pages }` (also tolerates a bare array or `{ listings }`)
 *   - Row fields: id, vin, year, make, model, trim, mileage|miles, price, exterior_color|color,
 *     dealer_name|dealer, state, days_on_market|dom, sold_at|sold_date
 *   - Sold history begins about Feb 17, 2026; 100 rows per page.
 *   - The asking price when a listing left the market is our "dealer sale price".
 *
 * TODO verify against Visor's API docs / OpenAPI before the first live run.
 * Keys are only ever read from the environment by the job runner and passed in here.
 */
import { fetchJson, redactParams } from "./http";
import { toDateOnly, toInt, toStr, pick } from "./parse";
import type { CallRecorder, NormalizedDealerRow } from "./types";

export const VISOR_BASE = "https://api.visor.vin";
export const VISOR_PAGE_SIZE = 100;

export interface VisorClientOptions {
  apiKey: string;
  record: CallRecorder;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Hard stop on pages per query so a runaway pagination cannot drain the budget. */
  maxPages?: number;
}

export interface VisorQuery {
  make: string;
  model: string;
  /** Substring the trim must contain (server-side filter if supported; we also filter client-side). */
  trim?: string;
}

function rows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const d = pick(body, "data", "listings", "results");
  return Array.isArray(d) ? d : [];
}
function totalPages(body: unknown): number | null {
  const tp = toInt(pick(body, "total_pages", "totalPages", "pages"));
  return tp ?? null;
}

export function normalizeVisorRow(r: unknown): NormalizedDealerRow | null {
  const id = toStr(pick(r, "id", "listing_id", "listingId"));
  if (!id) return null;
  return {
    sourceListingId: id,
    vin: toStr(pick(r, "vin")),
    year: toInt(pick(r, "year")),
    rawMake: toStr(pick(r, "make")),
    rawModel: toStr(pick(r, "model")),
    rawTrim: toStr(pick(r, "trim")),
    miles: toInt(pick(r, "mileage", "miles")),
    price: toInt(pick(r, "price", "asking_price", "list_price")),
    color: toStr(pick(r, "exterior_color", "color", "exteriorColor")),
    dealerName: toStr(pick(r, "dealer_name", "dealer", "dealerName")),
    state: toStr(pick(r, "state", "dealer_state")),
    daysOnMarket: toInt(pick(r, "days_on_market", "dom", "daysOnMarket")),
    soldDate: toDateOnly(pick(r, "sold_at", "sold_date", "soldDate", "removed_at")),
    raw: r,
  };
}

export function createVisorClient(o: VisorClientOptions) {
  const base = o.baseUrl ?? VISOR_BASE;
  const maxPages = o.maxPages ?? 50;

  async function paged(
    path: string,
    params: Record<string, string | number>,
  ): Promise<NormalizedDealerRow[]> {
    const out: NormalizedDealerRow[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const qp = { ...params, page, limit: VISOR_PAGE_SIZE };
      const url = `${base}${path}?${new URLSearchParams(Object.entries(qp).map(([k, v]) => [k, String(v)]))}`;
      await o.record.reserve(path);
      const res = await fetchJson(url, {
        headers: { "X-API-Key": o.apiKey },
        fetchImpl: o.fetchImpl,
      });
      const rs = rows(res.body);
      await o.record.record({
        endpoint: path,
        params: redactParams(qp),
        status: res.status,
        rateLimit: res.rateLimit,
        rowCount: rs.length,
        body: res.body,
      });
      if (!res.ok) throw new Error(`Visor ${path} returned ${res.status}`);
      for (const r of rs) {
        const n = normalizeVisorRow(r);
        if (n) out.push(n);
      }
      const tp = totalPages(res.body);
      if (rs.length < VISOR_PAGE_SIZE) break;
      if (tp != null && page >= tp) break;
    }
    return out;
  }

  return {
    /** Sold listings that left the market in the last `days` days. */
    sold(q: VisorQuery, days: number) {
      return paged("/v1/listings/sold", {
        make: q.make,
        model: q.model,
        ...(q.trim ? { trim: q.trim } : {}),
        days,
      });
    },
    /** Listings on the market right now. */
    active(q: VisorQuery) {
      return paged("/v1/listings/active", {
        make: q.make,
        model: q.model,
        ...(q.trim ? { trim: q.trim } : {}),
      });
    },
  };
}
export type VisorClient = ReturnType<typeof createVisorClient>;
