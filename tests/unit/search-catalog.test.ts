import { describe, expect, it } from "vitest";
import { CATALOG, MAKES, searchTextFor } from "@/data/catalog";

describe("catalog", () => {
  it("has unique make/model slugs", () => {
    const seen = new Set<string>();
    for (const e of CATALOG) {
      const k = `${e.makeSlug}/${e.modelSlug}`;
      expect(seen.has(k), `duplicate ${k}`).toBe(false);
      seen.add(k);
      expect(e.modelSlug).toMatch(/^[a-z0-9-]+$/);
      expect(e.makeSlug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("keeps the GT3 RS slug stable and has a healthy size", () => {
    expect(
      CATALOG.find((e) => e.makeSlug === "porsche" && e.modelSlug === "911-gt3-rs"),
    ).toBeTruthy();
    expect(CATALOG.length).toBeGreaterThan(250);
    expect(MAKES.length).toBeGreaterThan(35);
  });

  it("matches 'mercedes s63' term by term", () => {
    const s63 = CATALOG.find((e) => e.makeSlug === "mercedes-amg" && e.modelSlug === "s63")!;
    const text = searchTextFor(s63);
    for (const term of ["mercedes", "s63", "benz", "amg", "w222"]) expect(text).toContain(term);
    expect(s63.yearStart).toBe(2008);
  });

  it("every entry has both source aliases and sane years", () => {
    for (const e of CATALOG) {
      expect([e.make, "Mercedes-Benz"]).toContain(e.aliases.visor.make);
      expect(e.aliases.ocd.model.length).toBeGreaterThan(0);
      expect(e.yearStart).toBeGreaterThan(1900);
      if (e.yearEnd != null) expect(e.yearEnd).toBeGreaterThanOrEqual(e.yearStart);
    }
  });
});
