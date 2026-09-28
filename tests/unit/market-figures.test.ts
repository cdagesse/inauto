import { describe, expect, it } from "vitest";
import type { GenerationStats } from "@/lib/market/types";
import { AUCTION_THIN, headlineFigures } from "@/lib/market/figures";

const base: GenerationStats = {
  code: "S30",
  name: "S30",
  years: "1970 to 1973",
  sold: 0,
  active: 0,
  median: 0,
  lo: 0,
  hi: 0,
  medianMiles: 0,
  msrp: 3600,
  multiple: 0,
  daysToSell: 0,
  activeMedian: 0,
  activeMedianMiles: 0,
  last90: 0,
  prior90: 0,
  n90: 0,
  nPrior90: 0,
  thin: true,
  engine: "",
  hp: "",
  gearbox: "",
  extra: null,
  packages: [],
};

describe("headlineFigures", () => {
  it("reads hammer figures for a generation with auctions and no dealer sales", () => {
    const f = headlineFigures({
      ...base,
      auctionSold: 7,
      auctionMedian: 35_500,
      auctionLo: 15_500,
      auctionHi: 71_740,
      auctionMedianMiles: 56_000,
      auctionLast90: 35_500,
      auctionPrior90: 0,
      auctionN90: 7,
    });
    expect(f.viaAuctions).toBe(true);
    expect(f.median).toBe(35_500);
    expect(f.thin).toBe(7 < AUCTION_THIN);
    expect(f.change).toBeNull();
    expect(f.multiple).toBe(Math.round((35_500 / 3600) * 100) / 100);
  });

  it("never reads -100% when the last 90 days had no hammers", () => {
    const f = headlineFigures({
      ...base,
      auctionSold: 3,
      auctionMedian: 255_000,
      auctionLast90: 0,
      auctionPrior90: 255_000,
      auctionN90: 0,
    });
    expect(f.viaAuctions).toBe(true);
    expect(f.change).toBeNull();
    expect(f.n90).toBe(0);
  });

  it("keeps the dealer path for a generation with dealer sales, and for old snapshots", () => {
    const dealer = headlineFigures({
      ...base,
      sold: 40,
      median: 30_000,
      lo: 27_000,
      hi: 33_000,
      last90: 31_000,
      prior90: 30_000,
      n90: 12,
      thin: false,
      multiple: 1.5,
      auctionSold: 9,
      auctionMedian: 25_000,
    });
    expect(dealer.viaAuctions).toBe(false);
    expect(dealer.median).toBe(30_000);
    expect(dealer.change).toBeCloseTo(1 / 30, 6);
    expect(dealer.multiple).toBe(1.5);
    const old = headlineFigures(base);
    expect(old.viaAuctions).toBe(false);
    expect(old.median).toBe(0);
    expect(old.change).toBeNull();
  });
});
