import { describe, expect, it } from "vitest";
import { endedSince, liveUpdatedSince, pickRotation, soldWindowDays } from "@/jobs/lib/schedule";

const now = new Date("2026-09-28T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("liveUpdatedSince", () => {
  it("looks back 36 hours when there is no good run yet", () => {
    expect(liveUpdatedSince(null, now)).toEqual(ago(36 * HOUR));
  });
  it("never narrows below two hours even right after a run", () => {
    expect(liveUpdatedSince(ago(15 * 60_000), now)).toEqual(ago(2 * HOUR));
  });
  it("covers a gap with 30 minutes of overlap", () => {
    expect(liveUpdatedSince(ago(5 * HOUR), now)).toEqual(ago(5.5 * HOUR));
  });
  it("caps a long outage at 36 hours", () => {
    expect(liveUpdatedSince(ago(4 * DAY), now)).toEqual(ago(36 * HOUR));
  });
});

describe("endedSince", () => {
  it("looks back 12 hours on the first run", () => {
    expect(endedSince(null, now)).toEqual(ago(12 * HOUR));
  });
  it("overlaps the last good run by two hours", () => {
    expect(endedSince(ago(6 * HOUR), now)).toEqual(ago(8 * HOUR));
    expect(endedSince(ago(1 * HOUR), now)).toEqual(ago(3 * HOUR));
  });
  it("caps at three days", () => {
    expect(endedSince(ago(10 * DAY), now)).toEqual(ago(3 * DAY));
  });
});

describe("pickRotation", () => {
  const m = (id: string, pulled: number | null) => ({
    id,
    dealerPulledAt: pulled == null ? null : ago(pulled),
  });
  it("takes never-pulled models first, then the stalest, one Nth of the catalog per night", () => {
    const models = [
      m("a", 3 * DAY),
      m("b", null),
      m("c", 20 * DAY),
      m("d", 10 * DAY),
      m("e", 15 * DAY),
      m("f", 2 * DAY),
      m("g", null),
    ];
    const r = pickRotation(models, now, 3); // ceil(7 / 3) = 3 per night
    expect(r.slice.map((x) => x.id)).toEqual(["b", "g", "c"]);
    expect(r.overdue).toBe(5); // b, g (never), c, d, e (older than 3 days)
    expect(r.fresh).toBe(0);
  });
  it("skips models pulled in the last day and still fills the slice", () => {
    const models = [m("a", 2 * HOUR), m("b", 5 * DAY), m("c", 6 * DAY)];
    const r = pickRotation(models, now, 14); // ceil(3 / 14) = 1 per night
    expect(r.slice.map((x) => x.id)).toEqual(["c"]);
    expect(r.fresh).toBe(1);
    expect(r.overdue).toBe(0);
  });
  it("handles an empty catalog and a one-day interval", () => {
    expect(pickRotation([], now, 14)).toEqual({ slice: [], overdue: 0, fresh: 0 });
    const r = pickRotation([m("a", 2 * DAY), m("b", 3 * DAY)], now, 1);
    expect(r.slice.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("soldWindowDays", () => {
  it("is 0 for a model never pulled, so the caller uses its first-build window", () => {
    expect(soldWindowDays(null, now, 14)).toBe(0);
  });
  it("covers the gap plus a day, at least the interval plus one, at most 60", () => {
    expect(soldWindowDays(ago(3 * DAY), now, 14)).toBe(15);
    expect(soldWindowDays(ago(20 * DAY), now, 14)).toBe(21);
    expect(soldWindowDays(ago(90 * DAY), now, 14)).toBe(60);
  });
});
