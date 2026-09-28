import { describe, expect, it } from "vitest";
import { BLOB_HOST_SUFFIX, isBlobUrl } from "@/lib/listings/blob-url";
import { photoUrl } from "@/server/listings-schema";

const blob = `https://abc123${BLOB_HOST_SUFFIX}/listings/u1/photo.jpg`;

describe("isBlobUrl", () => {
  it("accepts only the Blob store host", () => {
    expect(isBlobUrl(blob)).toBe(true);
    expect(isBlobUrl("https://example.com/photo.jpg")).toBe(false);
    expect(isBlobUrl("https://public.blob.vercel-storage.com.evil.example/x.jpg")).toBe(false);
    expect(isBlobUrl("not a url")).toBe(false);
  });
});

describe("photoUrl", () => {
  it("accepts UrCar blob uploads", () => {
    expect(photoUrl.safeParse(blob).success).toBe(true);
  });

  it("rejects other hosts and non-https links with the upload message", () => {
    const other = photoUrl.safeParse("https://example.com/photo.jpg");
    expect(other.success).toBe(false);
    if (!other.success) expect(other.error.issues[0]?.message).toBe("Upload photos through UrCar.");
    expect(photoUrl.safeParse(`http://abc${BLOB_HOST_SUFFIX}/x.jpg`).success).toBe(false);
  });
});
