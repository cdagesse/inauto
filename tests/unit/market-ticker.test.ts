import { describe, expect, it } from "vitest";
import {
  TICKER_MAX_MOVE,
  TICKER_MIN_N90,
  TICKER_SALE_FLOOR,
  buildTickerItems,
  fmtChange,
  type TickerSale,
} from "@/lib/market/ticker";
import type { MarketTree, ModelNode, NodeStats, SegmentNode } from "@/lib/market/tree";

const stats = (o: Partial<NodeStats> = {}): NodeStats => ({
  models: 1,
  dealerSales: 100,
  auctionSales: 10,
  activeNow: 5,
  auctionModels: 0,
  medianPrice: 50_000,
  change90: 0.041,
  n90: 30,
  trend: [
    { month: "2026-08", partial: false, n: 10, index: 101.2 },
    { month: "2026-09", partial: true, n: 4, index: 103.4 },
  ],
  ...o,
});
const model = (
  make: string,
  name: string,
  headline: number,
  change90: number | null,
  n90 = 30,
): ModelNode => ({
  make: { name: make, slug: make.toLowerCase() },
  model: { name, slug: name.toLowerCase().replace(/\s+/g, "-"), shortName: name },
  headline,
  stats: stats({ change90, n90 }),
});
const segment = (
  key: string,
  short: string,
  models: ModelNode[],
  s: NodeStats | null = stats(),
): SegmentNode => ({
  key,
  name: short,
  short,
  blurb: "",
  stats: s,
  makes: [{ name: "x", slug: "x", segment: key, stats: s, models, catalogModels: models.length }],
  catalogMakes: 1,
  catalogModels: models.length,
});

describe("market ticker", () => {
  const tree: MarketTree = {
    months: ["2026-08", "2026-09"],
    dataThrough: "2026-09-30",
    segments: [
      segment(
        "supercars",
        "Supercars",
        [
          model("Ferrari", "360 Challenge Stradale", 795_500, 0.15),
          model("Ferrari", "F40", 2_500_000, -0.023),
          model("Pagani", "Zonda", 9_000_000, 0.2, TICKER_MIN_N90 - 1), // too few sales
          model("BMW", "M2", 75_000, TICKER_MAX_MOVE + 0.5), // a mix shift, not a move
        ],
        stats({ medianPrice: 242_000, change90: 0.011 }),
      ),
      segment(
        "japanese",
        "JDM",
        [model("Toyota", "Supra", 95_000, 0.004)],
        stats({ medianPrice: 38_000, change90: -0.03 }),
      ),
      segment("other", "Other", [], null),
    ],
  };
  const sales: TickerSale[] = [
    {
      title: "2003 Chevrolet S-10 LS Extended Cab V6",
      price: 9_000,
      sourceName: "Bring a Trailer",
      href: "/listings/ext/bat/1",
      catalogued: false,
    },
    {
      title: "1967 Volkswagen T2 Bus",
      price: TICKER_SALE_FLOOR + 16_000,
      sourceName: "Bring a Trailer",
      href: "/listings/ext/bat/3",
      catalogued: false,
    },
    {
      title: "41k-Mile 2000 Porsche 911 Carrera Cabriolet 6-Speed, One Owner",
      price: 37_500,
      sourceName: "Bring a Trailer",
      href: "/listings/ext/bat/2",
      catalogued: true,
    },
  ];
  const items = buildTickerItems({ tree, national: stats({ change90: 0.031 }), sales });

  it("leads with the index, then weaves segments, movers and sales", () => {
    // The index point is the last complete month, not the in-progress one.
    expect(items[0]).toMatchObject({
      kind: "index",
      value: "101.2",
      change: 0.031,
      href: "/markets",
    });
    expect(items.slice(1, 4).map((i) => i.kind)).toEqual(["segment", "model", "sale"]);
    expect(items.filter((i) => i.kind === "segment").map((i) => i.label)).toEqual([
      "Supercars",
      "JDM",
    ]);
  });

  it("ranks movers by the size of the move and skips thin reads", () => {
    const movers = items.filter((i) => i.kind === "model");
    expect(movers.map((i) => i.label)).toEqual([
      "Ferrari 360 Challenge Stradale",
      "Ferrari F40",
      "Toyota Supra",
    ]);
    expect(movers[0]).toMatchObject({
      value: "$795,500",
      change: 0.15,
      href: "/ferrari/360-challenge-stradale",
    });
  });

  it("shows the priciest qualifying sales, keeps cheap uncatalogued cars off, truncates titles", () => {
    const sold = items.filter((i) => i.kind === "sale");
    expect(sold).toHaveLength(2);
    expect(sold[0]).toMatchObject({ label: "Sold · 1967 Volkswagen T2 Bus", value: "$41,000" });
    expect(sold[1]!.label.startsWith("Sold · 41k-Mile 2000 Porsche 911 Carrera")).toBe(true);
    expect(sold[1]!.label.endsWith("…")).toBe(true);
    expect(sold[1]).toMatchObject({ value: "$37,500", change: null, note: "Bring a Trailer" });
  });

  it("formats changes with an arrow and one decimal", () => {
    expect(fmtChange(0.0412)).toBe("▲ 4.1%");
    expect(fmtChange(-0.023)).toBe("▼ 2.3%");
    expect(fmtChange(0)).toBe("▲ 0.0%");
  });

  it("falls back to the in-progress month when it is the only point", () => {
    const only = buildTickerItems({
      tree: { segments: [], months: ["2026-09"], dataThrough: null },
      national: stats({ trend: [{ month: "2026-09", partial: true, n: 2, index: 99.5 }] }),
      sales: [],
    });
    expect(only[0]).toMatchObject({ kind: "index", value: "99.5" });
  });

  it("copes with no data at all", () => {
    const empty = buildTickerItems({
      tree: { segments: [], months: [], dataThrough: null },
      national: stats({ trend: [], change90: null }),
      sales: [],
    });
    expect(empty).toEqual([]);
  });
});
