import { describe, expect, it } from "vitest";
import {
  encodeOcdKeyword,
  matchOcdRules,
  ocdLinesFor,
  ocdRowMatches,
  parseOcdAlias,
} from "@/lib/sources/ocd";

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

describe("matchOcdRules chassis-code fallback", () => {
  const rules = [
    {
      modelId: "carrera",
      source: "ocd",
      rawMake: "Porsche",
      rawModel: "911",
      rawTrimPattern: "Carrera",
    },
    { modelId: "gt3", source: "ocd", rawMake: "Porsche", rawModel: "911", rawTrimPattern: "GT3" },
    { modelId: "g964", source: "ocd", rawMake: "Porsche", rawModel: "964", rawTrimPattern: null },
  ];
  const years: Record<string, { start: number | null; end: number | null }> = {
    carrera: { start: 1984, end: null },
    gt3: { start: 2004, end: null },
    g964: { start: 1989, end: 1994 },
  };
  const yf = (id: string) => years[id];

  it("retries a chassis-coded line under the family line", () => {
    const row = {
      rawMake: "Porsche",
      rawModel: "996",
      title: "41k-Mile 2000 Porsche 911 Carrera Cabriolet 6-Speed",
      year: 2000,
    };
    expect(matchOcdRules(rules, row, yf)).toBe("carrera");
    expect(
      matchOcdRules(
        rules,
        { ...row, rawModel: "992", title: "2024 Porsche 911 GT3", year: 2024 },
        yf,
      ),
    ).toBe("gt3");
  });

  it("prefers a rule keyed on the code itself, and leaves other makes alone", () => {
    expect(
      matchOcdRules(
        rules,
        { rawMake: "Porsche", rawModel: "964", title: "1991 Porsche 911 Carrera 2", year: 1991 },
        yf,
      ),
    ).toBe("g964");
    expect(
      matchOcdRules(
        rules,
        { rawMake: "BMW", rawModel: "996", title: "2000 BMW 996 Carrera", year: 2000 },
        yf,
      ),
    ).toBeNull();
    expect(
      matchOcdRules(
        rules,
        { rawMake: "Porsche", rawModel: "996", title: "2001 Porsche 911 Targa", year: 2001 },
        yf,
      ),
    ).toBeNull();
  });
});

describe("matchOcdRules keeps GTS cars off the plain Carrera", () => {
  // Real pair in loadCatalog order: the longer pattern sorts first.
  const rules = [
    {
      modelId: "carrera",
      source: "ocd",
      rawMake: "Porsche",
      rawModel: "911",
      rawTrimPattern: "Carrera !~ GTS",
    },
    { modelId: "gts", source: "ocd", rawMake: "Porsche", rawModel: "911", rawTrimPattern: "GTS" },
  ];
  const years: Record<string, { start: number | null; end: number | null }> = {
    carrera: { start: 1984, end: null },
    gts: { start: 2011, end: null },
  };
  const yf = (id: string) => years[id];
  it("routes a chassis-coded Carrera GTS to the GTS model and a Carrera to Carrera", () => {
    expect(
      matchOcdRules(
        rules,
        {
          rawMake: "Porsche",
          rawModel: "991",
          title: "2012 Porsche 911 Carrera GTS Coupe",
          year: 2012,
        },
        yf,
      ),
    ).toBe("gts");
    expect(
      matchOcdRules(
        rules,
        {
          rawMake: "Porsche",
          rawModel: "996",
          title: "2000 Porsche 911 Carrera Cabriolet",
          year: 2000,
        },
        yf,
      ),
    ).toBe("carrera");
  });
});

describe("ocdLinesFor", () => {
  it("lists the family line and every code that maps to it", () => {
    expect(
      ocdLinesFor({ make: "Porsche", model: "911", keyword: "Carrera", excludeKeyword: null }),
    ).toEqual(["911", "930", "964", "991", "992", "996", "997"]);
    expect(
      ocdLinesFor({ make: "Porsche", model: "Cayman", keyword: "GTS", excludeKeyword: null }),
    ).toEqual(["Cayman"]);
    expect(ocdLinesFor({ make: "BMW", model: "M3", keyword: null, excludeKeyword: null })).toEqual([
      "M3",
    ]);
  });
});

describe("parseOcdAlias exclude-only patterns", () => {
  it("reads a stored exclude-only pattern as an exclusion, not a keyword", () => {
    const enc = encodeOcdKeyword(undefined, "Pista");
    expect(enc).toBe(" !~ Pista");
    const a = parseOcdAlias({ rawMake: "Ferrari", rawModel: "488", rawTrimPattern: enc });
    expect(a).toMatchObject({ keyword: null, excludeKeyword: "Pista" });
    expect(
      ocdRowMatches(a, { rawMake: "Ferrari", rawModel: "488", title: "2017 Ferrari 488 GTB" }),
    ).toBe(true);
    expect(
      ocdRowMatches(a, { rawMake: "Ferrari", rawModel: "488", title: "2019 Ferrari 488 Pista" }),
    ).toBe(false);
    // A hand-trimmed pattern reads the same way.
    expect(
      parseOcdAlias({ rawMake: "Ferrari", rawModel: "488", rawTrimPattern: "!~ Pista" }),
    ).toMatchObject({
      keyword: null,
      excludeKeyword: "Pista",
    });
    expect(
      parseOcdAlias({ rawMake: "Porsche", rawModel: "911", rawTrimPattern: "Turbo !~ Turbo S" }),
    ).toMatchObject({
      keyword: "Turbo",
      excludeKeyword: "Turbo S",
    });
  });
});

describe("one- and two-character keywords match as words", () => {
  const rule = (modelId: string, kw: string) => ({
    modelId,
    source: "ocd",
    rawMake: "Jaguar",
    rawModel: "F-TYPE",
    rawTrimPattern: kw,
  });
  it("does not find R inside Convertible, or S/T inside Amethyst", () => {
    const rules = [rule("r", "R"), rule("base", "")];
    expect(
      matchOcdRules(rules, {
        rawMake: "Jaguar",
        rawModel: "F-TYPE",
        title: "2016 Jaguar F-Type R Convertible",
      }),
    ).toBe("r");
    expect(
      matchOcdRules(rules, {
        rawMake: "Jaguar",
        rawModel: "F-TYPE",
        title: "2014 Jaguar F-Type V8 S Convertible",
      }),
    ).toBe("base");
    const st = [
      { modelId: "st", source: "ocd", rawMake: "Porsche", rawModel: "911", rawTrimPattern: "S/T" },
    ];
    expect(
      matchOcdRules(st, { rawMake: "Porsche", rawModel: "911", title: "2024 Porsche 911 S/T" }),
    ).toBe("st");
    expect(
      matchOcdRules(st, {
        rawMake: "Porsche",
        rawModel: "911",
        title: "Amethyst Metallic 2024 Porsche 911 Targa 4 GTS",
      }),
    ).toBeNull();
    // Longer keywords stay spacing-insensitive.
    const rs = [
      {
        modelId: "rs",
        source: "ocd",
        rawMake: "Porsche",
        rawModel: "911",
        rawTrimPattern: "GT3 RS",
      },
    ];
    expect(
      matchOcdRules(rs, {
        rawMake: "Porsche",
        rawModel: "911",
        title: "2025 Porsche 911 GT3RS Weissach",
      }),
    ).toBe("rs");
  });
});
