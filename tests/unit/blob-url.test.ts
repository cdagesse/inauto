import { describe, expect, it } from "vitest";
import { BLOB_HOST_SUFFIX, isBlobUrl } from "@/lib/listings/blob-url";

describe("isBlobUrl", () => {
  it("accepts photos on the public blob store", () => {
    expect(isBlobUrl(`https://abc123${BLOB_HOST_SUFFIX}/listings/u1/car.jpg`)).toBe(true);
    expect(isBlobUrl("https://x.public.blob.vercel-storage.com/a.png?x=1")).toBe(true);
  });
  it("rejects external platform CDNs and look-alike hosts", () => {
    expect(isBlobUrl("https://cdn.bringatrailer.com/photo.jpg")).toBe(false);
    expect(isBlobUrl("https://public.blob.vercel-storage.com.evil.example/a.jpg")).toBe(false);
    expect(isBlobUrl("https://evil.example/?u=https://x.public.blob.vercel-storage.com")).toBe(
      false,
    );
  });
  it("returns false for strings that are not URLs", () => {
    expect(isBlobUrl("")).toBe(false);
    expect(isBlobUrl("not a url")).toBe(false);
    expect(isBlobUrl("/relative/path.jpg")).toBe(false);
  });
});
