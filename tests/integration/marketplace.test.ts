import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

/**
 * Runs against a real Postgres (CI applies migrations first). Exercises the
 * same core functions the server actions call, with the DB module swapped
 * for a direct connection so no Next.js runtime is needed.
 */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("marketplace core", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 2 });
  const db = drizzle(sql, { schema });
  const ids = { seller: "", buyer: "", outsider: "", network: "", listing: "", auction: "" };

  beforeAll(async () => {
    const mk = async (email: string) =>
      (
        await db
          .insert(schema.users)
          .values({ email: `${Date.now()}-${email}`, name: email })
          .returning()
      )[0].id;
    ids.seller = await mk("seller@test");
    ids.buyer = await mk("buyer@test");
    ids.outsider = await mk("outsider@test");
    const [net] = await db
      .insert(schema.networks)
      .values({ ownerId: ids.seller, name: "Test net", slug: `test-net-${Date.now()}` })
      .returning();
    ids.network = net.id;
    await db
      .insert(schema.networkMembers)
      .values({ networkId: net.id, userId: ids.seller, role: "owner" });
    const base = {
      sellerId: ids.seller,
      make: "Porsche",
      model: "911 GT3 RS",
      year: 2025,
      miles: 1500,
      title: "Test car",
    } as const;
    ids.listing = (
      await db
        .insert(schema.listings)
        .values({
          ...base,
          type: "private",
          status: "active",
          networkId: net.id,
          askingPrice: 500000,
        })
        .returning()
    )[0].id;
    ids.auction = (
      await db
        .insert(schema.listings)
        .values({
          ...base,
          type: "auction",
          status: "active",
          auctionEndsAt: new Date(Date.now() + 86_400_000),
        })
        .returning()
    )[0].id;
  });

  afterAll(async () => {
    for (const id of [ids.seller, ids.buyer, ids.outsider])
      if (id) await db.delete(schema.users).where(eq(schema.users.id, id));
    await sql.end();
  });

  it("hides private listings from non-members and shows them to members", async () => {
    // Mock the app db with this connection for the query module.
    const { listActiveListings } = await loadQueries(db);
    const outsider = await listActiveListings(ids.outsider, {});
    expect(outsider.rows.some((r) => r.id === ids.listing)).toBe(false);
    const anon = await listActiveListings(null, {});
    expect(anon.rows.some((r) => r.id === ids.listing)).toBe(false);
    await db
      .insert(schema.networkMembers)
      .values({ networkId: ids.network, userId: ids.buyer, role: "member" });
    const member = await listActiveListings(ids.buyer, {});
    expect(member.rows.some((r) => r.id === ids.listing)).toBe(true);
  });

  it("enforces bid rules: no self-bids, minimum increment, serialized", async () => {
    const { placeBid } = await loadQueries(db);
    const own = await placeBid(ids.auction, 1000, ids.seller);
    expect(own).toMatchObject({ ok: false, error: "You cannot bid on your own car." });
    const first = await placeBid(ids.auction, 100000, ids.buyer);
    expect(first.ok).toBe(true);
    const tooLow = await placeBid(ids.auction, 100500, ids.outsider); // 1% of 100k = 1,000 minimum increment
    expect(tooLow.ok).toBe(false);
    const ok = await placeBid(ids.auction, 101000, ids.outsider);
    expect(ok.ok).toBe(true);
    // concurrent bids at the same amount: exactly one may win
    const results = await Promise.all([
      placeBid(ids.auction, 105000, ids.buyer),
      placeBid(ids.auction, 105000, ids.outsider),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("invite tokens are single use and expire", async () => {
    const { acceptInvite, hashToken } = await loadNetworkQueries(db);
    const token = "test-token-" + Date.now().toString(36) + "-abcdefghij";
    await db.insert(schema.networkInvites).values({
      networkId: ids.network,
      invitedBy: ids.seller,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const first = await acceptInvite(token, ids.outsider);
    expect(first.ok).toBe(true);
    const second = await acceptInvite(token, ids.buyer);
    expect(second.ok).toBe(false);
    const expired = "expired-token-" + Date.now().toString(36) + "-abcdefghij";
    await db.insert(schema.networkInvites).values({
      networkId: ids.network,
      invitedBy: ids.seller,
      tokenHash: hashToken(expired),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect((await acceptInvite(expired, ids.buyer)).ok).toBe(false);
  });
});

async function loadQueries(db: unknown) {
  const { vi } = await import("vitest");
  vi.doMock("server-only", () => ({}));
  vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));
  vi.doMock("@/db", () => ({ db }));
  return import("@/server/queries/listings");
}
async function loadNetworkQueries(db: unknown) {
  const { vi } = await import("vitest");
  vi.doMock("server-only", () => ({}));
  vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));
  vi.doMock("@/db", () => ({ db }));
  return import("@/server/queries/networks");
}
