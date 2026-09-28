import { describe, expect, it } from "vitest";
import { BLOB_HOST_SUFFIX } from "@/lib/listings/blob-url";
import { photoRequest } from "@/lib/listings/photo-request";

const SIZES = "(max-width: 900px) 100vw, 50vw";

describe("photoRequest", () => {
  it("routes blob uploads through the image optimizer with a srcset for the slot", () => {
    const src = `https://abc${BLOB_HOST_SUFFIX}/listings/u1/car.jpg`;
    const r = photoRequest(src, SIZES);
    expect(r.src.startsWith("/_next/image?url=")).toBe(true);
    expect(r.src).toContain(encodeURIComponent(src));
    expect(r.src).not.toBe(src);
    expect(r.sizes).toBe(SIZES);
    expect(r.srcSet).toBeDefined();
    // Every candidate is an optimizer URL with a width descriptor, not the original.
    const candidates = r.srcSet!.split(",").map((c) => c.trim());
    expect(candidates.length).toBeGreaterThan(1);
    for (const c of candidates) {
      expect(c).toMatch(/^\/_next\/image\?url=.+&w=\d+&q=\d+ \d+w$/);
    }
  });

  it("requests external platform photos as-is", () => {
    const src = "https://cdn.bringatrailer.com/photo.jpg";
    expect(photoRequest(src, SIZES)).toEqual({ src });
  });
});
