import { describe, expect, it } from "vitest";
import { timeLeft } from "@/components/listings/listing-card";

const now = Date.parse("2026-09-27T12:00:00Z");
const at = (ms: number) => new Date(now + ms);

describe("timeLeft", () => {
  it("counts days and hours beyond a day", () => {
    expect(timeLeft(at(2 * 86_400_000 + 4 * 3_600_000 + 5_000), now)).toBe("2d 4h left");
  });
  it("counts hours and minutes beyond an hour", () => {
    expect(timeLeft(at(3 * 3_600_000 + 12 * 60_000), now)).toBe("3h 12m left");
  });
  it("counts minutes and seconds inside the hour", () => {
    expect(timeLeft(at(4 * 60_000 + 9_000), now)).toBe("4m 09s left");
    expect(timeLeft(at(60_000), now)).toBe("1m 00s left");
  });
  it("counts seconds inside the minute and ends at zero", () => {
    expect(timeLeft(at(42_000), now)).toBe("42s left");
    expect(timeLeft(at(0), now)).toBe("Ended");
    expect(timeLeft(at(-5_000), now)).toBe("Ended");
    expect(timeLeft(null, now)).toBeNull();
  });
});
