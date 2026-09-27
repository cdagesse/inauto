import { describe, expect, it } from "vitest";
import { compareVenues, mileageBand, venuePrice } from "@/lib/market/venues";
import type { AuctionRow, MarketSnapshot } from "@/lib/market/types";

function auction(
  platform: string,
  price: number,
  miles: number,
  status: AuctionRow["status"] = "sold",
  endedAt = "2026-08-01",
): AuctionRow {
  return {
    id: `${platform}-${price}-${miles}`,
    endedAt,
    platform,
    status,
    price,
    year: 2020,
    miles,
    weissach: false,
    url: "",
    generation: "G1",
  };
}

const snapshot = {
  order: ["G1"],
  generations: { G1: { name: "G1", median: 100_000 } },
  auctions: [
    auction("Bring a Trailer", 120_000, 10_000),
    auction("Bring a Trailer", 110_000, 12_000),
    auction("Bring a Trailer", 90_000, 40_000),
    auction("Bring a Trailer", 80_000, 60_000, "rnm"),
    auction("Cars & Bids", 95_000, 11_000),
    auction("Cars & Bids", 92_000, 9_000),
    auction("Cars & Bids", 70_000, 50_000),
    auction("Bonhams", 150_000, 8_000),
  ],
} as unknown as MarketSnapshot;

describe("mileageBand", () => {
  it("is ±40% but never narrower than ±5,000", () => {
    expect(mileageBand(10_000)).toEqual({ lo: 5_000, hi: 15_000 });
    expect(mileageBand(50_000)).toEqual({ lo: 30_000, hi: 70_000 });
    expect(mileageBand(2_000)).toEqual({ lo: 0, hi: 7_000 });
  });
});

describe("compareVenues", () => {
  it("judges venues on similar-mileage sales when there are enough", () => {
    const c = compareVenues(snapshot, { generation: "G1", miles: 10_000 });
    const bat = c.venues.find((v) => v.platform === "Bring a Trailer")!;
    expect(bat.n).toBe(4);
    expect(bat.sold).toBe(3);
    expect(bat.sellThrough).toBeCloseTo(0.75);
    expect(bat.similar).toBe(2);
    expect(bat.similarMedian).toBe(115_000);
    expect(venuePrice(bat)).toBe(115_000);
    expect(bat.vsDealer).toBeCloseTo(0.15);
    expect(c.best?.platform).toBe("Bring a Trailer");
    expect(c.runnerUp?.platform).toBe("Cars & Bids");
    expect(c.reason).toMatch(/Bring a Trailer runs 23% above Cars & Bids/);
  });

  it("ignores venues with too few results even when their price is highest", () => {
    const c = compareVenues(snapshot, { generation: "G1", miles: 8_000 });
    expect(c.best?.platform).not.toBe("Bonhams");
    // judged venues come first in the table, thin ones after
    expect(c.venues[c.venues.length - 1]!.platform).toBe("Bonhams");
  });

  it("only lets venues with similar-mileage sales compete when any venue has them", () => {
    const rich = {
      ...snapshot,
      auctions: [
        ...snapshot.auctions,
        auction("Bonhams", 160_000, 9_000),
        auction("Bonhams", 155_000, 7_000),
      ],
    } as MarketSnapshot;
    // a 50,000-mile car: Bonhams has 3 low-mile sales, none similar; BaT and C&B have one each,
    // so nobody qualifies on similar miles and all-mile medians decide
    const far = compareVenues(rich, { generation: "G1", miles: 50_000 });
    expect(far.best?.platform).toBe("Bonhams");
    // a 9,000-mile car: Bonhams has 3 similar sales and wins on them
    const near = compareVenues(rich, { generation: "G1", miles: 9_000 });
    expect(near.best?.platform).toBe("Bonhams");
    expect(near.reason).toMatch(/3 sales within/);
  });

  it("breaks a near-tie on price by sell-through", () => {
    const tie = {
      ...snapshot,
      auctions: [
        auction("A", 100_000, 10_000),
        auction("A", 101_000, 11_000),
        auction("A", 90_000, 12_000, "rnm"),
        auction("A", 90_000, 12_000, "rnm"),
        auction("B", 99_000, 10_000),
        auction("B", 100_000, 11_000),
        auction("B", 98_000, 12_000),
      ],
    } as MarketSnapshot;
    const c = compareVenues(tie, { generation: "G1", miles: 11_000 });
    expect(c.best?.platform).toBe("B");
    expect(c.reason).toMatch(/edges it by selling 100% of what it lists against 50%/);
  });

  it("falls back to all sold results without a mileage", () => {
    const c = compareVenues(snapshot, { generation: "G1" });
    expect(c.band).toBeNull();
    const bat = c.venues.find((v) => v.platform === "Bring a Trailer")!;
    expect(bat.similar).toBe(0);
    expect(venuePrice(bat)).toBe(110_000);
  });

  it("returns no recommendation when nothing qualifies", () => {
    const thin = { ...snapshot, auctions: [auction("Bonhams", 150_000, 8_000)] } as MarketSnapshot;
    const c = compareVenues(thin, { generation: "G1", miles: 8_000 });
    expect(c.best).toBeNull();
    expect(c.reason).toBeNull();
  });
});
