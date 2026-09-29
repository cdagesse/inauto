import { describe, expect, it } from "vitest";
import {
  encodeOcdKeyword,
  keywordAlternatives,
  matchOcdRules,
  ocdLinesFor,
  ocdRowMatches,
  parseOcdAlias,
  ruleSpecificity,
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

describe("unspaced spellings keep their short keyword", () => {
  const rule = (modelId: string, make: string, line: string, kw: string | null) => ({
    modelId,
    source: "ocd",
    rawMake: make,
    rawModel: line,
    rawTrimPattern: kw,
  });
  it("finds SL in 560SL, 45 in CLA45, SS in 2SS and SS396, GT in GT2, SV in SVAutobiography", () => {
    expect(
      matchOcdRules([rule("sl", "Mercedes-Benz", "560", "SL")], {
        rawMake: "Mercedes-Benz",
        rawModel: "560",
        title: "1988 Mercedes-Benz 560SL",
      }),
    ).toBe("sl");
    expect(
      matchOcdRules([rule("cla45", "Mercedes-AMG", "CLA", "45")], {
        rawMake: "Mercedes-AMG",
        rawModel: "CLA",
        title: "2014 Mercedes-Benz CLA45 AMG",
      }),
    ).toBe("cla45");
    const ss = [rule("ss", "Chevrolet", "Camaro", "SS"), rule("base", "Chevrolet", "Camaro", null)];
    expect(
      matchOcdRules(ss, {
        rawMake: "Chevrolet",
        rawModel: "Camaro",
        title: "2017 Chevrolet Camaro 2SS Convertible",
      }),
    ).toBe("ss");
    expect(
      matchOcdRules(ss, {
        rawMake: "Chevrolet",
        rawModel: "Camaro",
        title: "1967 Chevrolet Chevelle SS396",
      }),
    ).toBe("ss");
    expect(
      matchOcdRules(ss, {
        rawMake: "Chevrolet",
        rawModel: "Camaro",
        title: "2018 Chevrolet Camaro LT Coupe",
      }),
    ).toBe("base");
    expect(
      matchOcdRules([rule("gt", "Kia", "Stinger", "GT")], {
        rawMake: "Kia",
        rawModel: "Stinger",
        title: "2018 Kia Stinger GT2 AWD",
      }),
    ).toBe("gt");
    expect(
      matchOcdRules([rule("sv", "Land Rover", "Range Rover", "SV")], {
        rawMake: "Land Rover",
        rawModel: "Range Rover",
        title: "2019 Land Rover Range Rover SVAutobiography Dynamic",
      }),
    ).toBe("sv");
    expect(
      matchOcdRules([rule("sv", "Land Rover", "Range Rover", "SV")], {
        rawMake: "Land Rover",
        rawModel: "Range Rover",
        title: "2019 Land Rover Range Rover Sport SVR",
      }),
    ).toBeNull();
  });
});

describe("excludes read like keywords and rules order by specificity", () => {
  // Real pairs in loadCatalog's order (longer keyword first, then the rule with an exclude).
  const gt3 = [
    { modelId: "rs", source: "ocd", rawMake: "Porsche", rawModel: "911", rawTrimPattern: "GT3 RS" },
    {
      modelId: "gt3",
      source: "ocd",
      rawMake: "Porsche",
      rawModel: "911",
      rawTrimPattern: "GT3 !~ GT3 RS",
    },
  ];
  const amg = [
    {
      modelId: "gt63",
      source: "ocd",
      rawMake: "Mercedes-AMG",
      rawModel: "AMG GT",
      rawTrimPattern: "GT 63",
    },
    {
      modelId: "gt",
      source: "ocd",
      rawMake: "Mercedes-AMG",
      rawModel: "AMG GT",
      rawTrimPattern: " !~ GT 63",
    },
  ];
  it("sends GT3RS and GT63 to the trim models even when the base rule comes first", () => {
    expect(
      matchOcdRules([...gt3].reverse(), {
        rawMake: "Porsche",
        rawModel: "911",
        title: "2025 Porsche 911 GT3RS Weissach",
      }),
    ).toBe("rs");
    expect(
      matchOcdRules([...gt3].reverse(), {
        rawMake: "Porsche",
        rawModel: "911",
        title: "2022 Porsche 911 GT3 Touring",
      }),
    ).toBe("gt3");
    expect(
      matchOcdRules([...amg].reverse(), {
        rawMake: "Mercedes-AMG",
        rawModel: "AMG GT",
        title: "2019 Mercedes-AMG GT63 S 4-Door Coupe",
      }),
    ).toBe("gt63");
    expect(
      matchOcdRules([...amg].reverse(), {
        rawMake: "Mercedes-AMG",
        rawModel: "AMG GT",
        title: "2018 Mercedes-AMG GT R Coupe",
      }),
    ).toBe("gt");
  });
  it("ranks a longer keyword, then an exclude, ahead", () => {
    const spec = (p: string | null) =>
      ruleSpecificity({ rawMake: "x", rawModel: "y", rawTrimPattern: p });
    expect(spec("GT3 RS").keywordLength).toBeGreaterThan(spec("GT3 !~ GT3 RS").keywordLength);
    expect(spec("GT3 !~ GT3 RS")).toMatchObject({ keywordLength: 3, hasExclude: true });
    expect(spec(" !~ GT 63")).toMatchObject({ keywordLength: 0, hasExclude: true });
    expect(spec(null)).toMatchObject({ keywordLength: 0, hasExclude: false });
    expect(spec("R|SVR|R75 !~ R-Dynamic").keywordLength).toBe(3);
  });
});

describe("keyword alternatives", () => {
  const jag = [
    {
      modelId: "r",
      source: "ocd",
      rawMake: "Jaguar",
      rawModel: "F-TYPE",
      rawTrimPattern: "R|SVR|R75 !~ R-Dynamic",
    },
    { modelId: "base", source: "ocd", rawMake: "Jaguar", rawModel: "F-TYPE", rawTrimPattern: null },
  ];
  const t = (title: string) => matchOcdRules(jag, { rawMake: "Jaguar", rawModel: "F-TYPE", title });
  it("places SVR and R75 with the R and R-Dynamic with the base", () => {
    expect(t("2020 Jaguar F-Type SVR Coupe")).toBe("r");
    expect(t("2024 Jaguar F-Type R75 Coupe")).toBe("r");
    expect(t("2016 Jaguar F-Type R Convertible")).toBe("r");
    expect(t("2021 Jaguar F-Type P300 R-Dynamic Coupe")).toBe("base");
    expect(t("2014 Jaguar F-Type V8 S Convertible")).toBe("base");
    expect(keywordAlternatives("R|SVR|R75")).toEqual(["R", "SVR", "R75"]);
    expect(keywordAlternatives(null)).toEqual([]);
  });
  it("reads exclude alternatives, so a GT3 RS Tribute to Carrera RS is not a Carrera", () => {
    const rules = [
      {
        modelId: "carrera",
        source: "ocd",
        rawMake: "Porsche",
        rawModel: "911",
        rawTrimPattern: "Carrera !~ GTS|GT3|GT2",
      },
      {
        modelId: "rs",
        source: "ocd",
        rawMake: "Porsche",
        rawModel: "911",
        rawTrimPattern: "GT3 RS",
      },
    ];
    expect(
      matchOcdRules(rules, {
        rawMake: "Porsche",
        rawModel: "911",
        title: "2023 Porsche 911 GT3 RS Tribute to Carrera RS Package",
      }),
    ).toBe("rs");
    expect(
      matchOcdRules(rules, {
        rawMake: "Porsche",
        rawModel: "911",
        title: "2019 Porsche 911 Carrera T",
      }),
    ).toBe("carrera");
  });

  it("lets a 360 CS reach the Challenge Stradale and keeps GP cars off the plain JCW", () => {
    const cs = [
      {
        modelId: "cs",
        source: "ocd",
        rawMake: "Ferrari",
        rawModel: "360",
        rawTrimPattern: "Stradale|CS",
      },
      {
        modelId: "base",
        source: "ocd",
        rawMake: "Ferrari",
        rawModel: "360",
        rawTrimPattern: " !~ Stradale",
      },
    ];
    expect(
      matchOcdRules(cs, { rawMake: "Ferrari", rawModel: "360", title: "2004 Ferrari 360 CS" }),
    ).toBe("cs");
    expect(
      matchOcdRules(cs, {
        rawMake: "Ferrari",
        rawModel: "360",
        title: "2004 Ferrari 360 Challenge Stradale",
      }),
    ).toBe("cs");
    expect(
      matchOcdRules(cs, {
        rawMake: "Ferrari",
        rawModel: "360",
        title: "2001 Ferrari 360 Modena Coupe",
      }),
    ).toBe("base");
    const mini = [
      {
        modelId: "jcw",
        source: "ocd",
        rawMake: "Mini",
        rawModel: "Cooper",
        rawTrimPattern: "John Cooper Works !~ GP",
      },
      { modelId: "gp", source: "ocd", rawMake: "Mini", rawModel: "Cooper", rawTrimPattern: "GP" },
    ];
    expect(
      matchOcdRules(mini, {
        rawMake: "Mini",
        rawModel: "Cooper",
        title: "2013 Mini John Cooper Works GP",
      }),
    ).toBe("gp");
    expect(
      matchOcdRules(mini, {
        rawMake: "Mini",
        rawModel: "Cooper",
        title: "2015 Mini John Cooper Works Hardtop",
      }),
    ).toBe("jcw");
  });
});
