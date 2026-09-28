import { describe, expect, it } from "vitest";
import { dealerTitle, decodeDealerCursor, encodeDealerCursor } from "@/lib/listings/dealer-cursor";

const id = "0f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8";

describe("dealer cursor", () => {
  it("round-trips the listing date and id, with and without a date", () => {
    expect(decodeDealerCursor(encodeDealerCursor({ listedOn: "2026-09-14", id }))).toEqual({ listedOn: "2026-09-14", id });
    expect(decodeDealerCursor(encodeDealerCursor({ listedOn: null, id }))).toEqual({ listedOn: null, id });
  });
  it("rejects garbage", () => {
    expect(decodeDealerCursor("")).toBeNull();
    expect(decodeDealerCursor("not base64url!!")).toBeNull();
    expect(decodeDealerCursor(Buffer.from("2026-09-14|nope").toString("base64url"))).toBeNull();
    expect(decodeDealerCursor(Buffer.from(`yesterday|${id}`).toString("base64url"))).toBeNull();
    expect(decodeDealerCursor("a".repeat(161))).toBeNull();
  });
});

describe("dealerTitle", () => {
  it("joins year, make, model and a distinct trim", () => {
    expect(dealerTitle({ year: 2019, make: "Porsche", model: "911 GT3", trim: "GT3 RS" })).toBe("2019 Porsche 911 GT3 GT3 RS");
    expect(dealerTitle({ year: null, make: "BMW", model: "M3", trim: null })).toBe("BMW M3");
  });
  it("drops a trim that only repeats the model or its short name", () => {
    expect(dealerTitle({ year: 2019, make: "Porsche", model: "911 GT3", modelShort: "GT3", trim: "gt3" })).toBe("2019 Porsche GT3");
    expect(dealerTitle({ year: 2019, make: "Porsche", model: "911 GT3", modelShort: "GT3", trim: "911 GT3" })).toBe("2019 Porsche GT3");
  });
});
