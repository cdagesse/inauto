import "server-only";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { inquiries, listings, purchases, users } from "@/db/schema";

const isUuid = (s: string) => /^[0-9a-f-]{36}$/.test(s);

/** A purchase with its listing and both parties, only for the buyer or the seller. */
export async function getPurchaseForViewer(id: string, viewerId: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      purchase: purchases,
      listing: {
        id: listings.id,
        title: listings.title,
        year: listings.year,
        make: listings.make,
        model: listings.model,
        trim: listings.trim,
        vin: listings.vin,
        miles: listings.miles,
        color: listings.color,
        photos: listings.photos,
        location: listings.location,
        sellerDetails: listings.sellerDetails,
        status: listings.status,
      },
      buyerName: sql<
        string | null
      >`(select name from ${users} where ${users.id} = ${purchases.buyerId})`,
      sellerName: sql<
        string | null
      >`(select name from ${users} where ${users.id} = ${purchases.sellerId})`,
      sellerEmail: sql<
        string | null
      >`(select email from ${users} where ${users.id} = ${purchases.sellerId})`,
    })
    .from(purchases)
    .innerJoin(listings, eq(listings.id, purchases.listingId))
    .where(
      and(
        eq(purchases.id, id),
        or(eq(purchases.buyerId, viewerId), eq(purchases.sellerId, viewerId)),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    role: row.purchase.buyerId === viewerId ? ("buyer" as const) : ("seller" as const),
  };
}

/** Requests to buy the user's listings, newest first. */
export async function listPurchaseRequestsForSeller(sellerId: string) {
  return db
    .select({
      id: purchases.id,
      listingId: purchases.listingId,
      title: listings.title,
      status: purchases.status,
      mode: purchases.mode,
      price: purchases.price,
      buyerName: sql<string>`${purchases.buyer}->>'legalName'`,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .innerJoin(listings, eq(listings.id, purchases.listingId))
    .where(eq(purchases.sellerId, sellerId))
    .orderBy(desc(purchases.createdAt))
    .limit(100);
}

/** The user's own purchase requests, newest first. */
export async function listPurchasesForBuyer(buyerId: string) {
  return db
    .select({
      id: purchases.id,
      listingId: purchases.listingId,
      title: listings.title,
      status: purchases.status,
      mode: purchases.mode,
      price: purchases.price,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .innerJoin(listings, eq(listings.id, purchases.listingId))
    .where(eq(purchases.buyerId, buyerId))
    .orderBy(desc(purchases.createdAt))
    .limit(100);
}

/** Questions buyers sent about the user's listings, newest first. */
export async function listInquiriesForSeller(sellerId: string) {
  return db
    .select({
      id: inquiries.id,
      listingId: inquiries.listingId,
      title: listings.title,
      message: inquiries.message,
      contact: inquiries.contact,
      buyerName: users.name,
      buyerEmail: users.email,
      readAt: inquiries.readAt,
      createdAt: inquiries.createdAt,
    })
    .from(inquiries)
    .innerJoin(listings, eq(listings.id, inquiries.listingId))
    .innerJoin(users, eq(users.id, inquiries.buyerId))
    .where(eq(inquiries.sellerId, sellerId))
    .orderBy(desc(inquiries.createdAt))
    .limit(100);
}

/** Counts for the owner bar. */
export async function countOpenForListing(listingId: string) {
  const [p] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchases)
    .where(and(eq(purchases.listingId, listingId), eq(purchases.status, "submitted")));
  const [q] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inquiries)
    .where(and(eq(inquiries.listingId, listingId), sql`${inquiries.readAt} is null`));
  return { purchases: Number(p?.n ?? 0), inquiries: Number(q?.n ?? 0) };
}
