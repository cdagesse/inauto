import { describe, expect, it } from "vitest";
import {
  generationFor,
  sellHref,
  trimsFor,
  yearsFor,
  type PickerModel,
} from "@/lib/sell/picker-lib";

const model: PickerModel = {
  name: "911 GT3 RS",
  slug: "911-gt3-rs",
  shortName: "GT3 RS",
  yearStart: 2016,
  yearEnd: 2025,
  ready: true,
  generations: [
    { code: "992", name: "992", yearStart: 2023, yearEnd: 2025 },
    { code: "991.2", name: "991.2", yearStart: 2019, yearEnd: 2020 },
    { code: "991.1", name: "991.1", yearStart: 2016, yearEnd: 2017 },
  ],
};

describe("sell picker helpers", () => {
  it("lists model years newest first", () => {
    const y = yearsFor(model);
    expect(y[0]).toBe(2025);
    expect(y[y.length - 1]).toBe(2016);
    expect(yearsFor(null)).toEqual([]);
  });

  it("derives the year range from generations when the model has none", () => {
    const y = yearsFor({ ...model, yearStart: null, yearEnd: null });
    expect(y[0]).toBeGreaterThanOrEqual(2025);
    expect(y).toContain(2016);
  });

  it("offers the generations that cover the chosen year", () => {
    expect(trimsFor(model, 2019).map((g) => g.code)).toEqual(["991.2"]);
    expect(trimsFor(model, 2021).map((g) => g.code)).toEqual(["992", "991.2", "991.1"]);
    expect(trimsFor(model, null)).toHaveLength(3);
  });

  it("builds the sell url with only the fields that are set", () => {
    expect(
      sellHref({
        makeSlug: "porsche",
        modelSlug: "911-gt3-rs",
        year: 2019,
        gen: "991.2",
        trim: null,
        miles: 4200,
      }),
    ).toBe("/sell/porsche/911-gt3-rs?year=2019&gen=991.2&miles=4200");
    expect(
      sellHref({
        makeSlug: "bmw",
        modelSlug: "m3",
        year: null,
        gen: null,
        trim: null,
        miles: null,
      }),
    ).toBe("/sell/bmw/m3");
  });
});

describe("generationFor", () => {
  const years = { "992": [2023, 2024, 2025], "991.2": [2019, 2020], "991.1": [2016, 2017] };
  const order = ["992", "991.2", "991.1"];
  it("prefers an explicit valid generation", () => {
    expect(generationFor(years, order, 2019, "991.1")).toBe("991.1");
  });
  it("falls back to the generation covering the year, then the newest", () => {
    expect(generationFor(years, order, 2019, "nope")).toBe("991.2");
    expect(generationFor(years, order, 2021, undefined)).toBe("992");
    expect(generationFor(years, order, undefined, undefined)).toBe("992");
  });
});
