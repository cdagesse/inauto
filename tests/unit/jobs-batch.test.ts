import { describe, expect, it } from "vitest";
import { chunk, UPSERT_CHUNK } from "@/jobs/lib/batch";

describe("chunk", () => {
  it("splits into consecutive slices with a shorter tail", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(chunk([1], 5)).toEqual([[1]]);
  });
  it("yields no slices for no rows, so callers issue no empty INSERT", () => {
    expect(chunk([], 200)).toEqual([]);
  });
  it("rejects a non-positive or fractional size", () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], 1.5)).toThrow(RangeError);
  });
  it("keeps the external-listing upsert at 200 rows per statement", () => {
    const rows = Array.from({ length: 450 }, (_, i) => i);
    const slices = chunk(rows, UPSERT_CHUNK);
    expect(UPSERT_CHUNK).toBe(200);
    expect(slices.map((s) => s.length)).toEqual([200, 200, 50]);
    expect(slices.flat()).toEqual(rows);
  });
});
