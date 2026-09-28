import { describe, expect, it } from "vitest";
import { countActive, filterChips } from "@/lib/listings/filters";
import { hasSearch, searchTokens } from "@/lib/listings/search";

describe("searchTokens", () => {
  it("splits into lower-cased words and drops the noise", () => {
    expect(searchTokens("2019 Porsche 911 GT3 RS")).toEqual([
      "2019",
      "porsche",
      "911",
      "gt3",
      "rs",
    ]);
    expect(searchTokens("  BMW,   M3/E46 ")).toEqual(["bmw", "m3", "e46"]);
    expect(searchTokens("Mercedes-AMG G63")).toEqual(["mercedes-amg", "g63"]);
  });
  it("ignores one-character and repeated words and caps the count", () => {
    expect(searchTokens("a 911 a 911 x")).toEqual(["911"]);
    expect(searchTokens("one two three four five six seven eight")).toHaveLength(6);
    expect(searchTokens("")).toEqual([]);
    expect(searchTokens(null)).toEqual([]);
    expect(hasSearch("  ")).toBe(false);
    expect(hasSearch("gt3")).toBe(true);
  });
  it("strips characters that are not letters, digits or a few joiners", () => {
    expect(searchTokens('"GT3" (RS)!')).toEqual(["gt3", "rs"]);
  });
});

describe("search as a filter", () => {
  it("shows the query as the first chip but does not count it on the Filter button", () => {
    const chips = filterChips({ q: "porshe gt3", make: "Porsche" });
    expect(chips[0]).toEqual({ key: "q", label: "“porshe gt3”" });
    expect(countActive({ q: "porshe gt3", make: "Porsche" })).toBe(1);
    expect(countActive({ q: "porshe gt3" })).toBe(0);
  });
});
