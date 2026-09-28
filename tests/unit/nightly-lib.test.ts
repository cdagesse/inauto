import { describe, expect, it } from "vitest";
import { groupReclassified, RECLASSIFY_CHUNK } from "@/jobs/lib/clean";
import {
  pruneInBatches,
  RETENTION_BATCH,
  RETENTION_DAYS,
  RETENTION_MAX_BATCHES,
} from "@/jobs/lib/retention";

describe("groupReclassified", () => {
  it("groups only changed rows, one group per new reason", () => {
    const groups = groupReclassified([
      { id: "a", before: null, after: "outlier_price" },
      { id: "b", before: "incomplete", after: "incomplete" }, // unchanged
      { id: "c", before: "outlier_price", after: null },
      { id: "d", before: null, after: "outlier_price" },
      { id: "e", before: "manual", after: "manual" }, // unchanged
      { id: "f", before: "incomplete", after: null },
    ]);
    expect(groups).toEqual([
      { reason: "outlier_price", ids: ["a", "d"] },
      { reason: null, ids: ["c", "f"] },
    ]);
  });

  it("returns nothing when no row changed, so no empty inArray is ever built", () => {
    expect(groupReclassified([])).toEqual([]);
    expect(groupReclassified([{ id: "a", before: null, after: null }])).toEqual([]);
    for (const g of groupReclassified([{ id: "a", before: null, after: "incomplete" }]))
      expect(g.ids.length).toBeGreaterThan(0);
  });

  it("splits long id lists into bounded chunks", () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({
      id: `r${i}`,
      before: null,
      after: "incomplete" as const,
    }));
    const groups = groupReclassified(rows);
    expect(groups.map((g) => g.ids.length)).toEqual([RECLASSIFY_CHUNK, RECLASSIFY_CHUNK, 500]);
    expect(groups.flatMap((g) => g.ids)).toEqual(rows.map((r) => r.id));
    expect(groupReclassified(rows, 0).map((g) => g.ids.length)).toHaveLength(2500);
  });
});

describe("pruneInBatches", () => {
  it("keeps deleting full batches and stops on a short one", async () => {
    const seen: number[] = [];
    let left = 12;
    const total = await pruneInBatches(
      async (limit) => {
        seen.push(limit);
        const n = Math.min(limit, left);
        left -= n;
        return n;
      },
      { batch: 5 },
    );
    expect(total).toBe(12);
    expect(seen).toEqual([5, 5, 5]);
    expect(left).toBe(0);
  });

  it("stops after one call when there is nothing to delete", async () => {
    let calls = 0;
    const total = await pruneInBatches(async () => {
      calls++;
      return 0;
    });
    expect(total).toBe(0);
    expect(calls).toBe(1);
  });

  it("caps the number of batches per run so a backlog drains over several nights", async () => {
    let calls = 0;
    const total = await pruneInBatches(
      async (limit) => {
        calls++;
        return limit;
      },
      { batch: 100, maxBatches: 3 },
    );
    expect(calls).toBe(3);
    expect(total).toBe(300);
  });

  it("propagates a database error to the caller", async () => {
    await expect(
      pruneInBatches(async () => {
        throw new Error("permission denied");
      }),
    ).rejects.toThrow("permission denied");
  });

  it("uses sensible defaults", () => {
    expect(RETENTION_BATCH).toBe(5000);
    expect(RETENTION_MAX_BATCHES).toBeGreaterThan(0);
    expect(RETENTION_DAYS).toEqual({ rawFetch: 30, carView: 90, jobRun: 90 });
  });
});
