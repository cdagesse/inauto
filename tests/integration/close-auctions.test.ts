import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { closeEndedAuctions } from "@/jobs/close-auctions";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("closeEndedAuctions", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  const ids = { seller: "", buyer: "", met: "", notMet: "", noBids: "", future: "", done: "" };
  const past = new Date(Date.now() - 60_000);

  beforeAll(async () => {
    const mk = async (email: string) =>
      (
        await db
          .insert(schema.users)
          .values({ email: `${Date.now()}-${email}`, name: email })
          .returning()
      )[0].id;
    ids.seller = await mk("close-seller@test");
    ids.buyer = await mk("close-buyer@test");
    const base = {
      sellerId: ids.seller,
      make: "Porsche",
      model: "911 GT3 RS",
      year: 2025,
      miles: 1500,
      title: "Close test",
      type: "auction" as const,
    };
    const ins = async (v: Partial<typeof schema.listings.$inferInsert>) =>
      (
        await db
          .insert(schema.listings)
          .values({ ...base, ...v })
          .returning()
      )[0].id;
    ids.met = await ins({ status: "active", auctionEndsAt: past, reservePrice: 100_000 });
    ids.notMet = await ins({ status: "active", auctionEndsAt: past, reservePrice: 500_000 });
    ids.noBids = await ins({ status: "active", auctionEndsAt: past, reservePrice: null });
    ids.future = await ins({ status: "active", auctionEndsAt: new Date(Date.now() + 3_600_000) });
    ids.done = await ins({ status: "withdrawn", auctionEndsAt: past });
    await db.insert(schema.bids).values([
      { listingId: ids.met, bidderId: ids.buyer, amount: 90_000 },
      { listingId: ids.met, bidderId: ids.buyer, amount: 120_000 },
      { listingId: ids.notMet, bidderId: ids.buyer, amount: 200_000 },
    ]);
  });

  afterAll(async () => {
    for (const id of [ids.seller, ids.buyer])
      if (id) await db.delete(schema.users).where(eq(schema.users.id, id));
    await sql.end();
  });

  it("closes due auctions with the right outcome and is idempotent", async () => {
    const first = await closeEndedAuctions({ db: db as never });
    const mine = first.ids.filter((x) => Object.values(ids).includes(x.id));
    expect(mine.find((x) => x.id === ids.met)?.outcome).toBe("sold");
    expect(mine.find((x) => x.id === ids.notMet)?.outcome).toBe("ended");
    expect(mine.find((x) => x.id === ids.noBids)?.outcome).toBe("ended");
    expect(mine.some((x) => x.id === ids.future)).toBe(false);
    expect(mine.some((x) => x.id === ids.done)).toBe(false);

    const [met] = await db.select().from(schema.listings).where(eq(schema.listings.id, ids.met));
    expect(met.status).toBe("sold");
    expect(met.soldPrice).toBe(120_000);
    expect(met.closedAt).not.toBeNull();
    const [win] = await db.select().from(schema.bids).where(eq(schema.bids.id, met.winningBidId!));
    expect(win.amount).toBe(120_000);
    expect(win.bidderId).toBe(ids.buyer);

    const [notMet] = await db
      .select()
      .from(schema.listings)
      .where(eq(schema.listings.id, ids.notMet));
    expect(notMet.status).toBe("ended");
    expect(notMet.winningBidId).toBeNull();

    const [done] = await db.select().from(schema.listings).where(eq(schema.listings.id, ids.done));
    expect(done.status).toBe("withdrawn");

    const second = await closeEndedAuctions({ db: db as never });
    expect(second.ids.some((x) => Object.values(ids).includes(x.id))).toBe(false);
  });
});
