import "server-only";
import { and, desc, eq, gte, ilike, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  bids,
  generations,
  listings,
  makes,
  models,
  networkMembers,
  networks,
  serviceOrders,
  users,
} from "@/db/schema";
import { type ListingFilter, minimumIncrement, PAGE_SIZE } from "../listings-schema";
import { type ActionResult, fail, toError } from "../result";

const escapeLike = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`);

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

/**
 * Visibility predicate: public types, plus private listings in networks the
 * viewer belongs to. Listings from sellers whose account is not active
 * (disabled or blocked by an admin) are hidden from everyone but the seller.
 */
function visibleTo(viewerId: string | null) {
  const activeSellers = db.select({ id: users.id }).from(users).where(eq(users.status, "active"));
  if (!viewerId)
    return and(ne(listings.type, "private"), inArray(listings.sellerId, activeSellers));
  const memberOf = db
    .select({ id: networkMembers.networkId })
    .from(networkMembers)
    .where(eq(networkMembers.userId, viewerId));
  return or(
    eq(listings.sellerId, viewerId),
    and(
      inArray(listings.sellerId, activeSellers),
      or(ne(listings.type, "private"), inArray(listings.networkId, memberOf)),
    ),
  );
}

export async function listActiveListings(
  viewerId: string | null,
  filter: ListingFilter,
  limit: number = PAGE_SIZE,
) {
  const size = Math.max(1, Math.min(limit, PAGE_SIZE));
  const cur = decodeCursor(filter.cursor);
  const past = filter.when === "past";
  const statusCond = !past
    ? eq(listings.status, "active")
    : filter.result === "sold"
      ? eq(listings.status, "sold")
      : filter.result === "unsold"
        ? inArray(listings.status, ["ended", "withdrawn"])
        : inArray(listings.status, ["sold", "ended", "withdrawn"]);
  const conds = [statusCond, visibleTo(viewerId)];
  if (filter.type) conds.push(eq(listings.type, filter.type));
  if (filter.make) conds.push(sql`lower(${listings.make}) = ${filter.make.toLowerCase()}`);
  if (filter.model) conds.push(ilike(listings.model, `%${escapeLike(filter.model)}%`));
  if (filter.trim)
    conds.push(
      or(
        ilike(listings.trim, `%${escapeLike(filter.trim)}%`),
        ilike(listings.title, `%${escapeLike(filter.trim)}%`),
      )!,
    );
  if (filter.yearMin != null) conds.push(gte(listings.year, filter.yearMin));
  if (filter.yearMax != null) conds.push(lte(listings.year, filter.yearMax));
  if (filter.milesMin != null) conds.push(gte(listings.miles, filter.milesMin));
  if (filter.milesMax != null) conds.push(lte(listings.miles, filter.milesMax));
  // Price: the asking price, or for auctions the current high bid.
  const priceExpr = sql<
    number | null
  >`coalesce(${listings.askingPrice}, (select max(${bids.amount}) from ${bids} where ${bids.listingId} = ${listings.id}))`;
  if (filter.priceMin != null) conds.push(sql`${priceExpr} >= ${filter.priceMin}`);
  if (filter.priceMax != null) conds.push(sql`${priceExpr} <= ${filter.priceMax}`);
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
      status: listings.status,
      soldPrice: listings.soldPrice,
      highBid: sql<
        number | null
      >`(select max(${bids.amount}) from ${bids} where ${bids.listingId} = ${listings.id})`,
    })
    .from(listings)
    .where(and(...conds))
    .orderBy(desc(listings.createdAt), desc(listings.id))
    .limit(size + 1);
  const hasMore = rows.length > size;
  const page = hasMore ? rows.slice(0, size) : rows;
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
      makeSlug: makes.slug,
      modelSlug: models.slug,
      modelName: models.name,
      generationCode: generations.code,
      reportStatus: models.reportStatus,
      reportError: models.reportError,
    })
    .from(listings)
    .innerJoin(users, eq(users.id, listings.sellerId))
    .leftJoin(networks, eq(networks.id, listings.networkId))
    .leftJoin(models, eq(models.id, listings.modelId))
    .leftJoin(makes, eq(makes.id, models.makeId))
    .leftJoin(generations, eq(generations.id, listings.generationId))
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
    /** Full VIN for server-side lookups only (history timeline); never render it. */
    historyVin: l.vin,
    sellerName: row.sellerName,
    networkName: row.networkName,
    networkSlug: row.networkSlug,
    /** Catalog model the seller's car was matched to at listing time, if any. */
    market:
      row.makeSlug && row.modelSlug && row.modelName && row.reportStatus
        ? {
            makeSlug: row.makeSlug,
            modelSlug: row.modelSlug,
            modelName: row.modelName,
            generationCode: row.generationCode ?? null,
            reportStatus: row.reportStatus,
            reportError: row.reportError ?? null,
          }
        : null,
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
  const rows = await db
    .select({
      listing: listings,
      bidCount: sql<number>`(select count(*) from ${bids} where ${bids.listingId} = ${listings.id})::int`,
    })
    .from(listings)
    .where(eq(listings.sellerId, userId))
    .orderBy(desc(listings.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r.listing, hasBids: Number(r.bidCount) > 0 }));
}

/** Latest completed title check on a listing, for the buyer who ordered it or the listing owner. */
export async function getTitleCheckForViewer(listingId: string, viewerId: string | null) {
  if (!viewerId || !/^[0-9a-f-]{36}$/.test(listingId)) return null;
  const [row] = await db
    .select({
      result: serviceOrders.result,
      reviewedAt: serviceOrders.reviewedAt,
      userId: serviceOrders.userId,
    })
    .from(serviceOrders)
    .innerJoin(listings, eq(listings.id, serviceOrders.listingId))
    .where(
      and(
        eq(serviceOrders.listingId, listingId),
        eq(serviceOrders.kind, "title_vetting"),
        sql`${serviceOrders.status} in ('complete', 'in_progress')`,
        sql`(${serviceOrders.result}->'summary' is not null or ${serviceOrders.result}->'mvr' is not null)`,
        or(eq(serviceOrders.userId, viewerId), eq(listings.sellerId, viewerId)),
      ),
    )
    .orderBy(desc(serviceOrders.reviewedAt))
    .limit(1);
  if (!row) return null;
  const r = row.result as { summary?: unknown; mvr?: unknown } | null;
  const summary = (r?.summary as import("@/lib/sources/vitu").TitleSummary | undefined) ?? null;
  const mvr = (r?.mvr as import("@/lib/sources/vitu-mvr").MvrSummary | undefined) ?? null;
  return summary || mvr ? { summary, mvr, reviewedAt: row.reviewedAt } : null;
}
