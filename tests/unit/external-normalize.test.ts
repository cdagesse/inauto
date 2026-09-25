import { describe, expect, it } from "vitest";
import { normalizeLiveRow, normalizeLiveStatus } from "@/lib/sources/ocd";

const now = new Date("2026-09-25T12:00:00Z");

describe("normalizeLiveRow (real Old Cars Data fields)", () => {
  it("maps a full row", () => {
    const r = normalizeLiveRow(
      {
        id: 12345,
        source: "Bring a Trailer",
        url: "https://bringatrailer.com/listing/2024-porsche-911-gt3-rs-99/",
        vin: "WP0AF2A96RS270001",
        seller_username: "gt3guy",
        year: "2024",
        listing_make: "Porsche",
        listing_model: "911 GT3 RS",
        ocd_make_name: "Porsche",
        ocd_model_name: "911",
        title: "2024 Porsche 911 GT3 RS Weissach",
        description: "One owner.",
        mileage: "1,234",
        mileage_unit: "mi",
        exterior_color: "Shark Blue",
        auction_status: "active",
        has_reserve: true,
        auction_end_at: "2026-09-27T18:00:00Z",
        price: 455000,
        currency: "USD",
        city: "Austin",
        state: "TX",
        stats: { views: 5000, watches: 300, likes: 40, bids: 21, unique_bidder_count: 8 },
        featured_image_url: "https://cdn.example.com/a.jpg",
        created_at: "2026-09-20T12:00:00Z",
        seller_type: "private",
      },
      now,
    );
    expect(r).not.toBeNull();
    expect(r!).toMatchObject({
      source: "bat",
      sourceName: "Bring a Trailer",
      sourceId: "12345",
      make: "Porsche",
      model: "911",
      trim: "911 GT3 RS",
      year: 2024,
      miles: 1234,
      color: "Shark Blue",
      location: "Austin, TX",
      currentBid: 455000,
      bidCount: 21,
      reserveMet: null,
      hasReserve: true,
      photoUrls: ["https://cdn.example.com/a.jpg"],
      startedAt: "2026-09-20T12:00:00.000Z",
      endsAt: "2026-09-27T18:00:00.000Z",
      status: "live",
    });
  });
  it("tolerates missing fields, builds a title, converts km", () => {
    const r = normalizeLiveRow(
      {
        id: "x1",
        url: "https://carsandbids.com/auctions/x1",
        year: 2019,
        ocd_make_name: "BMW",
        ocd_model_name: "M2",
        mileage: 16093,
        mileage_unit: "km",
      },
      now,
    );
    expect(r).not.toBeNull();
    expect(r!.source).toBe("carsandbids");
    expect(r!.title).toBe("2019 BMW M2");
    expect(r!.miles).toBe(10000);
    expect(r!.currentBid).toBeNull();
    expect(r!.bidCount).toBeNull();
    expect(r!.photoUrls).toEqual([]);
    expect(r!.status).toBe("live");
  });
  it("returns null without an id or url", () => {
    expect(normalizeLiveRow({ url: "https://bringatrailer.com/x" }, now)).toBeNull();
    expect(normalizeLiveRow({ id: "1" }, now)).toBeNull();
    expect(normalizeLiveRow(null, now)).toBeNull();
  });
  it("marks a past end time as ended even when the source says active", () => {
    const r = normalizeLiveRow(
      {
        id: "1",
        url: "https://bringatrailer.com/x",
        auction_status: "active",
        auction_end_at: "2026-09-01T00:00:00Z",
      },
      now,
    );
    expect(r!.status).toBe("ended");
  });
  it("normalizes result statuses", () => {
    expect(normalizeLiveStatus("sold", null, now)).toBe("sold");
    expect(normalizeLiveStatus("reserve not met", null, now)).toBe("rnm");
    expect(normalizeLiveStatus("canceled", null, now)).toBe("withdrawn");
    expect(normalizeLiveStatus("result unavailable", null, now)).toBe("ended");
    expect(normalizeLiveStatus(undefined, "2099-01-01T00:00:00Z", now)).toBe("live");
  });
  it("keeps unknown platforms with the source's own name", () => {
    const r = normalizeLiveRow(
      { id: "9", url: "https://example-auctions.com/lot/9", source: "Example Auctions" },
      now,
    );
    expect(r!.source).toBe("other");
    expect(r!.sourceName).toBe("Example Auctions");
  });
});
