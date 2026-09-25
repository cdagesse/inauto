import { describe, expect, it } from "vitest";
import { bidDelta, liveStatusFor, maskVin, reconcileDecision } from "@/lib/sources/live";

const now = new Date("2026-09-25T12:00:00Z");

describe("liveStatusFor", () => {
  it("ends a live listing whose end time passed", () => {
    expect(liveStatusFor("live", new Date("2026-09-24T00:00:00Z"), now)).toBe("ended");
    expect(liveStatusFor("live", new Date("2026-09-26T00:00:00Z"), now)).toBe("live");
    expect(liveStatusFor("live", null, now)).toBe("live");
    expect(liveStatusFor("sold", new Date("2026-09-24T00:00:00Z"), now)).toBe("sold");
  });
});

describe("reconcileDecision", () => {
  const ext = {
    source: "bat",
    sourceName: "Bring a Trailer",
    sourceId: "123",
    status: "ended" as const,
  };
  it("settles by matching platform name and id", () => {
    expect(
      reconcileDecision(ext, {
        source: "Bring a Trailer",
        sourceId: "123",
        status: "sold",
        hammerPrice: 250000,
      }),
    ).toEqual({ status: "sold", finalPrice: 250000 });
  });
  it("matches on derived platform key when names differ in spelling", () => {
    expect(
      reconcileDecision(ext, {
        source: "BaT",
        sourceId: "123",
        status: "rnm",
        hammerPrice: 189000,
      }),
    ).toEqual({ status: "rnm", finalPrice: 189000 });
  });
  it("ignores other ids and other platforms", () => {
    expect(
      reconcileDecision(ext, {
        source: "Bring a Trailer",
        sourceId: "124",
        status: "sold",
        hammerPrice: 1,
      }),
    ).toBeNull();
    expect(
      reconcileDecision(ext, {
        source: "Cars & Bids",
        sourceId: "123",
        status: "sold",
        hammerPrice: 1,
      }),
    ).toBeNull();
  });
  it("never re-settles a settled listing", () => {
    expect(
      reconcileDecision(
        { ...ext, status: "sold" },
        { source: "Bring a Trailer", sourceId: "123", status: "rnm", hammerPrice: 1 },
      ),
    ).toBeNull();
  });
  it("also settles a listing still marked live", () => {
    expect(
      reconcileDecision(
        { ...ext, status: "live" },
        { source: "Bring a Trailer", sourceId: "123", status: "withdrawn", hammerPrice: null },
      ),
    ).toEqual({ status: "withdrawn", finalPrice: null });
  });
});

describe("bidDelta", () => {
  it("describes under, over and at", () => {
    expect(bidDelta(440000, 500000)!.text).toBe("Current bid is 12% under our market value");
    expect(bidDelta(550000, 500000)!.text).toBe("Current bid is 10% over our market value");
    expect(bidDelta(500000, 500000)!.text).toBe("Current bid is right at our market value");
    expect(bidDelta(440000, 500000)!.direction).toBe("under");
  });
  it("returns null without a bid or value", () => {
    expect(bidDelta(null, 500000)).toBeNull();
    expect(bidDelta(0, 500000)).toBeNull();
    expect(bidDelta(1000, 0)).toBeNull();
  });
});

describe("maskVin", () => {
  it("shows only the last six", () => {
    expect(maskVin("WP0AF2A96RS270001")).toBe("•••••••••••270001");
    expect(maskVin("ABC")).toBe("ABC");
    expect(maskVin(null)).toBeNull();
  });
});
