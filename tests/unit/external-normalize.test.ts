import { describe, expect, it } from "vitest";
import { normalizeLiveRow, normalizeLiveStatus } from "@/lib/sources/ocd";

const now = new Date("2026-09-25T12:00:00Z");

describe("normalizeLiveRow", () => {
  it("maps a full row", () => {
    const r = normalizeLiveRow(
      {
        id: 12345,
        platform: "Bring a Trailer",
        url: "https://bringatrailer.com/listing/2024-porsche-911-gt3-rs-99/",
        title: "2024 Porsche 911 GT3 RS Weissach",
        year: "2024",
        make: "Porsche",
        model: "911 GT3 RS",
        trim: "Weissach",
        vin: "WP0AF2A96RS270001",
        mileage: "1,234",
        exterior_color: "Shark Blue",
        location: "Austin, TX",
        description: "One owner.",
        images: [
          "https://cdn.example.com/a.jpg",
          { url: "https://cdn.example.com/b.jpg" },
          "http://insecure/x.jpg",
        ],
        current_bid: "$455,000",
        bid_count: 21,
        reserve_met: "true",
        starts_at: "2026-09-20T12:00:00Z",
        ends_at: "2026-09-27T18:00:00Z",
        status: "live",
      },
      now,
    );
    expect(r).not.toBeNull();
    expect(r!.source).toBe("bat");
    expect(r!.sourceName).toBe("Bring a Trailer");
    expect(r!.sourceId).toBe("12345");
    expect(r!.year).toBe(2024);
    expect(r!.miles).toBe(1234);
    expect(r!.currentBid).toBe(455000);
    expect(r!.bidCount).toBe(21);
    expect(r!.reserveMet).toBe(true);
    expect(r!.photoUrls).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
    ]);
    expect(r!.status).toBe("live");
    expect(r!.endsAt).toBe("2026-09-27T18:00:00.000Z");
  });
  it("tolerates missing fields and builds a title", () => {
    const r = normalizeLiveRow(
      {
        auction_id: "x1",
        link: "https://carsandbids.com/auctions/x1",
        year: 2019,
        make: "BMW",
        model: "M2",
      },
      now,
    );
    expect(r).not.toBeNull();
    expect(r!.source).toBe("carsandbids");
    expect(r!.title).toBe("2019 BMW M2");
    expect(r!.miles).toBeNull();
    expect(r!.currentBid).toBeNull();
    expect(r!.reserveMet).toBeNull();
    expect(r!.photoUrls).toEqual([]);
    expect(r!.status).toBe("live");
  });
  it("returns null without an id or url", () => {
    expect(normalizeLiveRow({ url: "https://bringatrailer.com/x" }, now)).toBeNull();
    expect(normalizeLiveRow({ id: "1" }, now)).toBeNull();
    expect(normalizeLiveRow(null, now)).toBeNull();
  });
  it("marks a past end time as ended even when the source says live", () => {
    const r = normalizeLiveRow(
      {
        id: "1",
        url: "https://bringatrailer.com/x",
        status: "active",
        ends_at: "2026-09-01T00:00:00Z",
      },
      now,
    );
    expect(r!.status).toBe("ended");
  });
  it("normalizes result statuses", () => {
    expect(normalizeLiveStatus("sold", null, now)).toBe("sold");
    expect(normalizeLiveStatus("Reserve Not Met", null, now)).toBe("rnm");
    expect(normalizeLiveStatus("cancelled", null, now)).toBe("withdrawn");
    expect(normalizeLiveStatus("closed", null, now)).toBe("ended");
    expect(normalizeLiveStatus(undefined, "2099-01-01T00:00:00Z", now)).toBe("live");
  });
  it("keeps unknown platforms with the source's own name", () => {
    const r = normalizeLiveRow(
      { id: "9", url: "https://example-auctions.com/lot/9", platform: "Example Auctions" },
      now,
    );
    expect(r!.source).toBe("other");
    expect(r!.sourceName).toBe("Example Auctions");
  });
});
