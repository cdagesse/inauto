import type { GenerationStats } from "./types";

/** Below this many sold auctions the hammer range shows min to max instead of quartiles. */
export const AUCTION_THIN = 10;

export interface HeadlineFigures {
  /** True when the generation has no dealer sales and reads from its sold auctions. */
  viaAuctions: boolean;
  sold: number;
  median: number;
  lo: number;
  hi: number;
  thin: boolean;
  miles: number;
  last90: number;
  prior90: number;
  n90: number;
  /** 90-day change, or null when either window has no read (never -100% on an empty window). */
  change: number | null;
  /** Price over original MSRP, 0 when either is unknown. */
  multiple: number;
}

/**
 * Headline figures for a generation: dealer sales when it has any, otherwise its sold
 * auctions. Snapshots built before the auction fields existed fall through to the dealer
 * path unchanged.
 */
export function headlineFigures(g: GenerationStats): HeadlineFigures {
  const viaAuctions = g.sold === 0 && (g.auctionSold ?? 0) > 0;
  const f = viaAuctions
    ? {
        sold: g.auctionSold ?? 0,
        median: g.auctionMedian ?? 0,
        lo: g.auctionLo ?? 0,
        hi: g.auctionHi ?? 0,
        thin: (g.auctionSold ?? 0) < AUCTION_THIN,
        miles: g.auctionMedianMiles ?? 0,
        last90: g.auctionLast90 ?? 0,
        prior90: g.auctionPrior90 ?? 0,
        n90: g.auctionN90 ?? 0,
      }
    : {
        sold: g.sold,
        median: g.median,
        lo: g.lo,
        hi: g.hi,
        thin: g.thin,
        miles: g.medianMiles,
        last90: g.last90,
        prior90: g.prior90,
        n90: g.n90,
      };
  const change = f.prior90 > 0 && f.last90 > 0 ? (f.last90 - f.prior90) / f.prior90 : null;
  const multiple = viaAuctions
    ? g.msrp && f.median
      ? Math.round((f.median / g.msrp) * 100) / 100
      : 0
    : g.multiple;
  return { viaAuctions, ...f, change, multiple };
}
