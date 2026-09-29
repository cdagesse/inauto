import { describe, expect, it } from "vitest";
import type { MarketSnapshot } from "@/lib/market/types";
import { buildSnapshot, type SnapshotInput } from "@/lib/market/build";
import { fixtureToRows } from "@/lib/market/build-fixture-rows";
import fixture from "@/data/fixtures/porsche-911-gt3-rs.json";

const snap = fixture as unknown as MarketSnapshot;

/** Same transformation the seed applies, in memory, with generation ids resolved. */
function inputFromFixture(): SnapshotInput {
  const rows = fixtureToRows(snap);
  const gens = snap.order.map((code, i) => {
    const g = snap.generations[code];
    const yrs = snap.years[code];
    return {
      id: `gen-${code}`,
      code,
      name: g.name,
      yearStart: Math.min(...yrs),
      yearEnd: Math.max(...yrs),
      originalMsrp: g.msrp,
      engine: g.engine,
      hp: g.hp,
      gearbox: g.gearbox,
      notes: g.extra,
      packages: g.packages,
      sortOrder: i,
    };
  });
  const id = (code: string) => `gen-${code}`;
  return {
    make: snap.make,
    model: { ...snap.model },
    generations: gens,
    dealerSales: rows.dealerSales.map((r) => ({ ...r, generationId: id(r.generationCode) })),
    dealerActive: rows.dealerActive.map((r) => ({ ...r, generationId: id(r.generationCode) })),
    auctions: rows.auctions.map((a) => ({ ...a, generationId: id(a.generationCode) })),
    now: new Date("2026-09-19T12:00:00Z"),
  };
}

describe("fixtureToRows", () => {
  it("is deterministic and matches the prototype's monthly counts", () => {
    const a = fixtureToRows(snap);
    const b = fixtureToRows(snap);
    expect(a).toEqual(b);
    const perMonth = new Map<string, number>();
    for (const r of a.dealerSales.filter(
      (r) => r.generationCode === "992" && r.sourceListingId.startsWith("fx-992-"),
    )) {
      const m = r.soldDate!.slice(0, 7);
      perMonth.set(m, (perMonth.get(m) ?? 0) + 1);
    }
    for (const m of snap.monthly.slice(0, -1)) {
      // every month but the spill month matches exactly
      if (m.month === snap.monthly[snap.monthly.length - 2].month) continue;
      expect(perMonth.get(m.month)).toBe(m.series["992"].n);
    }
    expect(a.dealerActive.filter((r) => r.generationCode === "992")).toHaveLength(
      snap.generations["992"].active,
    );
  });
});

