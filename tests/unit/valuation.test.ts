import { describe, expect, it } from "vitest";
import type { MarketSnapshot } from "@/lib/market/types";
import { DEFAULT_CONFIG, DISCLAIMER, fitLogLog, median, round500, valuate } from "@/lib/valuation";
import type { ValuationInputs } from "@/lib/valuation";
import fixture from "@/data/fixtures/porsche-911-gt3-rs.json";

const snapshot = fixture as unknown as MarketSnapshot;

const car992: ValuationInputs = {
  generation: "992",
  year: 2026,
  miles: 1500,
  packages: [],
  colorClass: "std",
  condition: "ex",
  history: "clean",
};

describe("helpers", () => {
  it("median handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("round500 rounds to the nearest $500", () => {
    expect(round500(486_249)).toBe(486_000);
    expect(round500(486_250)).toBe(486_500);
  });
  it("fitLogLog recovers a known curve", () => {
    const pts = Array.from({ length: 40 }, (_, i) => {
      const miles = 100 + i * 500;
      return { miles, price: Math.exp(13 - 0.05 * Math.log(miles + 250)) };
    });
    const f = fitLogLog(pts)!;
    expect(f.a).toBeCloseTo(13, 6);
    expect(f.b).toBeCloseTo(-0.05, 6);
    expect(f.q25).toBeCloseTo(0, 6);
  });
});

describe("worked example (prototype data as of Sep 19, 2026)", () => {
  const v = valuate(snapshot, car992);

  it("market value and range", () => {
    expect(v.thin).toBe(false);
    expect(v.basis).toBe("270 dealer sales");
    expect(v.marketValue).toBe(486_500);
    expect(Math.abs(v.range.lo - 427_000)).toBeLessThanOrEqual(500);
    expect(Math.abs(v.range.hi - 559_500)).toBeLessThanOrEqual(500);
  });
  it("auction channel", () => {
    expect(v.auction.gapSampleSize).toBe(4);
    expect(v.auction.gapEstimated).toBe(false);
    expect(Math.round(v.auction.gap * 100)).toBe(-3);
    expect(v.auction.expectedHammer).toBe(472_000);
    expect(v.auction.suggestedReserve).toBe(439_000);
    expect(v.auction.net).toBe(470_000);
    expect(v.auction.buyerFee).toBe(7500);
  });
  it("dealer channel", () => {
    expect(v.dealer.margin).toBeCloseTo(0.096, 6);
    expect(v.dealer.offer).toBe(440_000);
  });
  it("private sale", () => {
    expect(v.privateSale.asking).toBe(506_000);
    expect(v.privateSale.likelySale).toBe(482_000);
    expect(v.privateSale.net).toBe(481_000);
  });
  it("recommends auction, about $30,500 over dealer", () => {
    expect(v.recommendation.channel).toBe("auction");
    expect(v.recommendation.edgeOverDealer).toBe(30_500);
    expect(v.recommendation.reason).toContain("$30,500");
    expect(v.disclaimer).toBe(DISCLAIMER);
  });
  it("comps: up to 7, sorted by miles, auctions link out", () => {
    expect(v.comps.length).toBe(7);
    expect(v.comps.filter((c) => c.url).length).toBe(4);
    for (let i = 1; i < v.comps.length; i++)
      expect(v.comps[i].miles).toBeGreaterThanOrEqual(v.comps[i - 1].miles);
  });
  it("accident reported drops value and flips to dealer", () => {
    const acc = valuate(snapshot, { ...car992, history: "acc" });
    expect(acc.marketValue).toBe(399_000);
    expect(acc.recommendation.channel).toBe("dealer");
    expect(acc.adjustments.map((a) => a.key)).toEqual(["adj.history.acc"]);
  });
});

describe("adjustments", () => {
  it("Weissach applies only where offered", () => {
    const w992 = valuate(snapshot, { ...car992, packages: ["weissach"] });
    expect(w992.adjustments[0]).toMatchObject({ key: "adj.package.weissach.992", pct: 0.03 });
    const w991 = valuate(snapshot, {
      ...car992,
      generation: "991.1",
      year: 2016,
      packages: ["weissach"],
    });
    expect(w991.adjustments).toEqual([]);
  });
  it("color, condition and history multiply", () => {
    const v = valuate(snapshot, { ...car992, colorClass: "pts", condition: "good" });
    const base = valuate(snapshot, car992).base;
    expect(Math.abs(v.marketValue - base * 1.12 * 0.94)).toBeLessThanOrEqual(500);
  });
  it("config overrides are honored", () => {
    const v = valuate(snapshot, { ...car992, colorClass: "spec" }, { "adj.color.spec": 0.5 });
    expect(v.adjustments[0].pct).toBe(0.5);
    expect(DEFAULT_CONFIG["adj.color.spec"]).toBe(0.06);
  });
});

