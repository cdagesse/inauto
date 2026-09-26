import { describe, expect, it } from "vitest";
import { brandLogoUrl, monogram, motomarksId, slugifyMake } from "@/lib/brand/logo";

describe("brand logo helpers", () => {
  it("slugifies make names the way the catalog does", () => {
    expect(slugifyMake("Mercedes-Benz")).toBe("mercedes-benz");
    expect(slugifyMake("Aston Martin")).toBe("aston-martin");
    expect(slugifyMake("Citroën")).toBe("citroen");
  });

  it("keeps catalog slugs and maps informal spellings to the Motomarks id", () => {
    expect(motomarksId("Mercedes-AMG")).toBe("mercedes-amg");
    expect(motomarksId("Mercedes")).toBe("mercedes-benz");
    expect(motomarksId("Chevy")).toBe("chevrolet");
    expect(motomarksId("Porsche")).toBe("porsche");
    expect(motomarksId("Land Rover")).toBe("land-rover");
    expect(motomarksId("Range Rover")).toBe("land-rover");
  });

  it("returns null without a token and a CDN url with one", () => {
    expect(brandLogoUrl("Porsche", {}, null)).toBeNull();
    const url = brandLogoUrl("Bentley", { size: "md", type: "full" }, "pk_test");
    expect(url).not.toBeNull();
    const u = new URL(url!);
    expect(u.origin).toBe("https://motomarks.io");
    expect(u.pathname).toBe("/img/bentley");
    expect(u.searchParams.get("size")).toBe("md");
    expect(u.searchParams.get("type")).toBe("full");
    expect(u.searchParams.get("format")).toBe("webp");
    expect(u.searchParams.get("token")).toBe("pk_test");
  });

  it("defaults to a small square badge", () => {
    const u = new URL(brandLogoUrl("porsche", {}, "t")!);
    expect(u.searchParams.get("size")).toBe("sm");
    expect(u.searchParams.get("type")).toBe("badge");
    expect(u.searchParams.get("aspect")).toBe("square");
  });

  it("builds monograms", () => {
    expect(monogram("Porsche")).toBe("P");
    expect(monogram("Aston Martin")).toBe("AM");
    expect(monogram("Mercedes-AMG")).toBe("MA");
    expect(monogram("")).toBe("?");
  });
});
