import { describe, expect, it } from "vitest";
import {
  baseModelName,
  groupModels,
  type PickerModel,
  variantFor,
  yearsForGroup,
} from "@/lib/sell/picker-lib";

const m = (name: string, slug: string, y0: number, y1: number, ready = false): PickerModel => ({
  name,
  slug,
  shortName: null,
  yearStart: y0,
  yearEnd: y1,
  ready,
  generations: [{ code: slug, name, yearStart: y0, yearEnd: y1 }],
});

describe("sell picker model groups", () => {
  const models = [
    m("M3", "m3", 1988, 2026),
    m("M3 (E30)", "m3-e30", 1988, 1991),
    m("M3 (E46)", "m3-e46", 2001, 2006, true),
    m("M5 (E39)", "m5-e39", 2000, 2003),
    m("911 / 996", "911-996", 1999, 2004),
  ];
  it("strips only a trailing generation tag", () => {
    expect(baseModelName("M3 (E30)")).toBe("M3");
    expect(baseModelName("911 / 996")).toBe("911 / 996");
    expect(baseModelName("Alpina B7")).toBe("Alpina B7");
  });
  it("offers one entry per base model, using the plain row's slug when it exists", () => {
    const g = groupModels(models);
    expect(g.map((x) => x.name)).toEqual(["911 / 996", "M3", "M5"]);
    expect(g.find((x) => x.name === "M3")?.slug).toBe("m3");
    expect(g.find((x) => x.name === "M5")?.slug).toBe("m5-e39");
    expect(g.find((x) => x.name === "M3")?.ready).toBe(true);
  });
  it("picks the generation-specific row for the year, else the base row", () => {
    const g = groupModels(models).find((x) => x.name === "M3")!;
    expect(variantFor(g, 1990)?.slug).toBe("m3-e30");
    expect(variantFor(g, 2003)?.slug).toBe("m3-e46");
    expect(variantFor(g, 2015)?.slug).toBe("m3");
    expect(variantFor(g, null)?.slug).toBe("m3");
    expect(yearsForGroup(g)[0]).toBeGreaterThanOrEqual(2026);
  });
});
