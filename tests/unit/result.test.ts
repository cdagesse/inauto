import { afterEach, describe, expect, it, vi } from "vitest";
import { soft } from "@/server/result";

describe("soft", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the fallback and logs the labelled error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("connection refused");
    const rows = await Promise.reject<string[]>(boom).catch(soft("home featured", []));
    expect(rows).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[soft] home featured", boom);
  });

  it("passes a resolved value through untouched", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const value = await Promise.resolve({ rows: [1], nextCursor: null }).catch(
      soft("home external", { rows: [], nextCursor: null }),
    );
    expect(value).toEqual({ rows: [1], nextCursor: null });
    expect(log).not.toHaveBeenCalled();
  });

  it("keeps the fallback identity so null and object fallbacks work", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const obj = { a: 1 };
    expect(soft("x", null)("err")).toBeNull();
    expect(soft("x", obj)("err")).toBe(obj);
    expect(log).toHaveBeenCalledTimes(2);
  });
});
