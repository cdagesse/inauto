/** Normalized rows produced by source clients; the nightly job maps these onto DB tables. */

export interface NormalizedDealerRow {
  sourceListingId: string;
  vin: string | null;
  year: number | null;
  rawMake: string | null;
  rawModel: string | null;
  rawTrim: string | null;
  /** Manufacturer option/package codes when Visor returns them (fields=options_packages). */
  optionsText: string | null;
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
  rawMake: string | null; // Old Cars Data's canonical make (ocd_make_name)
  rawModel: string | null; // Old Cars Data's canonical model line (ocd_model_name)
  title: string | null;
  miles: number | null;
  hammerPrice: number | null;
  status: "sold" | "rnm" | "withdrawn";
  endedAt: string | null; // ISO
  /** True when the source status was ambiguous ("unknown", "result unavailable") or the currency is not USD. */
  needsReview: boolean;
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

export interface ReserveOptions {
  /** Public endpoints (Old Cars Data /makes, /models) cost nothing and do not touch the budget. */
  free?: boolean;
}

/**
 * Hooks the clients call around every HTTP request. `reserve` runs before the request and
 * must throw (BudgetExceeded) to stop the call; `record` runs after with the raw response.
 */
export interface CallRecorder {
  reserve: (endpoint: string, opts?: ReserveOptions) => Promise<void>;
  record: (meta: SourceCallMeta) => Promise<void>;
}
