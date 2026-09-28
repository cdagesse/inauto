import { describe, expect, it } from "vitest";
import { fmtDate, fmtDay } from "@/lib/format/money";

describe("card dates", () => {
  it("print the New York day whatever the server zone", () => {
    expect(fmtDate("2026-09-28T01:30:00Z")).toBe("Sep 27, 2026");
    expect(fmtDate(new Date("2026-09-28T17:29:31Z"))).toBe("Sep 28, 2026");
    expect(fmtDate(null)).toBe("");
  });
  it("drop the year inside the current year only", () => {
    const now = new Date("2026-09-28T18:00:00Z");
    expect(fmtDay("2026-09-28T17:29:31Z", now)).toBe("Sep 28");
    expect(fmtDay("2025-12-31T23:30:00Z", now)).toBe("Dec 31, 2025");
    expect(fmtDay("2026-01-01T02:00:00Z", now)).toBe("Dec 31, 2025");
    expect(fmtDay(null, now)).toBe("");
  });
});
