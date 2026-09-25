import { describe, expect, it } from "vitest";
import { decideOutcome } from "@/jobs/close-auctions";

describe("decideOutcome", () => {
  it("ends with no bids", () => {
    expect(decideOutcome({ reservePrice: null }, null)).toBe("ended");
    expect(decideOutcome({ reservePrice: 100_000 }, null)).toBe("ended");
  });
  it("sells with no reserve and any bid", () => {
    expect(decideOutcome({ reservePrice: null }, { id: "b", amount: 100 })).toBe("sold");
  });
  it("sells when the high bid meets the reserve", () => {
    expect(decideOutcome({ reservePrice: 100_000 }, { id: "b", amount: 100_000 })).toBe("sold");
    expect(decideOutcome({ reservePrice: 100_000 }, { id: "b", amount: 150_000 })).toBe("sold");
  });
  it("ends when the high bid is below the reserve", () => {
    expect(decideOutcome({ reservePrice: 100_000 }, { id: "b", amount: 99_900 })).toBe("ended");
  });
});
