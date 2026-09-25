/**
 * Visor Public API client (https://api.visor.vin/v1).
 *
 * Verified against https://api.visor.vin/v1/openapi.json and the operation catalog:
 *   - Auth: `Authorization: Bearer <VISOR_API_KEY>` (query-string keys are rejected).
 *   - `GET /v1/listings` filters: make, model, model_code, trim (comma-separated exact values),
 *     year (comma-separated), state, inventory_status (`active` default | `sold`),
 *     sold_within_days (positive int; not with snapshot_date), listed_after (ISO), limit (max 100),
 *     offset (0-based), sort, fields, include, min_/max_price, min_/max_mileage, exterior_color…
 *     UNKNOWN QUERY PARAMETERS FAIL CLOSED (validation_error), so only these names are sent.
 *   - Response: rows in `data`; `pagination: { limit, offset, total, next_offset }`.
 *   - Listing fields: id, vin, year, make, model, trim, version, body_type, price, miles, status,
 *     inventory_status, exterior_color, interior_color, dealer_id, dealer_name, state,
 *     days_on_market, listed_at, sold_date (null for active), last_checked_at, city, postal_code,
 *     vdp_url, stock_number, photo_urls; options_packages/features when requested via `fields`.
 *   - `GET /v1/facets?facets=trim&…` returns `data.facets.trim` buckets ({ value, count }); one
 *     billable call, used to turn a trim pattern into the exact trim values Visor knows.
 *   - Sold history begins about Feb 17, 2026. The asking price when a listing left the market is
 *     our "dealer sale price".
 *
 * Keys are only ever read from the environment by the job runner and passed in here.
 */
import { fetchJson, redactParams } from "./http";
import { toDateOnly, toInt, toStr, pick } from "./parse";
import type { CallRecorder, NormalizedDealerRow } from "./types";

export const VISOR_BASE = "https://api.visor.vin";
export const VISOR_PAGE_SIZE = 100;
/** Visor accepts a comma-separated trim list; keep it short so URLs stay sane. */
export const VISOR_MAX_TRIMS = 20;
/** Fields we ask for on every listing row. */
const LISTING_FIELDS = "default,options_packages";

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
  /** ILIKE-style pattern the trim must match ("%GT3 RS%"). Resolved to exact trims via facets. */
  trimPattern?: string | null;
  /** Model years to include (sent as `year=a,b,c` when 30 or fewer). */
  years?: number[];
}

export class VisorApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`Visor ${endpoint} returned ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "VisorApiError";
  }
}

function rows(body: unknown): unknown[] {
  const d = pick(body, "data");
  return Array.isArray(d) ? d : [];
}
function nextOffset(body: unknown): number | null {
  return toInt(pick(pick(body, "pagination"), "next_offset"));
}
/** Short, key-free description of an error body for logs and job summaries. */
export function errorDetail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const err = pick(body, "error", "message", "detail");
  const text =
    typeof err === "string"
      ? err
      : err && typeof err === "object"
        ? String(pick(err, "message", "code", "type") ?? "")
        : "";
  return text.replace(/\s+/g, " ").slice(0, 160);
}

/** ILIKE pattern → case-insensitive RegExp ("%GT3 RS%" matches "GT3 RS Weissach"). */
export function patternToRegExp(pattern: string): RegExp {
  const esc = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${esc}$`, "i");
}

/** Pick the facet trim values matching a pattern, most common first, capped. */
export function selectTrims(facetBody: unknown, pattern: string): string[] {
  const buckets = pick(pick(pick(facetBody, "data"), "facets"), "trim");
  if (!Array.isArray(buckets)) return [];
  const re = patternToRegExp(pattern);
  return buckets
    .map((b) => ({
      value: toStr(pick(b, "value", "key", "name")),
      count: toInt(pick(b, "count")) ?? 0,
    }))
    .filter((b): b is { value: string; count: number } => !!b.value && re.test(b.value))
    .sort((a, b) => b.count - a.count)
    .slice(0, VISOR_MAX_TRIMS)
    .map((b) => b.value);
}

