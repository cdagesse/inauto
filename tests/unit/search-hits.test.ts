import { describe, expect, it } from "vitest";
import { buildHits, defaultHref } from "@/components/site/search";

const data = {
  makes: [{ name: "BMW", slug: "bmw" }],
  models: [
    { make: "BMW", makeSlug: "bmw", model: "M3", modelSlug: "m3", ready: true },
    { make: "BMW", makeSlug: "bmw", model: "M3 (E30)", modelSlug: "m3-e30", ready: false },
  ],
};

describe("search suggestions", () => {
  it("offers cars for sale first, then market reports, for a bare make", () => {
    const hits = buildHits("BMW", data);
    expect(hits[0]).toMatchObject({ group: "listings", href: "/listings?make=BMW" });
    expect(hits.find((h) => h.group === "market" && h.main === "BMW")?.href).toBe("/markets?q=BMW");
    expect(hits.find((h) => h.group === "market" && h.main === "M3")?.href).toBe("/bmw/m3");
  });
  it("drops make rows once a model is being typed and keeps both sections", () => {
    const hits = buildHits("BMW M3", data);
    expect(hits.some((h) => h.main === "BMW")).toBe(false);
    expect(hits[0]).toMatchObject({ group: "listings", href: "/listings?make=BMW&model=M3" });
    expect(hits.some((h) => h.group === "market" && h.detail === "Market report")).toBe(true);
  });
  it("sends a bare make straight to its listings on Enter", () => {
    expect(defaultHref("bmw", data)).toBe("/listings?make=BMW");
    expect(defaultHref("BMW M3", data)).toBe("/listings?make=BMW&model=M3");
    expect(defaultHref("zzz", { makes: [], models: [] })).toBe("/markets?q=zzz");
  });
});
