import { describe, expect, it } from "vitest";
import {
  isPlatformKey,
  platformFromName,
  platformFromUrl,
  resolvePlatform,
} from "@/lib/sources/platforms";

describe("platform key derivation", () => {
  it("maps known hosts", () => {
    expect(
      platformFromUrl("https://bringatrailer.com/listing/2019-porsche-911-gt3-rs-71/").key,
    ).toBe("bat");
    expect(platformFromUrl("https://carsandbids.com/auctions/abc").key).toBe("carsandbids");
    expect(platformFromUrl("https://www.sothebysmotorsport.com/auction/x").key).toBe("sothebys");
    expect(platformFromUrl("https://www.hagerty.com/marketplace/auction/x").key).toBe("hagerty");
    expect(platformFromUrl("https://www.barrett-jackson.com/2026-las-vegas/docket/x").key).toBe(
      "barrettjackson",
    );
    expect(platformFromUrl("https://cars.bonhams.com/auction/1/lot/2/").key).toBe("bonhams");
    expect(platformFromUrl("https://www.pcarmarket.com/auction/x").key).toBe("pcarmarket");
    expect(platformFromUrl("https://collectingcars.com/for-sale/x").key).toBe("collectingcars");
  });
  it("falls back to other for unknown or invalid hosts", () => {
    expect(platformFromUrl("https://example.com/x").key).toBe("other");
    expect(platformFromUrl("not a url").key).toBe("other");
    expect(platformFromUrl(null).key).toBe("other");
  });
  it("does not match lookalike hosts", () => {
    expect(platformFromUrl("https://bringatrailer.com.evil.example/x").key).toBe("other");
    expect(platformFromUrl("https://notbringatrailer.com/x").key).toBe("other");
  });
  it("maps names when the URL is unknown", () => {
    expect(platformFromName("Bring a Trailer").key).toBe("bat");
    expect(platformFromName("BaT").key).toBe("bat");
    expect(platformFromName("Cars & Bids").key).toBe("carsandbids");
    expect(platformFromName("Sotheby's Motorsport").key).toBe("sothebys");
    expect(platformFromName("Hagerty Marketplace").key).toBe("hagerty");
    expect(platformFromName("Barrett-Jackson").key).toBe("barrettjackson");
    expect(platformFromName("Mystery House").key).toBe("other");
    expect(resolvePlatform("https://example.com/x", "Bonhams").key).toBe("bonhams");
    expect(resolvePlatform("https://carsandbids.com/x", "Bonhams").key).toBe("carsandbids");
  });
  it("validates keys", () => {
    expect(isPlatformKey("bat")).toBe(true);
    expect(isPlatformKey("ebay")).toBe(false);
    expect(isPlatformKey(3)).toBe(false);
  });
});