export function normalizeVisorRow(r: unknown): NormalizedDealerRow | null {
  const id = toStr(pick(r, "id"));
  if (!id) return null;
  const opts = pick(r, "options_packages");
  return {
    sourceListingId: id,
    vin: toStr(pick(r, "vin")),
    year: toInt(pick(r, "year")),
    rawMake: toStr(pick(r, "make")),
    rawModel: toStr(pick(r, "model")),
    rawTrim: toStr(pick(r, "trim")),
    optionsText: Array.isArray(opts) ? opts.map(String).join(" ") : toStr(opts),
    miles: toInt(pick(r, "miles")),
    price: toInt(pick(r, "price")),
    color: toStr(pick(r, "exterior_color")),
    dealerName: toStr(pick(r, "dealer_name")),
    state: toStr(pick(r, "state")),
    daysOnMarket: toInt(pick(r, "days_on_market")),
    soldDate: toDateOnly(pick(r, "sold_date")),
    raw: r,
  };
}

type Params = Record<string, string | number>;

export function createVisorClient(o: VisorClientOptions) {
  const base = o.baseUrl ?? VISOR_BASE;
  const maxPages = o.maxPages ?? 50;
  const headers = { Authorization: `Bearer ${o.apiKey}` };

  async function call(path: string, params: Params) {
    const url = `${base}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
    await o.record.reserve(path);
    const res = await fetchJson(url, { headers, fetchImpl: o.fetchImpl });
    await o.record.record({
      endpoint: path,
      params: redactParams(params),
      status: res.status,
      rateLimit: res.rateLimit,
      rowCount: rows(res.body).length,
      body: res.body,
    });
    if (!res.ok) throw new VisorApiError(path, res.status, errorDetail(res.body));
    return res;
  }

  function baseParams(q: VisorQuery, mode: "active" | "sold"): Params {
    const p: Params = { make: q.make, model: q.model };
    if (mode === "sold") p.inventory_status = "sold";
    if (q.years && q.years.length > 0 && q.years.length <= 30) p.year = q.years.join(",");
    return p;
  }

  /** One facets call resolves a trim pattern to Visor's exact trim values; [] when nothing matches. */
  async function trimsFor(
    q: VisorQuery,
    mode: "active" | "sold",
    days?: number,
  ): Promise<string[]> {
    if (!q.trimPattern) return [];
    const p: Params = { ...baseParams(q, mode), facets: "trim", facet_value_limit: 100 };
    if (mode === "sold" && days) p.sold_within_days = days;
    try {
      const res = await call("/v1/facets", p);
      return selectTrims(res.body, q.trimPattern);
    } catch (e) {
      if (e instanceof VisorApiError && e.status >= 400 && e.status < 500 && e.status !== 429)
        return []; // fall back to client-side filtering
      throw e;
    }
  }

  async function paged(q: VisorQuery, mode: "active" | "sold", days?: number) {
    const out: NormalizedDealerRow[] = [];
    const params: Params = {
      ...baseParams(q, mode),
      limit: VISOR_PAGE_SIZE,
      fields: LISTING_FIELDS,
    };
    if (mode === "sold" && days) params.sold_within_days = days;
    const trims = await trimsFor(q, mode, days);
    if (trims.length) params.trim = trims.join(",");
    const re = q.trimPattern ? patternToRegExp(q.trimPattern) : null;

    let offset = 0;
    for (let page = 0; page < maxPages; page++) {
      const res = await call("/v1/listings", { ...params, offset });
      for (const r of rows(res.body)) {
        const n = normalizeVisorRow(r);
        if (!n) continue;
        // Safety net: even with a server-side trim list, keep only rows matching the pattern.
        if (re && !(n.rawTrim && re.test(n.rawTrim))) continue;
        out.push(n);
      }
      const next = nextOffset(res.body);
      if (next == null || next <= offset) break;
      offset = next;
    }
    return out;
  }

  return {
    /** Sold listings that left the market in the last `days` days. */
    sold(q: VisorQuery, days: number) {
      return paged(q, "sold", Math.max(1, Math.round(days)));
    },
    /** Listings on the market right now. */
    active(q: VisorQuery) {
      return paged(q, "active");
    },
  };
}
export type VisorClient = ReturnType<typeof createVisorClient>;
