import { describe, expect, it, vi } from "vitest";
import { BLOB_HOST_SUFFIX } from "@/lib/listings/blob-url";

// listings-schema is a server module; the guard package throws outside a
// react-server environment, so it is stubbed here as the integration tests do.
vi.mock("server-only", () => ({}));

const { photoUrl } = await import("@/server/listings-schema");

const blob = `https://abc123${BLOB_HOST_SUFFIX}/listings/u1/photo.jpg`;

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
