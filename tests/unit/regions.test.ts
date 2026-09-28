import { describe, expect, it } from "vitest";
import { REGIONS, normalizeState, regionForState, stateSpellings } from "@/data/regions";
import {
  MIN_MODEL_SALES,
  MIN_READ_SALES,
  aggregateRegions,
  movement,
  type RegionSaleRow,
} from "@/lib/market/regions";

describe("regions", () => {
  it("cover every state once", () => {
    const all = REGIONS.flatMap((r) => r.states);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(51);
  });

  it("normalize codes and names, and reject territories", () => {
    expect(normalizeState("CA")).toBe("CA");
    expect(normalizeState(" ca ")).toBe("CA");
    expect(normalizeState("Ohio")).toBe("OH");
    expect(normalizeState("New York")).toBe("NY");
    expect(normalizeState("D.C.")).toBe("DC");
    expect(normalizeState("PR")).toBeNull();
    expect(normalizeState("")).toBeNull();
    expect(normalizeState(null)).toBeNull();
    expect(regionForState("TX")?.key).toBe("south-central");
    expect(regionForState("Oregon")?.key).toBe("west-coast");
    expect(regionForState("GU")).toBeNull();
    const spellings = stateSpellings();
    expect(spellings.find((s) => s.spelling === "OHIO")?.region).toBe("midwest");
    expect(spellings.find((s) => s.spelling === "OH")?.region).toBe("midwest");
  });
});

const row = (
  region: string,
  make: string,
  modelId: string,
  win: "last" | "prior",
  n: number,
  median: number,
  dom: number | null = 30,
  domN: number = dom == null ? 0 : n,
): RegionSaleRow => ({
  region,
  make,
  makeName: make.toUpperCase(),
  modelId,
  win,
  n,
  domN,
  median,
  dom,
});

describe("movement", () => {
  it("weights price change by last-window sales and needs both windows", () => {
    const m = movement([
      row("northeast", "ferrari", "f1", "last", 10, 110_000),
      row("northeast", "ferrari", "f1", "prior", 5, 100_000),
      row("northeast", "ferrari", "f2", "last", 10, 90_000, 60),
      row("northeast", "ferrari", "f2", "prior", 5, 100_000),
      row("northeast", "ferrari", "f3", "last", 2, 500_000, null), // too few for a read
      row("northeast", "ferrari", "f4", "last", 4, 50_000), // no prior window
    ]);
    expect(m.sales90).toBe(26);
    expect(m.prior90).toBe(10);
    expect(m.volumeChange).toBeCloseTo(1.6, 6);
    expect(m.priceChange).toBeCloseTo(0, 6);
    expect(m.n90).toBe(20);
    expect(m.daysToSell).toBe(Math.round((10 * 30 + 10 * 60 + 4 * 30) / 24));
    expect(m.medianPrice).toBe(90_000);
  });

  it("weights days to sell by the rows that carried one, not the whole group", () => {
    const m = movement([
      row("west-coast", "porsche", "p1", "last", 50, 100_000, 210, 2),
      row("west-coast", "porsche", "p2", "last", 20, 80_000, 30, 20),
    ]);
    expect(m.daysToSell).toBe(Math.round((210 * 2 + 30 * 20) / 22));
    // Merged across regions the same way.
    const national = movement([
      row("west-coast", "porsche", "p1", "last", 50, 100_000, 210, 2),
      row("midwest", "porsche", "p1", "last", 10, 90_000, 30, 10),
    ]);
    expect(national.sales90).toBe(60);
    expect(national.daysToSell).toBe(Math.round((210 * 2 + 30 * 10) / 12));
  });

  it("withholds a price change on too few sales and a volume change with no prior", () => {
    const thin = movement([
      row("midwest", "toyota", "t1", "last", MIN_MODEL_SALES, 30_000),
      row("midwest", "toyota", "t1", "prior", MIN_MODEL_SALES, 25_000),
    ]);
    expect(MIN_MODEL_SALES).toBeLessThan(MIN_READ_SALES);
    expect(thin.priceChange).toBeNull();
    expect(thin.volumeChange).toBeCloseTo(0, 6);
    const fresh = movement([row("midwest", "toyota", "t1", "last", 12, 30_000)]);
    expect(fresh.volumeChange).toBeNull();
    expect(fresh.priceChange).toBeNull();
    expect(movement([]).medianPrice).toBeNull();
  });
});

describe("aggregateRegions", () => {
  const sales: RegionSaleRow[] = [
    // Northeast: Ferrari (supercars) up 10%, Toyota (japanese) down 10%.
    row("northeast", "ferrari", "f1", "last", 20, 220_000),
    row("northeast", "ferrari", "f1", "prior", 20, 200_000),
    row("northeast", "toyota", "t1", "last", 30, 45_000),
    row("northeast", "toyota", "t1", "prior", 20, 50_000),
    // Midwest: Toyota only, flat.
    row("midwest", "toyota", "t1", "last", 10, 40_000),
    row("midwest", "toyota", "t1", "prior", 10, 40_000),
    // Unknown region key is ignored.
    row("mars", "toyota", "t1", "last", 99, 1),
  ];
  const out = aggregateRegions({
    sales,
    auctions: [{ region: "northeast", n: 7, median: 35_500 }],
    dataThrough: "2026-09-28",
  });

  it("ranks regions by sales and reads their movement", () => {
    expect(out.regions.map((r) => r.key).slice(0, 2)).toEqual(["northeast", "midwest"]);
    const ne = out.regions[0]!;
    expect(ne.sales90).toBe(50);
    expect(ne.prior90).toBe(40);
    expect(ne.volumeChange).toBeCloseTo(0.25, 6);
    expect(ne.priceChange).toBeCloseTo((20 * 0.1 + 30 * -0.1) / 50, 6);
    expect(ne.share).toBeCloseTo(50 / 60, 6);
    expect(ne.auctionSales90).toBe(7);
    expect(ne.auctionMedian).toBe(35_500);
    expect(out.national.sales90).toBe(60);
    expect(out.dataThrough).toBe("2026-09-28");
  });

  it("names the strongest and softest types and the top makes", () => {
    const ne = out.regions[0]!;
    expect(ne.types.map((t) => t.key)).toEqual(["japanese", "supercars"]);
    expect(ne.types[0]!.share).toBeCloseTo(0.6, 6);
    expect(ne.strongest?.key).toBe("supercars");
    expect(ne.strongest?.priceChange).toBeCloseTo(0.1, 6);
    expect(ne.softest?.key).toBe("japanese");
    expect(ne.makes.map((m) => m.slug)).toEqual(["toyota", "ferrari"]);
    expect(ne.makes[1]!.name).toBe("FERRARI");
    expect(ne.makes[1]!.segment).toBe("supercars");
    const mw = out.regions[1]!;
    expect(mw.strongest?.key).toBe("japanese");
    expect(mw.softest).toBeNull();
  });

  it("returns every region, empty ones included, and survives no data", () => {
    expect(out.regions).toHaveLength(REGIONS.length);
    const empty = out.regions.find((r) => r.key === "mountain")!;
    expect(empty.sales90).toBe(0);
    expect(empty.types).toEqual([]);
    expect(empty.strongest).toBeNull();
    const none = aggregateRegions({ sales: [], auctions: [], dataThrough: null });
    expect(none.national.sales90).toBe(0);
    expect(none.regions.every((r) => r.share === 0)).toBe(true);
  });
});
