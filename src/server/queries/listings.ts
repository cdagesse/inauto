import "server-only";
import { and, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { bids, listings, networkMembers, networks, users } from "@/db/schema";
import { type ListingFilter, minimumIncrement, PAGE_SIZE } from "../listings-schema";
import { type ActionResult, fail, toError } from "../result";

/** Places a bid. Runs in a transaction with the listing row locked so concurrent bids serialize. */
export async function placeBid(
  listingId: string,
  amount: number,
  bidderId: string,
): Promise<ActionResult<{ amount: number }>> {
  try {
    const parsed = z
      .object({ listingId: z.string().uuid(), amount: z.number().int().min(100).max(100_000_000) })
      .safeParse({ listingId, amount });
    if (!parsed.success) return fail("Enter a valid bid amount.");
    const outcome = await db.transaction(async (tx) => {
      const [l] = await tx
        .select({
          id: listings.id,
          sellerId: listings.sellerId,
          type: listings.type,
          status: listings.status,
          endsAt: listings.auctionEndsAt,
        })
        .from(listings)
        .where(eq(listings.id, parsed.data.listingId))
        .for("update");
      if (!l || l.type !== "auction" || l.status !== "active")
        return "This auction is not open for bids.";
      if (l.endsAt && l.endsAt.getTime() <= Date.now()) return "This auction has ended.";
      if (l.sellerId === bidderId) return "You cannot bid on your own car.";
      const [top] = await tx
        .select({ amount: bids.amount })
        .from(bids)
        .where(eq(bids.listingId, l.id))
        .orderBy(desc(bids.amount))
        .limit(1);
      const current = top?.amount ?? 0;
      const min = current > 0 ? current + minimumIncrement(current) : 100;
      if (parsed.data.amount < min) return `Bid must be at least $${min.toLocaleString("en-US")}.`;
      await tx.insert(bids).values({ listingId: l.id, bidderId, amount: parsed.data.amount });
      return null;
    });
    if (outcome) return fail(outcome);
    revalidatePath(`/listings/${listingId}`);
    return { ok: true, data: { amount: parsed.data.amount } };
  } catch (e) {
    return toError(e);
  }
}

/* ---------------- reads ---------------- */

function decodeCursor(c?: string): { createdAt: Date; id: string } | null {
  if (!c) return null;
  try {
    const [ts, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
    const d = new Date(ts);
    if (Number.isNaN(d.getTime()) || !/^[0-9a-f-]{36}$/.test(id)) return null;
    return { createdAt: d, id };
  } catch {
    return null;
  }
}
function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url");
}

/** Visibility predicate: public types, plus private listings in networks the viewer belongs to. */
function visibleTo(viewerId: string | null) {
  if (!viewerId) return ne(listings.type, "private");
  const memberOf = db
    .select({ id: networkMembers.networkId })
    .from(networkMembers)
    .where(eq(networkMembers.userId, viewerId));
  return or(
    ne(listings.type, "private"),
    inArray(listings.networkId, memberOf),
    eq(listings.sellerId, viewerId),
  );
}

export async function listActiveListings(viewerId: string | null, filter: ListingFilter) {
  const cur = decodeCursor(filter.cursor);
  const conds = [eq(listings.status, "active"), visibleTo(viewerId)];
  if (filter.type) conds.push(eq(listings.type, filter.type));
  if (filter.make) conds.push(sql`lower(${listings.make}) = ${filter.make.toLowerCase()}`);
  if (cur)
    conds.push(
      or(
        lt(listings.createdAt, cur.createdAt),
        and(eq(listings.createdAt, cur.createdAt), lt(listings.id, cur.id)),
      )!,
    );
  const rows = await db
    .select({
      id: listings.id,
      type: listings.type,
      title: listings.title,
      make: listings.make,
      model: listings.model,
      year: listings.year,
      miles: listings.miles,
      askingPrice: listings.askingPrice,
      photos: listings.photos,
      location: listings.location,
      auctionEndsAt: listings.auctionEndsAt,
      createdAt: listings.createdAt,
      titleVetted: listings.titleVetted,
      highBid: sql<
        number | null
      >`(select max(${bids.amount}) from ${bids} where ${bids.listingId} = ${listings.id})`,
    })
    .from(listings)
    .where(and(...conds))
    .orderBy(desc(listings.createdAt), desc(listings.id))
    .limit(PAGE_SIZE + 1);
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page[page.length - 1];
  return { rows: page, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

/** Full listing for a viewer, or null when it does not exist or is not visible to them. */
export async function getListingForViewer(id: string, viewerId: string | null) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db
    .select({
      listing: listings,
      sellerName: users.name,
      networkName: networks.name,
      networkSlug: networks.slug,
    })
    .from(listings)
    .innerJoin(users, eq(users.id, listings.sellerId))
    .leftJoin(networks, eq(networks.id, listings.networkId))
    .where(and(eq(listings.id, id), visibleTo(viewerId)))
    .limit(1);
  if (!row) return null;
  const isOwner = viewerId === row.listing.sellerId;
  const now = Date.now();
  if (row.listing.status === "draft" && !isOwner) return null;
  const bidRows = await db
    .select({ amount: bids.amount, createdAt: bids.createdAt, bidderId: bids.bidderId })
    .from(bids)
    .where(eq(bids.listingId, id))
    .orderBy(desc(bids.amount))
    .limit(10);
  const l = row.listing;
  // VIN privacy: full VIN only for the owner or once the title has been vetted.
  const vin = l.vin ? (isOwner || l.titleVetted ? l.vin : `…${l.vin.slice(-6)}`) : null;
  return {
    ...l,
    vin,
    sellerName: row.sellerName,
    networkName: row.networkName,
    networkSlug: row.networkSlug,
    isOwner,
    ended: l.type === "auction" && l.auctionEndsAt ? l.auctionEndsAt.getTime() <= now : false,
    bids: bidRows.map((b) => ({
      amount: b.amount,
      createdAt: b.createdAt,
      mine: b.bidderId === viewerId,
    })),
    highBid: bidRows[0]?.amount ?? null,
  };
}

export async function listMyListings(userId: string) {
  return db
    .select()
    .from(listings)
    .where(eq(listings.sellerId, userId))
    .orderBy(desc(listings.createdAt))
    .limit(100);
}
