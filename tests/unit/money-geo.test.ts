import { describe, expect, it } from "vitest";
import { isUsd, money } from "@/components/account/money";
import { countryName, flag, normalizeCountry, placeLine } from "@/lib/geo";
import { normalizeLiveRow } from "@/lib/sources/ocd";

describe("money", () => {
  it("formats in the listing's own currency", () => {
    expect(money(20250, "USD")).toBe("$20,250");
    expect(money(20250, "GBP")).toBe("£20,250");
    expect(money(20250, "EUR")).toBe("€20,250");
    expect(money(20250, null)).toBe("$20,250");
    expect(money(null, "GBP")).toBe("n/a");
    expect(isUsd("gbp")).toBe(false);
    expect(isUsd(undefined)).toBe(true);
  });
});

describe("geo", () => {
  it("normalises codes, names countries and builds the place line", () => {
    expect(normalizeCountry("uk")).toBe("GB");
    expect(countryName("GB")).toBe("United Kingdom");
    expect(flag("GB")).toBe("🇬🇧");
    expect(placeLine("Rochester, KENT", "GB")).toBe("Rochester, KENT · 🇬🇧 United Kingdom");
    expect(placeLine("Hauppauge, NY", "US")).toBe("Hauppauge, NY");
    expect(placeLine(null, null)).toBeNull();
  });
});

describe("normalizeLiveRow currency and country", () => {
  it("reads currency and country_code, defaulting to USD", () => {
    const r = normalizeLiveRow(
      {
        id: 1,
        url: "https://www.carandclassic.com/l/1",
        source: "carandclassic",
        title: "x",
        currency: "gbp",
        country_code: "gb",
        price: 20250,
      },
      new Date("2026-09-27T00:00:00Z"),
    );
    expect(r?.currency).toBe("GBP");
    expect(r?.country).toBe("GB");
    const u = normalizeLiveRow({ id: 2, url: "https://bringatrailer.com/listing/x", title: "y" });
    expect(u?.currency).toBe("USD");
    expect(u?.country).toBeNull();
  });
});
