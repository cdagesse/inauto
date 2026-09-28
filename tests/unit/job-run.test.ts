import { describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { recordRun } from "@/jobs/lib/run";

interface Patch {
  ok?: boolean;
  changed?: number;
  summary?: unknown;
  error?: string | null;
  finishedAt?: Date;
}

/** Just enough of the drizzle chain for insert().values().returning() and update().set().where(). */
function fakeDb(opts: { insertFails?: boolean; updateFails?: boolean } = {}) {
  const inserted: { name: string; dryRun: boolean }[] = [];
  const patches: Patch[] = [];
  const db = {
    insert: () => ({
      values: (v: { name: string; dryRun: boolean }) => ({
        returning: async () => {
          if (opts.insertFails) throw new Error("insert down");
          inserted.push(v);
          return [{ id: "run-1" }];
        },
      }),
    }),
    update: () => ({
      set: (p: Patch) => ({
        where: async () => {
          if (opts.updateFails) throw new Error("update down");
          patches.push(p);
        },
      }),
    }),
  } as unknown as Db;
  return { db, inserted, patches };
}

describe("recordRun", () => {
  it("records a start row, then ok, changed, summary and error at the end", async () => {
    const { db, inserted, patches } = fakeDb();
    const logs: string[] = [];
    const out = await recordRun(
      db,
      "close-auctions",
      { dryRun: false, log: (m) => logs.push(m) },
      async () => ({ closed: 2 }),
      (r) => ({ ok: true, changed: r.closed, summary: r }),
    );
    expect(out).toEqual({ closed: 2 });
    expect(inserted).toEqual([{ name: "close-auctions", dryRun: false }]);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ ok: true, changed: 2, summary: { closed: 2 }, error: null });
    expect(patches[0]?.finishedAt).toBeInstanceOf(Date);
    expect(logs).toEqual([]);
  });

  it("marks the row failed with the message and rethrows when the job throws", async () => {
    const { db, patches } = fakeDb();
    await expect(
      recordRun(
        db,
        "reports",
        { dryRun: true, log: () => {} },
        async () => {
          throw new Error("queue exploded");
        },
        () => ({ ok: true, changed: 0, summary: null }),
      ),
    ).rejects.toThrow("queue exploded");
    expect(patches).toEqual([
      expect.objectContaining({ ok: false, changed: 0, error: "queue exploded" }),
    ]);
  });

  it("still runs the job when the run row cannot be written", async () => {
    const { db, patches } = fakeDb({ insertFails: true });
    const logs: string[] = [];
    const out = await recordRun(
      db,
      "snapshots",
      { dryRun: false, log: (m) => logs.push(m) },
      async () => "built",
      () => ({ ok: true, changed: 1, summary: {} }),
    );
    expect(out).toBe("built");
    expect(patches).toEqual([]);
    expect(logs).toEqual(["job_run insert failed: insert down"]);
  });

  it("logs and swallows a failed finish write", async () => {
    const { db } = fakeDb({ updateFails: true });
    const logs: string[] = [];
    await expect(
      recordRun(
        db,
        "x",
        { dryRun: false, log: (m) => logs.push(m) },
        async () => 1,
        () => ({
          ok: false,
          changed: 0,
          summary: {},
          error: "bad",
        }),
      ),
    ).resolves.toBe(1);
    expect(logs).toEqual(["job_run update failed: update down"]);
  });
});
