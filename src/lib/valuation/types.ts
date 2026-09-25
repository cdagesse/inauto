import type { MarketSnapshot } from "@/lib/market/types";

export type ColorClass = "std" | "spec" | "pts";
export type Condition = "ex" | "good" | "fair";
export type History = "clean" | "acc";

export interface ValuationInputs {
  generation: string;
  year: number;
  miles: number;
  packages: string[]; // e.g. ["weissach"]
  colorClass: ColorClass;
  condition: Condition;
  history: History;
}

export interface Adjustment {
  key: string;
  label: string;
  pct: number;
}

export interface CompRow {
  source: string; // "Dealer sale" or platform name
  miles: number;
  price: number;
  url?: string;
  rnm?: boolean;
  year?: number;
  packages?: string[];
}

export type Channel = "auction" | "dealer" | "private";

export interface ValuationResult {
  inputs: ValuationInputs;
  basis: string; // e.g. "270 dealer sales" or "16 dealer sales (thin)"
  thin: boolean;
  base: number;
  adjustments: Adjustment[];
  marketValue: number;
  range: { lo: number; hi: number };
  auction: {
    gap: number;
    gapSampleSize: number;
    gapEstimated: boolean;
    expectedHammer: number;
    range: { lo: number; hi: number };
    suggestedReserve: number;
    buyerFee: number;
    listingFee: number;
    prep: number;
    net: number;
    timeToCash: string;
  };
  dealer: {
    margin: number;
    offer: number;
    range: { lo: number; hi: number };
    net: number;
    timeToCash: string;
  };
  privateSale: {
    asking: number;
    likelySale: number;
    cost: number;
    net: number;
    minDays: number;
  };
  recommendation: {
    channel: Channel;
    title: string;
    reason: string;
    /** Auction net minus dealer net, computed before rounding, then rounded to $500. */
    edgeOverDealer: number;
  };
  comps: CompRow[];
  disclaimer: string; // always "This is an estimate, not an offer."
}

export type PriceVerdict = "too_low" | "low" | "fair" | "high" | "too_high";

/** What a seller sees while setting an asking price on a listing. */
export interface PriceGuidance {
  marketValue: number;
  range: { lo: number; hi: number };
  dealerAskingMedian: number; // what dealers list similar cars for now
  auctionMedian: number | null; // recent hammer median for the generation, null if too few
  suggestedAsking: number;
  askingPrice: number;
  deltaPct: number; // (asking - marketValue) / marketValue
  verdict: PriceVerdict;
  message: string;
  comps: CompRow[];
  thin: boolean;
}

export type Snapshot = MarketSnapshot;
