import { describe, expect, it } from "vitest";
import {
  evidenceHref,
  evidencePrefixFor,
  isEvidencePathname,
  isEvidenceSlot,
  isLegacyEvidenceUrl,
  legacyEvidencePathname,
  orphanedEvidence,
  ownsEvidencePathname,
  referencedEvidence,
} from "@/lib/purchase/evidence";
import { purchaseSchemaFor } from "@/server/purchases-schema";

describe("evidence pathnames", () => {
  it("accepts a blob pathname under purchases/{owner}/ and nothing else", () => {
    expect(isEvidencePathname("purchases/user_2abc/title-front-scan-Xy12.jpg")).toBe(true);
    expect(isEvidencePathname("purchases/user_2abc/ownership-clip.mov")).toBe(true);
    expect(isEvidencePathname("listings/user_2abc/photo.jpg")).toBe(false);
    expect(isEvidencePathname("purchases/user_2abc/")).toBe(false);
    expect(isEvidencePathname("purchases/user_2abc/a/b.jpg")).toBe(false);
    expect(isEvidencePathname("purchases/user_2abc/..")).toBe(false);
    expect(isEvidencePathname("purchases/../user_2abc/x.jpg")).toBe(false);
    expect(isEvidencePathname("https://x.public.blob.vercel-storage.com/purchases/u/x.jpg")).toBe(
      false,
    );
    expect(isEvidencePathname("")).toBe(false);
  });
  it("ties ownership to the clerk id prefix", () => {
    expect(evidencePrefixFor("user_1")).toBe("purchases/user_1/");
    expect(ownsEvidencePathname("purchases/user_1/title-front-a.jpg", "user_1")).toBe(true);
    expect(ownsEvidencePathname("purchases/user_1/title-front-a.jpg", "user_2")).toBe(false);
    expect(ownsEvidencePathname("purchases/user_10/title-front-a.jpg", "user_1")).toBe(false);
  });
  it("recognises the public URLs older rows stored", () => {
    expect(
      isLegacyEvidenceUrl("https://abc.public.blob.vercel-storage.com/purchases/u/x.jpg"),
    ).toBe(true);
    expect(isLegacyEvidenceUrl("http://abc.public.blob.vercel-storage.com/x.jpg")).toBe(false);
    expect(isLegacyEvidenceUrl("https://evil.example.com/x.jpg")).toBe(false);
    expect(isLegacyEvidenceUrl("purchases/u/x.jpg")).toBe(false);
  });
  it("recovers the pathname a legacy URL points at", () => {
    expect(
      legacyEvidencePathname(
        "https://abc.public.blob.vercel-storage.com/purchases/user_1/title-front-Xy12.jpg",
      ),
    ).toBe("purchases/user_1/title-front-Xy12.jpg");
    expect(
      legacyEvidencePathname(
        "https://abc.public.blob.vercel-storage.com/purchases/user_1/my%20title.jpg",
      ),
    ).toBe(null);
    expect(
      legacyEvidencePathname("https://abc.public.blob.vercel-storage.com/listings/user_1/x.jpg"),
    ).toBe(null);
    expect(legacyEvidencePathname("https://evil.example.com/purchases/user_1/x.jpg")).toBe(null);
    expect(legacyEvidencePathname("purchases/user_1/x.jpg")).toBe(null);
  });
  it("maps slots to the streaming route", () => {
    expect(isEvidenceSlot("title-front")).toBe(true);
    expect(isEvidenceSlot("titleFront")).toBe(false);
    expect(isEvidenceSlot("constructor")).toBe(false);
    expect(evidenceHref("p1", "ownership-video")).toBe(
      "/api/purchases/p1/evidence/ownership-video",
    );
  });
});

describe("purchaseSchemaFor", () => {
  const base = {
    listingId: "5f4b8c3e-1234-4c9a-9f1e-0d1e2f3a4b5c",
    mode: "online",
    buyer: {
      legalName: "Pat Buyer",
      email: "pat@example.com",
      phone: "5551234567",
      address: "1 Main St",
    },
    options: { inspection: false, titleVetting: false, escrow: false, shipping: false },
    note: null,
    acknowledged: true,
  };
  it("accepts the buyer's own evidence pathnames", () => {
    const r = purchaseSchemaFor("user_1").safeParse({
      ...base,
      uploads: { titleFront: "purchases/user_1/title-front-scan.jpg" },
    });
    expect(r.success).toBe(true);
  });
  it("rejects URLs and other users' pathnames", () => {
    const url = purchaseSchemaFor("user_1").safeParse({
      ...base,
      uploads: { titleFront: "https://abc.public.blob.vercel-storage.com/purchases/user_1/x.jpg" },
    });
    expect(url.success).toBe(false);
    const other = purchaseSchemaFor("user_1").safeParse({
      ...base,
      uploads: { ownershipVideo: "purchases/user_2/ownership-clip.mp4" },
    });
    expect(other.success).toBe(false);
  });
});

describe("orphanedEvidence", () => {
  const now = new Date("2026-09-27T08:00:00Z");
  const day = 86_400_000;
  const old = new Date(now.getTime() - 3 * day);
  const fresh = new Date(now.getTime() - 1 * day);
  it("keeps referenced blobs, fresh blobs and anything outside purchases/", () => {
    const out = orphanedEvidence(
      [
        { pathname: "purchases/u1/title-front-a.jpg", uploadedAt: old },
        { pathname: "purchases/u1/title-back-b.jpg", uploadedAt: old },
        { pathname: "purchases/u2/ownership-c.mp4", uploadedAt: fresh },
        { pathname: "listings/u1/photo.jpg", uploadedAt: old },
      ],
      new Set(["purchases/u1/title-front-a.jpg"]),
      now,
      2 * day,
    );
    expect(out).toEqual(["purchases/u1/title-back-b.jpg"]);
  });
  it("keeps a blob that only a legacy public URL references", () => {
    const referenced = referencedEvidence([
      "https://abc.public.blob.vercel-storage.com/purchases/u1/title-front-a.jpg",
      "purchases/u1/title-back-b.jpg",
      null,
      undefined,
    ]);
    expect(referenced.has("purchases/u1/title-front-a.jpg")).toBe(true);
    expect(referenced.has("purchases/u1/title-back-b.jpg")).toBe(true);
    const out = orphanedEvidence(
      [
        { pathname: "purchases/u1/title-front-a.jpg", uploadedAt: old },
        { pathname: "purchases/u1/title-back-b.jpg", uploadedAt: old },
        { pathname: "purchases/u1/ownership-c.mp4", uploadedAt: old },
      ],
      referenced,
      now,
      2 * day,
    );
    expect(out).toEqual(["purchases/u1/ownership-c.mp4"]);
  });
});
