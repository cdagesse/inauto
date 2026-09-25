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
    expect(empty.model.shortName).toBe("S63 AMG");
    expect(empty.model.parentLine).toBe("Mercedes-Benz");
    expect(empty.dataThrough).toBe("2026-09-25");
  });
});
