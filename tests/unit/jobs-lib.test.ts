import { describe, expect, it } from "vitest";
import { classify, isLikelyMislabeled, OUTLIER_HI, OUTLIER_LO } from "@/jobs/lib/clean";
import { runChecks } from "@/jobs/lib/check";
import {
  assignGeneration,
  detectPackages,
  detectPts,
  ilikeToRegExp,
  matchAlias,
  type GenerationRange,
} from "@/jobs/lib/normalize";
import { aggregate, median, percentile } from "@/jobs/lib/stats";

const gens: GenerationRange[] = [
  { id: "g997.1", code: "997.1", yearStart: 2007, yearEnd: 2008 },
  { id: "g997.2", code: "997.2", yearStart: 2010, yearEnd: 2011 },
  { id: "g991.1", code: "991.1", yearStart: 2016, yearEnd: 2016 },
  { id: "g991.2", code: "991.2", yearStart: 2019, yearEnd: 2019 },
  { id: "g992", code: "992", yearStart: 2023, yearEnd: 2026 },
];

describe("stats", () => {
  it("median and percentiles", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(percentile([10, 20, 30, 40], 0.25)).toBe(17.5);
    expect(percentile([10, 20, 30, 40], 0.75)).toBe(32.5);
  });
  it("aggregate ignores null prices and rounds", () => {
    const a = aggregate([
      { price: 100, miles: 10 },
      { price: null, miles: 5 },
      { price: 201, miles: null },
    ]);
    expect(a).toEqual({ n: 2, median: 151, p25: 125, p75: 176, medianMiles: 8 });
  });
});

describe("normalize", () => {
  it("assigns generation by model year", () => {
    expect(assignGeneration(gens, 2025, null)).toEqual({
      generationId: "g992",
      needsReview: false,
    });
    expect(assignGeneration(gens, 2016, "GT3 RS")).toEqual({
      generationId: "g991.1",
      needsReview: false,
    });
  });
  it("flags unknown years and missing years for review", () => {
    expect(assignGeneration(gens, 2014, null)).toEqual({ generationId: null, needsReview: true });
    expect(assignGeneration(gens, null, null)).toEqual({ generationId: null, needsReview: true });
  });
  it("uses text to split shared years, else flags", () => {
    const shared: GenerationRange[] = [
      { id: "a", code: "A", yearStart: 2020, yearEnd: 2020, disambiguate: /touring/i },
      { id: "b", code: "B", yearStart: 2020, yearEnd: 2020, disambiguate: /weissach/i },
    ];
    expect(assignGeneration(shared, 2020, "GT3 Touring")).toEqual({
      generationId: "a",
      needsReview: false,
    });
    expect(assignGeneration(shared, 2020, "GT3")).toEqual({
      generationId: null,
      needsReview: true,
    });
  });
  it("detects packages and paint to sample", () => {
    expect(detectPackages("2025 911 GT3 RS Weissach Package")).toEqual(["weissach"]);
    expect(detectPackages("GT3 RS 4.0")).toEqual(["rs_4_0"]);
    expect(detectPackages(null)).toEqual([]);
    expect(detectPts("GT3 RS", "Paint to Sample Oak Green")).toBe(true);
    expect(detectPts("PTS Signal Yellow", null)).toBe(true);
    expect(detectPts("GT3 RS", "White")).toBe(false);
  });
  it("matches aliases with ILIKE-style trim patterns", () => {
    const rules = [
      {
        modelId: "m1",
        source: "visor",
        rawMake: "Porsche",
        rawModel: "911",
        rawTrimPattern: "%GT3 RS%",
      },
    ];
    expect(ilikeToRegExp("%GT3 RS%").test("2025 GT3 RS Weissach")).toBe(true);
    expect(
      matchAlias(rules, "visor", { make: "porsche", model: "911", text: "GT3 RS Weissach" }),
    ).toBe("m1");
    expect(
      matchAlias(rules, "visor", { make: "Porsche", model: "911", text: "GT3 Touring" }),
    ).toBeNull();
    expect(matchAlias(rules, "ocd", { make: "Porsche", model: "911", text: "GT3 RS" })).toBeNull();
  });
});

describe("clean", () => {
  it("marks incomplete rows", () => {
    expect(classify("911-gt3-rs", { price: null, miles: 100, year: 2025, genMedian: 460000 })).toBe(
      "incomplete",
    );
    expect(
      classify("911-gt3-rs", { price: 400000, miles: null, year: 2025, genMedian: 460000 }),
    ).toBe("incomplete");
  });
  it("marks price outliers against the trailing generation median", () => {
    const m = 460000;
    expect(
      classify("911-gt3-rs", { price: m * OUTLIER_LO - 1, miles: 100, year: 2025, genMedian: m }),
    ).toBe("outlier_price");
    expect(
      classify("911-gt3-rs", { price: m * OUTLIER_HI + 1, miles: 100, year: 2025, genMedian: m }),
    ).toBe("outlier_price");
    expect(classify("911-gt3-rs", { price: m, miles: 100, year: 2025, genMedian: m })).toBeNull();
    expect(
      classify("911-gt3-rs", { price: 5, miles: 100, year: 2025, genMedian: null }),
    ).toBeNull();
  });
  it("applies the mislabel rule table (2016 delivery-mile cars at 911 R money)", () => {
    expect(isLikelyMislabeled("911-gt3-rs", { year: 2016, miles: 40, price: 750000 })).toBe(true);
    expect(isLikelyMislabeled("911-gt3-rs", { year: 2016, miles: 4000, price: 750000 })).toBe(
      false,
    );
    expect(
      classify("911-gt3-rs", { price: 750000, miles: 40, year: 2016, genMedian: 220000 }),
    ).toBe("likely_mislabeled");
    expect(isLikelyMislabeled("other-model", { year: 2016, miles: 40, price: 750000 })).toBe(false);
  });
  it("never overwrites a manual exclusion", () => {
    expect(
      classify("911-gt3-rs", {
        price: 460000,
        miles: 100,
        year: 2025,
        genMedian: 460000,
        existing: "manual",
      }),
    ).toBe("manual");
  });
});

describe("check", () => {
  it("warns on big median moves, high excluded share, and row-count drops", () => {
    const w = runChecks([
      {
        generationCode: "992",
        channel: "dealer",
        todayN: 90,
        yesterdayN: 100,
        todayMedian: 540000,
        yesterdayMedian: 460000,
        excludedShare: 0.3,
      },
      {
        generationCode: "991.2",
        channel: "dealer",
        todayN: 100,
        yesterdayN: 100,
        todayMedian: 268000,
        yesterdayMedian: 267000,
        excludedShare: 0.05,
      },
    ]);
    expect(w.map((x) => x.kind).sort()).toEqual([
      "high_excluded_share",
      "median_moved",
      "row_count_drop",
    ]);
    expect(w.every((x) => x.generationCode === "992")).toBe(true);
  });
});
