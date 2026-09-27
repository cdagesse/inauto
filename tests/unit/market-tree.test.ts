import { describe, expect, it } from "vitest";
import { aggregate, buildMarketTree, monthAxis } from "@/lib/market/tree";
import type { MarketSnapshot } from "@/lib/market/types";

function snap(
  make: [string, string],
  model: string,
  gens: { code: string; median: number; last90: number; prior90: number; n90: number }[],
  monthly: { month: string; series: Record<string, { n: number; median: number }> }[],
  totals = { dealerSales: 10, auctionSales: 2, activeNow: 3 },
): MarketSnapshot {
  const generations = Object.fromEntries(
    gens.map((g) => [
      g.code,
      {
        code: g.code,
        name: g.code,
        years: "",
        sold: 0,
        active: 0,
        median: g.median,
        lo: 0,
        hi: 0,
        medianMiles: 0,
        msrp: 0,
        multiple: 0,
        daysToSell: 0,
        activeMedian: 0,
        activeMedianMiles: 0,
        last90: g.last90,
        prior90: g.prior90,
        n90: g.n90,
        nPrior90: 0,
        thin: false,
        engine: "",
        hp: "",
        gearbox: "",
        extra: null,
        packages: [],
      },
    ]),
  );
  return {
    make: { name: make[0], slug: make[1] },
    model: { name: model, slug: model.toLowerCase(), shortName: model, parentLine: make[0] },
    dataThrough: "2026-09-19",
    dealerSince: "2026-01-01",
    auctionSince: "2026-01-01",
    totals,
    order: gens.map((g) => g.code),
    chartSeries: [],
    years: {},
    generations,
    monthly: monthly.map((m) => ({ ...m, partial: false })),
    byYear: [],
    colors: [],
    milesBands: {},
    states: [],
    recentDealerSales: [],
    dealerSales: {},
    auctions: [],
  } as MarketSnapshot;
}

const ferrari = snap(
  ["Ferrari", "ferrari"],
  "812",
  [{ code: "812", median: 400_000, last90: 420_000, prior90: 400_000, n90: 10 }],
  [
    { month: "2026-08", series: { "812": { n: 4, median: 400_000 } } },
    { month: "2026-09", series: { "812": { n: 6, median: 440_000 } } },
  ],
  { dealerSales: 100, auctionSales: 5, activeNow: 20 },
);
const miata = snap(
  ["Mazda", "mazda"],
  "MX-5",
  [{ code: "ND", median: 30_000, last90: 27_000, prior90: 30_000, n90: 30 }],
  [
    { month: "2026-08", series: { ND: { n: 10, median: 30_000 } } },
    { month: "2026-09", series: { ND: { n: 10, median: 27_000 } } },
  ],
  { dealerSales: 300, auctionSales: 1, activeNow: 50 },
);

describe("aggregate", () => {
  it("sums volume, takes the median of headline medians and weights the 90-day change", () => {
    const s = aggregate([ferrari, miata], monthAxis([ferrari, miata]));
    expect(s.models).toBe(2);
    expect(s.dealerSales).toBe(400);
    expect(s.activeNow).toBe(70);
    expect(s.medianPrice).toBe(215_000);
    // (10 * +5%) + (30 * -10%) over 40 sales = -6.25%
    expect(s.change90).toBeCloseTo(-0.0625, 4);
    expect(s.n90).toBe(40);
  });

  it("builds a sales-weighted price index with 100 as each generation's own median", () => {
    const s = aggregate([ferrari, miata], ["2026-08", "2026-09"]);
    expect(s.trend.map((t) => t.n)).toEqual([14, 16]);
    expect(s.trend[0]!.index).toBe(100);
    // Sep: Ferrari 110 × 6 sales, Miata 90 × 10 sales → 97.5
    expect(s.trend[1]!.index).toBe(97.5);
  });

  it("leaves the index null for months without sales", () => {
    const s = aggregate([ferrari], ["2026-07", "2026-08"]);
    expect(s.trend[0]!.index).toBeNull();
    expect(s.trend[0]!.n).toBe(0);
  });
});

describe("buildMarketTree", () => {
  const tree = buildMarketTree(
    [ferrari, miata],
    [
      { slug: "ferrari", name: "Ferrari", models: 31, ready: 1 },
      { slug: "mazda", name: "Mazda", models: 5, ready: 1 },
      { slug: "lamborghini", name: "Lamborghini", models: 14, ready: 0 },
      { slug: "bentley", name: "Bentley", models: 7, ready: 0 },
    ],
  );

  it("places makes in their segments and keeps catalog-only makes", () => {
    const supercars = tree.segments.find((s) => s.key === "supercars")!;
    expect(supercars.makes.map((m) => m.slug)).toEqual(["ferrari", "lamborghini"]);
    expect(supercars.catalogModels).toBe(45);
    expect(supercars.stats?.dealerSales).toBe(100);
    const lambo = supercars.makes[1]!;
    expect(lambo.stats).toBeNull();
    expect(lambo.catalogModels).toBe(14);
  });

  it("orders segments by volume, with reported segments first and unreported ones without stats", () => {
    expect(tree.segments[0]!.key).toBe("japanese");
    expect(tree.segments[1]!.key).toBe("supercars");
    const luxury = tree.segments.find((s) => s.key === "luxury")!;
    expect(luxury.stats).toBeNull();
    expect(luxury.makes.map((m) => m.slug)).toEqual(["bentley"]);
    expect(tree.segments.some((s) => s.key === "other")).toBe(false);
  });

  it("carries models with their own stats under the make", () => {
    const ferrariNode = tree.segments
      .find((s) => s.key === "supercars")!
      .makes.find((m) => m.slug === "ferrari")!;
    expect(ferrariNode.models[0]!.model.name).toBe("812");
    expect(ferrariNode.models[0]!.headline).toBe(400_000);
    expect(ferrariNode.catalogModels).toBe(31);
    expect(tree.dataThrough).toBe("2026-09-19");
  });
});
