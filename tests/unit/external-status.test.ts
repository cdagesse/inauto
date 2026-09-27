import { describe, expect, it } from "vitest";
import { effectiveStatus, outcomeLabel, priceLabel } from "@/lib/sources/status";

const now = Date.parse("2026-09-27T12:00:00Z");

describe("effectiveStatus", () => {
  it("keeps live auctions live until they end", () => {
    expect(effectiveStatus("live", "2026-09-27T13:00:00Z", now)).toBe("live");
    expect(effectiveStatus("live", null, now)).toBe("live");
  });
  it("shows a live row whose end time passed as ended, not live", () => {
    expect(effectiveStatus("live", "2026-09-27T11:59:00Z", now)).toBe("ended");
    expect(effectiveStatus("live", new Date(now), now)).toBe("ended");
  });
  it("never changes settled rows", () => {
    expect(effectiveStatus("sold", "2026-09-27T13:00:00Z", now)).toBe("sold");
    expect(effectiveStatus("rnm", null, now)).toBe("rnm");
  });
});

describe("labels", () => {
  it("tells sold from not sold from pending", () => {
    expect(outcomeLabel("sold")).toBe("Sold");
    expect(outcomeLabel("rnm")).toBe("Not sold");
    expect(outcomeLabel("ended")).toBe("Result pending");
  });
  it("labels the price by state", () => {
    expect(priceLabel("live", true)).toBe("current bid");
    expect(priceLabel("live", false)).toBe("No bids yet");
    expect(priceLabel("sold", true)).toBe("sold for");
    expect(priceLabel("rnm", true)).toBe("high bid");
  });
});
