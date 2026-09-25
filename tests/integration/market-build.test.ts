import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

/**
 * Runs against a real Postgres after `pnpm db:migrate && pnpm db:seed`.
 * The `@/db` module is swapped for a direct connection so no Next.js runtime
 * (and no `server-only`) is needed.
 */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("market snapshot from the database", () => {
  it("loads the seeded GT3 RS rows and builds a snapshot", async () => {
    const sql = postgres(url ?? "postgres://invalid", { max: 1 });
    const db = drizzle(sql, { schema });
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/db", () => ({ db }));
    const { loadSnapshotInput } = await import("@/lib/market/queries");
    const { buildSnapshot } = await import("@/lib/market/build");
    try {
      const input = await loadSnapshotInput("porsche", "911-gt3-rs");
      expect(input).not.toBeNull();
      expect(input!.generations).toHaveLength(5);
      expect(input!.dealerSales.length).toBeGreaterThan(400);
      expect(input!.auctions.length).toBeGreaterThanOrEqual(18); // seed has 18; live pulls add more
      expect(input!.dealerActive.length).toBeGreaterThan(100);
      const snap = buildSnapshot(input!);
      expect(snap.generations["992"].median).toBeGreaterThan(400_000);
      expect(snap.chartSeries).toEqual(["992", "991.2", "991.1"]);
      expect(await loadSnapshotInput("porsche", "does-not-exist")).toBeNull();
    } finally {
      await sql.end();
    }
  });
});