describe("thin-sample path", () => {
  it("uses the model-year median when that year has 5+ sales", () => {
    const v = valuate(snapshot, { ...car992, generation: "997.2", year: 2010, miles: 19_156 });
    expect(v.thin).toBe(true);
    expect(v.basis).toBe("11 dealer sales (thin)");
    // at the year's median miles the base equals the year median
    expect(v.base).toBe(round500(259_900));
    expect(v.range.lo).toBe(round500(v.marketValue * 0.8));
    expect(v.range.hi).toBe(round500(v.marketValue * 1.2));
    // thin generations widen the dealer margin by 4 points
    expect(v.dealer.margin).toBeCloseTo(0.08 + 0.001 * 20 + 0.04, 6);
  });
  it("prices a 2011 997.2 off 2010 cars", () => {
    const y2011 = valuate(snapshot, { ...car992, generation: "997.2", year: 2011, miles: 19_156 });
    const y2010 = valuate(snapshot, { ...car992, generation: "997.2", year: 2010, miles: 19_156 });
    expect(y2011.marketValue).toBe(y2010.marketValue);
  });
  it("falls back to the generation median when the year is too thin", () => {
    const v = valuate(snapshot, { ...car992, generation: "997.1", year: 2008, miles: 13_794 });
    expect(v.basis).toBe("10 dealer sales (thin)");
    expect(v.base).toBe(round500(359_900));
  });
  it("mileage elasticity moves the thin estimate the right way", () => {
    const lo = valuate(snapshot, { ...car992, generation: "997.1", year: 2007, miles: 2000 });
    const hi = valuate(snapshot, { ...car992, generation: "997.1", year: 2007, miles: 40_000 });
    expect(lo.marketValue).toBeGreaterThan(hi.marketValue);
  });
});

describe("auction gap fallback", () => {
  it("uses the default gap with fewer than 3 sold auctions", () => {
    const v = valuate(snapshot, { ...car992, generation: "997.1", year: 2007, miles: 13_794 });
    expect(v.auction.gapSampleSize).toBe(1);
    expect(v.auction.gapEstimated).toBe(true);
    expect(v.auction.gap).toBe(-0.08);
    expect(v.auction.expectedHammer).toBe(round500(v.marketValue * 0.92));
  });
});

describe("recommendation branches", () => {
  it("fair condition goes to a dealer even when auction would net more", () => {
    const v = valuate(snapshot, { ...car992, condition: "fair" });
    expect(v.recommendation.channel).toBe("dealer");
    expect(v.recommendation.reason).toMatch(/condition issues/);
  });
  it("auction when the edge beats max($5k, 3%)", () => {
    const v = valuate(snapshot, car992);
    expect(v.auction.net - v.dealer.net).toBeGreaterThan(Math.max(5000, 0.03 * v.marketValue));
    expect(v.recommendation.channel).toBe("auction");
  });
  it("dealer when the auction edge is small", () => {
    const v = valuate(snapshot, car992, {
      "auction.gap_default": -0.2,
      "auction.gap_min_sales": 99,
    });
    expect(v.recommendation.channel).toBe("dealer");
    expect(v.recommendation.reason).toMatch(/would net only/);
  });
  it("private sale is never the headline", () => {
    const inputs: ValuationInputs[] = [
      car992,
      { ...car992, history: "acc" },
      { ...car992, condition: "fair" },
    ];
    for (const i of inputs) expect(valuate(snapshot, i).recommendation.channel).not.toBe("private");
  });
});

describe("robustness", () => {
  it("rejects unknown generations", () => {
    expect(() => valuate(snapshot, { ...car992, generation: "nope" })).toThrow(
      /Unknown generation/,
    );
  });
  it("clamps negative and non-finite miles to zero", () => {
    expect(valuate(snapshot, { ...car992, miles: -50 }).inputs.miles).toBe(0);
    expect(valuate(snapshot, { ...car992, miles: Number.NaN }).inputs.miles).toBe(0);
  });
  it("all money outputs are multiples of $500", () => {
    const v = valuate(snapshot, car992);
    const money = [
      v.base,
      v.marketValue,
      v.range.lo,
      v.range.hi,
      v.auction.expectedHammer,
      v.auction.suggestedReserve,
      v.auction.net,
      v.dealer.offer,
      v.privateSale.asking,
      v.privateSale.likelySale,
      v.privateSale.net,
    ];
    for (const m of money) expect(m % 500).toBe(0);
  });
});