describe("buildSnapshot", () => {
  const built = buildSnapshot(inputFromFixture());

  it("keeps generation order and years", () => {
    expect(built.order).toEqual(snap.order);
    expect(built.years["992"]).toEqual([2026, 2025, 2024, 2023]);
    expect(built.generations["997.2"].years).toBe("2010 to 2011");
  });

  it("reproduces headline medians within 2%", () => {
    for (const code of ["992", "991.2", "991.1"]) {
      const got = built.generations[code].median;
      const want = snap.generations[code].median;
      expect(Math.abs(got - want) / want).toBeLessThan(0.02);
      expect(built.generations[code].thin).toBe(false);
    }
  });

  it("flags the 997 generations as thin", () => {
    expect(built.generations["997.2"].thin).toBe(true);
    expect(built.generations["997.1"].thin).toBe(true);
    expect(built.generations["997.1"].lo).toBeGreaterThan(0);
  });

  it("charts the three generations with enough monthly sales", () => {
    expect(built.chartSeries).toEqual(["992", "991.2", "991.1"]);
    expect(built.monthly).toHaveLength(8);
    expect(built.monthly[0].partial).toBe(true);
    expect(built.monthly[7].partial).toBe(true);
    expect(built.monthly[7].month).toBe("2026-09");
  });

  it("derives dates, totals and active counts from rows", () => {
    expect(built.dataThrough).toBe("2026-09-19");
    expect(built.dealerSince).toBe("2026-02-17");
    expect(built.auctionSince).toBe("2025-12-01");
    expect(built.totals.auctionSales).toBe(14);
    expect(built.totals.activeNow).toBe(snap.totals.activeNow);
    expect(built.generations["992"].active).toBe(114);
    expect(built.generations["992"].multiple).toBeCloseTo(
      built.generations["992"].median / snap.generations["992"].msrp,
      2,
    );
  });

  it("produces color, state, band and comp tables", () => {
    expect(built.colors.map((c) => c.color)).toContain("White");
    expect(built.colors.map((c) => c.color)).toContain("Paint to Sample");
    expect(built.states[0].state).toBe("CA");
    expect(built.milesBands["992"].length).toBeGreaterThanOrEqual(4);
    expect(built.milesBands["997.1"]).toBeUndefined();
    expect(built.recentDealerSales).toHaveLength(14);
    expect(built.recentDealerSales[0].soldDate >= "2026-09-18").toBe(true);
    expect(built.recentDealerSales[0].soldDate <= built.dataThrough).toBe(true);
    expect(built.dealerSales["992"].length).toBeGreaterThanOrEqual(270);
    expect(built.auctions).toHaveLength(18);
    expect(built.auctions.filter((a) => a.status === "rnm")).toHaveLength(4);
    expect(built.auctions.find((a) => a.weissach)?.generation).toBe("992");
  });

  it("ignores excluded rows in statistics", () => {
    const input = inputFromFixture();
    input.dealerSales.push({
      year: 2025,
      miles: 10,
      price: 5_000_000,
      color: null,
      isPts: false,
      packages: [],
      state: "CA",
      daysOnMarket: 1,
      soldDate: "2026-09-19",
      generationId: "gen-992",
      excludedReason: "outlier_price",
    });
    const b2 = buildSnapshot(input);
    expect(b2.generations["992"].median).toBe(built.generations["992"].median);
    expect(b2.totals.dealerSales).toBe(built.totals.dealerSales);
  });

  it("resolves the generation by year when the row has none", () => {
    const input = inputFromFixture();
    input.dealerSales = input.dealerSales.map((r) => ({ ...r, generationId: null }));
    const b2 = buildSnapshot(input);
    expect(b2.generations["991.2"].sold).toBe(built.generations["991.2"].sold);
  });

  const auction = (
    i: number,
    year: number,
    price: number | null,
    status: "sold" | "rnm",
    endedAt = new Date(Date.UTC(2026, 8 - (i % 5), 10)),
  ) => ({
    source: "bat",
    sourceId: `a${i}`,
    url: null,
    year,
    miles: 40_000 + i * 1000,
    hammerPrice: price,
    status,
    endedAt,
    packages: [],
    generationId: "g1",
    excludedReason: null,
  });
  const datsun = (auctions: ReturnType<typeof auction>[]): SnapshotInput => ({
    make: { name: "Datsun", slug: "datsun" },
    model: { name: "240Z", slug: "240z", shortName: null, parentLine: null },
    generations: [
      {
        id: "g1",
        code: "S30",
        name: "S30",
        yearStart: 1970,
        yearEnd: 1973,
        originalMsrp: 3600,
        engine: null,
        hp: null,
        gearbox: null,
        notes: null,
        packages: [],
        sortOrder: 0,
      },
    ],
    dealerSales: [],
    dealerActive: [],
    auctions,
    now: new Date("2026-09-25T00:00:00Z"),
  });

  it("reads hammer prices for a model with auctions and no dealer sales", () => {
    const s = buildSnapshot(
      datsun([
        ...Array.from({ length: 12 }, (_, i) =>
          auction(i, 1970 + (i % 4), 50_000 + i * 2000, "sold"),
        ),
        auction(90, 1971, 30_000, "rnm"),
      ]),
    );
    const g = s.generations.S30;
    expect(g.sold).toBe(0);
    expect(g.median).toBe(0);
    expect(g.auctionSold).toBe(12);
    expect(g.auctionOffered).toBe(13);
    expect(g.auctionMedian).toBe(61_000);
    expect(g.auctionLo).toBe(55_500);
    expect(g.auctionHi).toBe(66_500);
    expect(g.auctionMedianMiles).toBe(45_500);
    expect(g.auctionN90).toBeGreaterThan(0);
    expect(s.byYearBasis).toBe("auction");
    expect(s.byYear.map((r) => r.year)).toEqual([1973, 1972, 1971, 1970]);
    expect(s.byYear.reduce((n, r) => n + r.n, 0)).toBe(12);
    expect(s.byYear.every((r) => r.generation === "S30")).toBe(true);
    expect(s.totals).toEqual({ dealerSales: 0, auctionSales: 12, activeNow: 0 });
    const sept = s.monthly.find((m) => m.month === "2026-09");
    expect(sept?.auctionSeries?.S30?.n).toBe(3);
    expect(sept?.series.S30).toBeUndefined();
    // Auctions start in May, inside the trend's oldest month? No: the window runs Feb to Sep,
    // and the first auction is in May, so the oldest month is only partially covered.
    expect(s.monthly[0]!.partial).toBe(true);
  });

  it("does not let a still-running auction push data-through into the future", () => {
    const s = buildSnapshot(
      datsun([
        auction(1, 1971, 50_000, "sold", new Date("2026-09-20T00:00:00Z")),
        auction(2, 1972, null, "rnm", new Date("2026-10-01T13:00:00Z")),
      ]),
    );
    expect(s.dataThrough).toBe("2026-09-20");
    expect(s.auctionSince).toBe("2026-09-01");
  });

  it("rests hammer figures on the last year's sales, or the latest few, not all time", () => {
    const old = Array.from({ length: 10 }, (_, i) =>
      auction(i, 1971, 200_000 + i * 1000, "sold", new Date(Date.UTC(2021, i, 10))),
    );
    const recent = [
      auction(20, 1972, 750_000, "sold", new Date("2026-03-10T00:00:00Z")),
      auction(21, 1972, 800_000, "sold", new Date("2026-06-10T00:00:00Z")),
      auction(22, 1973, 900_000, "sold", new Date("2026-09-10T00:00:00Z")),
    ];
    const s = buildSnapshot(datsun([...old, ...recent]));
    const g = s.generations.S30;
    expect(g.auctionSold).toBe(13);
    expect(g.auctionBasis).toBe(3);
    expect(g.auctionMedian).toBe(800_000);
    expect(g.auctionLo).toBe(750_000);
    expect(g.auctionHi).toBe(900_000);
    // The by-year rows rest on the same recent sales.
    expect(s.byYear.map((r) => [r.year, r.n, r.median])).toEqual([
      [1973, 1, 900_000],
      [1972, 2, 775_000],
    ]);
    // Too few in the last year: the latest five carry the figures.
    const thin = buildSnapshot(datsun([...old, recent[0]!, recent[2]!]));
    const t = thin.generations.S30;
    expect(t.auctionBasis).toBe(5);
    expect(t.auctionMedian).toBe(209_000);
  });

  it("marks the oldest trend month whole when auctions cover it", () => {
    const s = buildSnapshot(
      datsun(
        Array.from({ length: 10 }, (_, i) =>
          auction(i, 1971, 50_000, "sold", new Date(Date.UTC(2025, 11 + i, 15))),
        ),
      ),
    );
    expect(s.monthly[0]!.month).toBe("2026-02");
    expect(s.monthly[0]!.partial).toBe(false);
    expect(s.monthly.every((m) => m.auctionSeries?.S30?.n === 1)).toBe(true);
  });

  it("handles an empty model without throwing", () => {
    const empty = buildSnapshot({
      make: { name: "Mercedes-Benz", slug: "mercedes-benz" },
      model: { name: "S63 AMG", slug: "s63-amg", shortName: null, parentLine: null },
      generations: [
        {
          id: "g1",
          code: "all",
          name: "All years",
          yearStart: 2008,
          yearEnd: 2026,
          originalMsrp: null,
          engine: null,
          hp: null,
          gearbox: null,
          notes: null,
          packages: [],
          sortOrder: 0,
        },
      ],
      dealerSales: [],
      dealerActive: [],
      auctions: [],
      now: new Date("2026-09-25T00:00:00Z"),
    });
    expect(empty.order).toEqual(["all"]);
    expect(empty.generations.all.sold).toBe(0);
    expect(empty.generations.all.thin).toBe(true);
    expect(empty.totals).toEqual({ dealerSales: 0, auctionSales: 0, activeNow: 0 });
    expect(empty.monthly).toHaveLength(8);
    expect(empty.chartSeries).toEqual([]);
    expect(empty.byYearBasis).toBe("dealer");
    expect(empty.generations.all.auctionSold).toBe(0);
    expect(empty.model.shortName).toBe("S63 AMG");
    expect(empty.model.parentLine).toBe("Mercedes-Benz");
    expect(empty.dataThrough).toBe("2026-09-25");
  });
});
