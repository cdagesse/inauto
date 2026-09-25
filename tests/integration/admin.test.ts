import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

/** Admin core against a real Postgres (CI applies migrations first). */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("admin core", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 2 });
  const db = drizzle(sql, { schema });
  const ids = { admin: "", seller: "", otherAdmin: "", listing: "", order: "" };
  const stamp = Date.now();

  beforeAll(async () => {
    const mk = async (email: string, role: "user" | "admin") =>
      (
        await db
          .insert(schema.users)
          .values({ email: `${stamp}-${email}`, name: email, role })
          .returning()
      )[0].id;
    ids.admin = await mk("admin@test", "admin");
    ids.otherAdmin = await mk("admin2@test", "admin");
    ids.seller = await mk("seller@test", "user");
    ids.listing = (
      await db
        .insert(schema.listings)
        .values({
          sellerId: ids.seller,
          type: "classified",
          status: "active",
          make: "Porsche",
          model: "911 GT3 RS",
          year: 2025,
          miles: 1200,
          title: "Admin test car",
          askingPrice: 480000,
          vin: "WP0AF2A9XPS000001",
        })
        .returning()
    )[0].id;
    ids.order = (
      await db
        .insert(schema.serviceOrders)
        .values({ userId: ids.seller, kind: "title_vetting", listingId: ids.listing })
        .returning()
    )[0].id;
  });

  afterAll(async () => {
    // admin_action.admin_id is NOT NULL, so audit rows must go before their admin.
    for (const id of [ids.admin, ids.otherAdmin])
      if (id) await db.delete(schema.adminActions).where(eq(schema.adminActions.adminId, id));
    for (const id of [ids.seller, ids.admin, ids.otherAdmin])
      if (id) await db.delete(schema.users).where(eq(schema.users.id, id));
    await sql.end();
  });

  it("marks a title vetted and flags the listing in one transaction", async () => {
    const { completeServiceOrder } = await loadVetting(db);
    const r = await completeServiceOrder(ids.admin, ids.order, "Clean title confirmed", null);
    expect(r.ok).toBe(true);
    const [l] = await db.select().from(schema.listings).where(eq(schema.listings.id, ids.listing));
    expect(l.titleVetted).toBe(true);
    const again = await completeServiceOrder(ids.admin, ids.order, null, null);
    expect(again.ok).toBe(false);
  });

  it("refuses to block another admin", async () => {
    const { setUserStatus } = await loadUsers(db);
    const r = await setUserStatus(ids.admin, ids.otherAdmin, "blocked", "test");
    expect(r).toMatchObject({ ok: false });
  });

  it("blocking a user withdraws their listings, hides them publicly, and writes an audit row", async () => {
    const { setUserStatus } = await loadUsers(db);
    const { listActiveListings } = await loadListings(db);
    const before = await listActiveListings(null, {});
    expect(before.rows.some((r) => r.id === ids.listing)).toBe(true);

    const r = await setUserStatus(ids.admin, ids.seller, "blocked", "Fraudulent listing");
    expect(r.ok).toBe(true);

    const [l] = await db.select().from(schema.listings).where(eq(schema.listings.id, ids.listing));
    expect(l.status).toBe("withdrawn");
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, ids.seller));
    expect(u.status).toBe("blocked");
    expect(u.statusReason).toBe("Fraudulent listing");

    const after = await listActiveListings(null, {});
    expect(after.rows.some((x) => x.id === ids.listing)).toBe(false);

    const audit = await db
      .select()
      .from(schema.adminActions)
      .where(
        and(
          eq(schema.adminActions.targetId, ids.seller),
          eq(schema.adminActions.action, "user.status.blocked"),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0].adminId).toBe(ids.admin);
    expect((audit[0].details as { withdrawnListings: number }).withdrawnListings).toBe(1);
  });

  it("a disabled seller's still-active listing is hidden from the public feed", async () => {
    const { setUserStatus } = await loadUsers(db);
    const { listActiveListings } = await loadListings(db);
    // reactivate, re-list, then disable (disable does not withdraw; visibility must still hide it)
    expect((await setUserStatus(ids.admin, ids.seller, "active", "test")).ok).toBe(true);
    await db
      .update(schema.listings)
      .set({ status: "active" })
      .where(eq(schema.listings.id, ids.listing));
    expect((await listActiveListings(null, {})).rows.some((x) => x.id === ids.listing)).toBe(true);
    expect((await setUserStatus(ids.admin, ids.seller, "disabled", "test")).ok).toBe(true);
    expect((await listActiveListings(null, {})).rows.some((x) => x.id === ids.listing)).toBe(false);
    // the seller still sees their own listing
    expect((await listActiveListings(ids.seller, {})).rows.some((x) => x.id === ids.listing)).toBe(
      true,
    );
  });
});

async function mockDb(db: unknown) {
  const { vi } = await import("vitest");
  vi.doMock("server-only", () => ({}));
  vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));
  vi.doMock("@/db", () => ({ db }));
}
async function loadVetting(db: unknown) {
  await mockDb(db);
  return import("@/server/admin/core/vetting");
}
async function loadUsers(db: unknown) {
  await mockDb(db);
  return import("@/server/admin/core/users");
}
async function loadListings(db: unknown) {
  await mockDb(db);
  return import("@/server/queries/listings");
}
