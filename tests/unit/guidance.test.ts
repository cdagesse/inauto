import { describe, expect, it } from "vitest";
import type { MarketSnapshot } from "@/lib/market/types";
import { isPriceGuidance, priceGuidance, valuate, verdictFor } from "@/lib/valuation";
import fixture from "@/data/fixtures/porsche-911-gt3-rs.json";

const snapshot = fixture as unknown as MarketSnapshot;
const base = {
  generation: "992",
  year: 2026,
  miles: 1500,
  packages: [],
  colorClass: "std" as const,
  condition: "ex" as const,
  history: "clean" as const,
};

describe("verdictFor", () => {
  it("maps deltas to verdicts at the documented thresholds", () => {
    expect(verdictFor(-0.2)).toBe("too_low");
    expect(verdictFor(-0.12)).toBe("low");
    expect(verdictFor(-0.05)).toBe("low");
    expect(verdictFor(-0.04)).toBe("fair");
    expect(verdictFor(0)).toBe("fair");
    expect(verdictFor(0.06)).toBe("fair");
    expect(verdictFor(0.1)).toBe("high");
    expect(verdictFor(0.15)).toBe("high");
    expect(verdictFor(0.16)).toBe("too_high");
  });
});

describe("priceGuidance", () => {
  const mv = valuate(snapshot, base).marketValue; // 486,500

  it("fair price at market value", () => {
    const g = priceGuidance(snapshot, { ...base, askingPrice: mv });
    expect(g.verdict).toBe("fair");
    expect(g.marketValue).toBe(486_500);
    expect(g.suggestedAsking).toBe(506_000);
    expect(g.dealerAskingMedian).toBe(520_646);
    expect(g.auctionMedian).not.toBeNull();
    expect(g.message).toMatch(/in line with/);
    expect(g.message).toMatch(/estimate, not an offer\.$/);
  });
  it("too high warns and suggests a realistic price", () => {
    const g = priceGuidance(snapshot, { ...base, askingPrice: mv * 1.3 });
    expect(g.verdict).toBe("too_high");
    expect(g.deltaPct).toBeCloseTo(0.3, 6);
    expect(g.message).toMatch(/\$506,000/);
  });
  it("too low says money is being left on the table", () => {
    const g = priceGuidance(snapshot, { ...base, askingPrice: mv * 0.8 });
    expect(g.verdict).toBe("too_low");
    expect(g.message).toMatch(/leaving money/);
  });
  it("mentions the auction comparison only when there are enough sales", () => {
    const g = priceGuidance(snapshot, {
      ...base,
      generation: "997.1",
      year: 2007,
      miles: 13_794,
      askingPrice: 350_000,
    });
    expect(g.auctionMedian).toBeNull();
    expect(g.thin).toBe(true);
    expect(g.message).toMatch(/too few recent auction sales/);
    expect(g.message).toMatch(/starting point/);
  });
  it("carries the same comps as the valuation", () => {
    const g = priceGuidance(snapshot, { ...base, askingPrice: mv });
    expect(g.comps).toEqual(valuate(snapshot, base).comps);
  });
});

describe("isPriceGuidance", () => {
  it("accepts what priceGuidance produces", () => {
    const g = priceGuidance(snapshot, { ...base, askingPrice: 300_000 });
    expect(isPriceGuidance(g)).toBe(true);
    expect(isPriceGuidance(JSON.parse(JSON.stringify(g)))).toBe(true);
  });
  it("rejects malformed values read back from the row", () => {
    expect(isPriceGuidance(null)).toBe(false);
    expect(isPriceGuidance("x")).toBe(false);
    expect(isPriceGuidance({ marketValue: "lots" })).toBe(false);
    expect(
      isPriceGuidance({ marketValue: 1, dealerAskingMedian: 1, verdict: "fair", message: "" }),
    ).toBe(false);
    expect(
      isPriceGuidance({
        marketValue: 1,
        dealerAskingMedian: 1,
        range: { lo: 1, hi: "2" },
        verdict: "fair",
        message: "",
      }),
    ).toBe(false);
  });
  it("rejects a partial row missing the fields the page does not read yet", () => {
    const g: Record<string, unknown> = {
      ...priceGuidance(snapshot, { ...base, askingPrice: 300_000 }),
    };
    expect(isPriceGuidance({ ...g, comps: undefined })).toBe(false);
    expect(isPriceGuidance({ ...g, deltaPct: undefined })).toBe(false);
    expect(isPriceGuidance({ ...g, thin: "no" })).toBe(false);
  });
});
