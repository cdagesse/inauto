import { describe, expect, it } from "vitest";
import { fmtDate, mi, usd, usdK } from "@/lib/format/money";

describe("shared display formatters", () => {
  it("formats whole dollars and treats missing values as n/a", () => {
    expect(usd(20250)).toBe("$20,250");
    expect(usd(1999.6)).toBe("$2,000");
    expect(usd(0)).toBe("$0");
    expect(usd(null)).toBe("n/a");
    expect(usd(undefined)).toBe("n/a");
  });

  it("rounds to whole thousands for the k shorthand", () => {
    expect(usdK(20250)).toBe("$20k");
    expect(usdK(20500)).toBe("$21k");
    expect(usdK(999)).toBe("$1k");
  });

  it("formats miles with separators and no unit", () => {
    expect(mi(48210)).toBe("48,210");
    expect(mi(48210.4)).toBe("48,210");
    expect(mi(null)).toBe("n/a");
  });

  it("formats dates from Date or ISO strings and blanks missing ones", () => {
    expect(fmtDate(new Date(2026, 2, 4))).toBe("Mar 4, 2026");
    expect(fmtDate("2026-03-04T12:00:00Z")).toMatch(/^Mar [34], 2026$/);
    expect(fmtDate(null)).toBe("");
    expect(fmtDate(undefined)).toBe("");
  });
});
