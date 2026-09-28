import { describe, expect, it } from "vitest";
import { matchOcdRules } from "@/lib/sources/ocd";

// Two catalog models share one Old Cars Data alias and differ only by years.
const rules = [
  {
    modelId: "c8",
    source: "ocd",
    rawMake: "Chevrolet",
    rawModel: "Corvette",
    rawTrimPattern: null,
  },
  {
    modelId: "c2",
    source: "ocd",
    rawMake: "Chevrolet",
    rawModel: "Corvette",
    rawTrimPattern: null,
  },
];
const years: Record<string, { start: number | null; end: number | null }> = {
  c8: { start: 2020, end: null },
  c2: { start: 1963, end: 1967 },
};
const row = (year: number | null) => ({
  rawMake: "Chevrolet",
  rawModel: "Corvette",
  title: `${year ?? ""} Chevrolet Corvette`,
  year,
});

describe("matchOcdRules with model years", () => {
  it("routes a car to the sibling whose years contain it", () => {
    expect(matchOcdRules(rules, row(1965), (id) => years[id])).toBe("c2");
    expect(matchOcdRules(rules, row(2023), (id) => years[id])).toBe("c8");
  });
  it("returns nothing when no sibling's years fit", () => {
    expect(matchOcdRules(rules, row(1990), (id) => years[id])).toBeNull();
  });
  it("falls back to the first rule when the year or the years are unknown", () => {
    expect(matchOcdRules(rules, row(null), (id) => years[id])).toBe("c8");
    expect(matchOcdRules(rules, row(1965))).toBe("c8");
    expect(matchOcdRules(rules, row(1965), () => undefined)).toBe("c8");
  });
});
