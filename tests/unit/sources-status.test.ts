import { describe, expect, it } from "vitest";
import { endedOn } from "@/lib/sources/status";

describe("endedOn", () => {
  const now = Date.parse("2026-09-28T18:00:00Z");
  it("returns the end time of a finished listing", () => {
    expect(endedOn("sold", "2026-09-28T17:29:31Z", now)?.toISOString()).toBe(
      "2026-09-28T17:29:31.000Z",
    );
    expect(endedOn("rnm", new Date("2026-09-20T00:00:00Z"), now)?.toISOString()).toBe(
      "2026-09-20T00:00:00.000Z",
    );
  });
  it("withholds a future or missing end, and never dates a live listing", () => {
    expect(endedOn("sold", "2026-10-05T00:00:00Z", now)).toBeNull();
    expect(endedOn("ended", null, now)).toBeNull();
    expect(endedOn("live", "2026-09-20T00:00:00Z", now)).toBeNull();
    expect(endedOn("sold", "not a date", now)).toBeNull();
  });
});
