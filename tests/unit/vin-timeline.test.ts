import { describe, expect, it } from "vitest";
import { buildVinTimeline, isVin, type VinRows } from "@/lib/vin/timeline";

const rows: VinRows = {
  dealer: [
    // one dealer listing seen over three days, then sold
    {
      sourceListingId: "d1",
      price: 90_000,
      miles: 12_000,
      dealerName: "Acme Porsche",
      state: "CA",
      date: "2026-03-01",
      listedAt: "2026-03-01 10:00:00",
      sold: false,
    },
    {
      sourceListingId: "d1",
      price: 89_000,
      miles: 12_000,
      dealerName: "Acme Porsche",
      state: "CA",
      date: "2026-03-03",
      listedAt: "2026-03-01 10:00:00",
      sold: false,
    },
    {
      sourceListingId: "d1",
      price: 88_000,
      miles: 12_000,
      dealerName: "Acme Porsche",
      state: "CA",
      date: "2026-03-20",
      listedAt: "2026-03-01 10:00:00",
      sold: true,
    },
    // another dealer, still listed
    {
      sourceListingId: "d2",
      price: 95_000,
      miles: 12_500,
      dealerName: "Beta Motors",
      state: "TX",
      date: "2026-09-25",
      listedAt: "2026-09-10 08:00:00",
      sold: false,
    },
  ],
  auctions: [
    {
      source: "Bring a Trailer",
      sourceId: "bat-1",
      url: "https://bat.example/1",
      status: "rnm",
      price: 80_000,
      miles: 11_000,
      endedAt: "2025-11-15",
    },
  ],
  external: [
    // same auction as the settled result: must not duplicate
    {
      source: "bat",
      sourceName: "Bring a Trailer",
      sourceId: "bat-1",
      status: "rnm",
      currentBid: 80_000,
      finalPrice: null,
      miles: 11_000,
      endsAt: "2025-11-15T18:00:00Z",
    },
    {
      source: "bat",
      sourceName: "Bring a Trailer",
      sourceId: "bat-2",
      status: "live",
      currentBid: 70_000,
      finalPrice: null,
      miles: 12_600,
      endsAt: "2026-09-30T18:00:00Z",
    },
    // same auction as the settled result under a different id: same platform, one day apart
    {
      source: "bat",
      sourceName: "Bring a Trailer",
      sourceId: "99999",
      status: "ended",
      currentBid: 80_000,
      finalPrice: null,
      miles: 11_000,
      endsAt: "2025-11-16T02:00:00Z",
    },
  ],
  inauto: [
    {
      id: "l1",
      status: "sold",
      type: "auction",
      askingPrice: null,
      soldPrice: 91_000,
      miles: 12_200,
      createdAt: "2026-05-01 12:00:00",
      closedAt: "2026-05-09 12:00:00",
    },
    {
      id: "l2",
      status: "draft",
      type: "classified",
      askingPrice: 99_000,
      soldPrice: null,
      miles: 12_200,
      createdAt: "2026-06-01 12:00:00",
      closedAt: null,
    },
  ],
};

describe("buildVinTimeline", () => {
  const events = buildVinTimeline(rows, { kind: "external", id: "bat:bat-2" });

  it("orders newest first and drops drafts and duplicates", () => {
    expect(events.map((e) => e.kind)).toEqual([
      "auction_live",
      "dealer_listed",
      "inauto_sold",
      "dealer_sold",
      "auction_rnm",
    ]);
  });

  it("collapses daily dealer snapshots into one span and uses the sale row", () => {
    const sold = events.find((e) => e.kind === "dealer_sold")!;
    expect(sold.from).toBe("2026-03-01");
    expect(sold.date).toBe("2026-03-20");
    expect(sold.price).toBe(88_000);
    expect(sold.title).toBe("Sold by Acme Porsche, CA");
    const listed = events.find((e) => e.kind === "dealer_listed")!;
    expect(listed.detail).toBe("Seen from 2026-09-10 to 2026-09-25");
  });

  it("marks the listing being viewed and links platform rows to our pages", () => {
    const live = events.find((e) => e.kind === "auction_live")!;
    expect(live.current).toBe(true);
    expect(live.href).toBe("/listings/ext/bat/bat-2");
    const sold = events.find((e) => e.kind === "inauto_sold")!;
    expect(sold.price).toBe(91_000);
    expect(sold.from).toBe("2026-05-01");
    expect(sold.date).toBe("2026-05-09");
  });
});

describe("isVin", () => {
  it("accepts 11 to 17 character VINs in either case, trimming whitespace", () => {
    expect(isVin("WP0AB2A99KS123456")).toBe(true);
    expect(isVin("wp0ab2a99ks123456")).toBe(true);
    expect(isVin("  WP0AB2A99KS123456 ")).toBe(true);
    expect(isVin("ZFF77XJA1D0")).toBe(true);
  });
  it("rejects I, O and Q, short or long strings, and empty input", () => {
    expect(isVin("WP0AB2A99KS12345I")).toBe(false);
    expect(isVin("WP0AB2A99KS12345O")).toBe(false);
    expect(isVin("WP0AB2A99KS12345Q")).toBe(false);
    expect(isVin("WP0AB2A99K")).toBe(false);
    expect(isVin("WP0AB2A99KS1234567")).toBe(false);
    expect(isVin("")).toBe(false);
    expect(isVin(null)).toBe(false);
    expect(isVin(undefined)).toBe(false);
  });
});
