/** Normalized rows produced by source clients; the nightly job maps these onto DB tables. */

export interface NormalizedDealerRow {
  sourceListingId: string;
  vin: string | null;
  year: number | null;
  rawMake: string | null;
  rawModel: string | null;
  rawTrim: string | null;
  miles: number | null;
  price: number | null;
  color: string | null;
  dealerName: string | null;
  state: string | null;
  daysOnMarket: number | null;
  soldDate: string | null; // YYYY-MM-DD
  raw: unknown;
}

export interface NormalizedAuctionRow {
  source: string; // platform, e.g. "Bring a Trailer"
  sourceId: string;
  url: string | null;
  vin: string | null;
  year: number | null;
  rawMake: string | null;
  rawModel: string | null;
  title: string | null;
  miles: number | null;
  hammerPrice: number | null;
  status: "sold" | "rnm" | "withdrawn";
  endedAt: string | null; // ISO
  raw: unknown;
}

export interface SourceCallMeta {
  endpoint: string;
  params: Record<string, unknown>;
  status: number;
  rateLimit: Record<string, string>;
  rowCount: number;
  body: unknown;
}

/**
 * Hooks the clients call around every HTTP request. `reserve` runs before the request and
 * must throw (BudgetExceeded) to stop the call; `record` runs after with the raw response.
 */
export interface CallRecorder {
  reserve: (endpoint: string) => Promise<void>;
  record: (meta: SourceCallMeta) => Promise<void>;
}
