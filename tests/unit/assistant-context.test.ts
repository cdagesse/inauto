import { describe, expect, it } from "vitest";
import { carFacts } from "@/lib/assistant/context";
import type { MarketSnapshot } from "@/lib/market/types";

const snapshot = {
  make: { name: "Porsche", slug: "porsche" },
  model: { name: "911 GT3 RS", slug: "911-gt3-rs", shortName: "GT3 RS", parentLine: "Porsche 911" },
  totals: { dealerSales: 562, auctionSales: 14, activeNow: 202 },
  order: ["992", "991.2"],
  years: { "992": [2023, 2024, 2025], "991.2": [2019, 2020] },
  generations: {
    "992": {
      name: "992",
      years: "2023 to 2025",
      engine: "4.0 L flat-six",
      hp: "518 hp",
      gearbox: "7-speed PDK",
      msrp: 241300,
      median: 459400,
      sold: 496,
      medianMiles: 1446,
      packages: ["weissach"],
      extra: null,
    },
    "991.2": {
      name: "991.2",
      years: "2019 to 2020",
      engine: "4.0 L flat-six",
      hp: "520 hp",
      gearbox: "7-speed PDK",
      msrp: 187500,
      median: 279000,
      sold: 120,
      medianMiles: 4000,
      packages: ["weissach"],
      extra: null,
    },
  },
} as unknown as MarketSnapshot;

describe("carFacts", () => {
  it("adds the generation's specs and market figures for the car's year", () => {
    const f = carFacts(
      {
        year: 2024,
        make: "Porsche",
        model: "911 GT3 RS",
        trim: "Weissach",
        miles: 3000,
        color: "Shark Blue",
        vin: null,
      },
      snapshot,
    );
    expect(f.headline).toBe("2024 Porsche 911 GT3 RS Weissach");
    expect(f.lines).toContain("Mileage: 3,000 miles");
    expect(f.lines).toContain("Generation: 992 (2023 to 2025)");
    expect(f.lines).toContain("Engine: 4.0 L flat-six");
    expect(f.lines.some((l) => l.startsWith("Recent dealer sales median: $459,400"))).toBe(true);
  });
  it("falls back to the model line when the year is not in a generation, and to basics with no report", () => {
    const f = carFacts(
      {
        year: 2010,
        make: "Porsche",
        model: "911 GT3 RS",
        trim: null,
        miles: null,
        color: null,
        vin: null,
      },
      snapshot,
    );
    expect(f.lines[0]).toMatch(/Model report: Porsche 911 GT3 RS, 562 dealer sales/);
    const g = carFacts(
      {
        year: 1999,
        make: "Porsche",
        model: "911",
        trim: null,
        miles: 12000,
        color: "Blue",
        vin: null,
      },
      null,
    );
    expect(g.headline).toBe("1999 Porsche 911");
    expect(g.lines).toEqual(["Mileage: 12,000 miles", "Exterior color: Blue"]);
  });
});
