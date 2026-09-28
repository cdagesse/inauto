/** Everything a model market page and the valuation engine need, precomputed. Serializable. */
export type GenerationCode = string;

export interface GenerationStats {
  code: GenerationCode;
  name: string;
  years: string;
  sold: number;
  active: number;
  median: number;
  lo: number;
  hi: number;
  medianMiles: number;
  msrp: number;
  multiple: number;
  daysToSell: number;
  activeMedian: number;
  activeMedianMiles: number;
  last90: number;
  prior90: number;
  n90: number;
  nPrior90: number;
  thin: boolean;
  engine: string;
  hp: string;
  gearbox: string;
  extra: string | null;
  /** Package keys offered on this generation, e.g. ["weissach"]. */
  packages: string[];
  /**
   * Sold auctions, so a model without dealer data still has a price read. Absent on
   * summaries built before these were added.
   */
  auctionSold?: number;
  auctionMedian?: number;
  auctionLast90?: number;
  auctionPrior90?: number;
  auctionN90?: number;
  /** Typical hammer range: p25 to p75, or min to max on a thin sample. */
  auctionLo?: number;
  auctionHi?: number;
  auctionMedianMiles?: number;
  /** Cars that came to auction (sold or reserve not met). */
  auctionOffered?: number;
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  partial: boolean;
  series: Record<GenerationCode, { n: number; median: number }>;
  /** Sold auctions in the month, per generation. Absent on older summaries. */
  auctionSeries?: Record<GenerationCode, { n: number; median: number }>;
}

export interface YearRow {
  year: number;
  n: number;
  median: number;
  medianMiles: number;
  generation: GenerationCode;
}

export interface DealerSalePoint {
  miles: number;
  price: number;
}

export type AuctionStatus = "sold" | "rnm" | "withdrawn";

export interface AuctionRow {
  id: string;
  endedAt: string; // YYYY-MM-DD
  platform: string;
  status: AuctionStatus;
  price: number; // hammer, or high bid when rnm
  year: number;
  miles: number;
  weissach: boolean;
  url: string;
  generation: GenerationCode;
}

export interface MarketSnapshot {
  make: { name: string; slug: string };
  model: { name: string; slug: string; shortName: string; parentLine: string };
  dataThrough: string;
  dealerSince: string;
  auctionSince: string;
  totals: { dealerSales: number; auctionSales: number; activeNow: number };
  order: GenerationCode[];
  chartSeries: GenerationCode[];
  years: Record<GenerationCode, number[]>;
  generations: Record<GenerationCode, GenerationStats>;
  monthly: MonthlyPoint[];
  byYear: YearRow[];
  /** What the by-year rows count. Absent (dealer) on snapshots built before auction fallback. */
  byYearBasis?: "dealer" | "auction";
  colors: { color: string; n: number; median: number }[];
  milesBands: Record<
    GenerationCode,
    { from: number; to: number | null; n: number; median: number }[]
  >;
  states: { state: string; n: number }[];
  recentDealerSales: {
    soldDate: string;
    year: number;
    color: string | null;
    miles: number | null;
    price: number;
    state: string;
    generation: GenerationCode;
  }[];
  /** Cleaned dealer sales per generation, used for the mileage curve and scatter. */
  dealerSales: Record<GenerationCode, DealerSalePoint[]>;
  auctions: AuctionRow[];
}
