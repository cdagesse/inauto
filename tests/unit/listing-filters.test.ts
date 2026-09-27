import { describe, expect, it } from "vitest";
import { countActive, filterChips, keysForChip } from "@/lib/listings/filters";

describe("filterChips", () => {
  it("describes ranges in plain words", () => {
    expect(
      filterChips({
        make: "Porsche",
        yearMin: 2019,
        yearMax: 2021,
        priceMax: 150_000,
        milesMin: 5_000,
      }).map((c) => c.label),
    ).toEqual(["Porsche", "2019–2021", "Under $150,000", "5,000+ mi"]);
    expect(filterChips({ yearMin: 2020, yearMax: 2020 })[0]!.label).toBe("2020");
    expect(filterChips({ yearMin: 2015 })[0]!.label).toBe("2015 and newer");
    expect(filterChips({ priceMin: 20_000, priceMax: 40_000 })[0]!.label).toBe(
      "$20,000 to $40,000",
    );
    expect(filterChips({ milesMax: 30_000 })[0]!.label).toBe("Under 30,000 mi");
  });
  it("counts and maps chips back to query keys", () => {
    expect(countActive({})).toBe(0);
    expect(countActive({ model: "911", trim: "GT3", milesMin: 1, milesMax: 2 })).toBe(3);
    expect(keysForChip("year")).toEqual(["yearMin", "yearMax"]);
    expect(keysForChip("make")).toEqual(["make"]);
  });
});
