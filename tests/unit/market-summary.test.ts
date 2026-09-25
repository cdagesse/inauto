import { describe, expect, it } from "vitest";
import {
  generationFor,
  packagesFromText,
  priceDelta,
} from "@/components/market/market-summary-lib";

const years = { "992": [2026, 2025, 2024, 2023], "991.2": [2019], "991.1": [2016] };

describe("generationFor", () => {
  it("prefers a valid matched code", () => {
    expect(generationFor(years, "991.2", 2024, "992")).toBe("991.2");
  });
  it("falls back to the year when the matched code is unknown", () => {
    expect(generationFor(years, "all", 2016, "992")).toBe("991.1");
    expect(generationFor(years, null, 2019, "992")).toBe("991.2");
  });
  it("uses the fallback when nothing matches", () => {
    expect(generationFor(years, null, 1999, "992")).toBe("992");
    expect(generationFor(years, null, null, "992")).toBe("992");
  });
});

describe("priceDelta", () => {
  it("phrases under, over and at with the given label", () => {
    expect(priceDelta(460_000, 500_000, "Current bid")?.text).toBe(
      "Current bid is 8% under our market value",
    );
    expect(priceDelta(550_000, 500_000, "Asking price")?.direction).toBe("over");
    expect(priceDelta(501_000, 500_000, "Sold for")?.text).toBe(
      "Sold for is right at our market value",
    );
  });
  it("returns null without a usable price", () => {
    expect(priceDelta(null, 500_000, "Current bid")).toBeNull();
    expect(priceDelta(0, 500_000, "Current bid")).toBeNull();
  });
});

describe("packagesFromText", () => {
  it("detects Weissach only", () => {
    expect(packagesFromText("2025 Porsche 911 GT3 RS Weissach")).toEqual(["weissach"]);
    expect(packagesFromText("2019 Porsche 911 GT3 RS")).toEqual([]);
    expect(packagesFromText(null)).toEqual([]);
  });
});
