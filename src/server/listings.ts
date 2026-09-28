"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { bids, listings, networkMembers } from "@/db/schema";
import { computeGuidance } from "./guidance";
import { createListingSchema, updateListingSchema } from "./listings-schema";
import { placeBid } from "./queries/listings";
import { type ActionResult, fail, toError } from "./result";

function safeUrl(u: string) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Creates a listing (draft or active). Private listings require membership of the chosen network. */
export async function createListing(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = createListingSchema.safeParse(raw);
    if (!parsed.success)
      return fail(parsed.error.issues[0]?.message ?? "Check the listing details.");
    const d = parsed.data;
    if (d.type === "private") {
      if (!d.networkId) return fail("Choose a private network.");
      const [m] = await db
        .select({ id: networkMembers.networkId })
        .from(networkMembers)
        .where(and(eq(networkMembers.networkId, d.networkId), eq(networkMembers.userId, user.id)))
        .limit(1);
      if (!m) return fail("You are not a member of that network.");
    }
    if (d.type === "auction" && !d.auctionDays) return fail("Choose an auction length.");
    if (d.type !== "auction" && (d.askingPrice == null || d.askingPrice <= 0))
      return fail("Enter an asking price.");
    const photos = d.photos.map(safeUrl).filter((p): p is string => !!p);
    // Guidance is UrCar's own read of the market, so it is computed here from
    // the validated car and price rather than taken from the seller's payload.
    const { guidance } = await computeGuidance({
      make: d.make,
      model: d.model,
      year: d.year,
      miles: d.miles,
      packages: d.packages,
      colorClass: d.colorClass,
      condition: d.condition,
      history: d.history,
      askingPrice: d.type === "auction" ? (d.reservePrice ?? 0) : (d.askingPrice ?? 0),
    });
    const [row] = await db
      .insert(listings)
      .values({
        sellerId: user.id,
        type: d.type,
        status: d.publish ? "active" : "draft",
        networkId: d.type === "private" ? d.networkId! : null,
        make: d.make,
        model: d.model,
        year: d.year,
        trim: d.trim || null,
        vin: d.vin || null,
        miles: d.miles,
        color: d.color || null,
        colorClass: d.colorClass,
        condition: d.condition,
        history: d.history,
        packages: d.packages,
        title: d.title,
        description: d.description || null,
        photos,
        location: d.location || null,
        askingPrice: d.type === "auction" ? null : (d.askingPrice ?? null),
        reservePrice: d.type === "auction" ? (d.reservePrice ?? null) : null,
        auctionEndsAt:
          d.type === "auction" && d.publish
            ? new Date(Date.now() + d.auctionDays! * 86_400_000)
            : null,
        priceGuidance: guidance,
      })
      .returning({ id: listings.id });
    revalidatePath("/listings");
    revalidatePath("/");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return toError(e);
  }
}

/**
 * Owner edits a listing. Allowed while draft, active or ended (not sold or
 * withdrawn). Bids already placed keep an auction's reserve from rising.
 */
export async function updateListing(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = updateListingSchema.safeParse(raw);
    if (!parsed.success)
      return fail(parsed.error.issues[0]?.message ?? "Check the listing details.");
    const d = parsed.data;
    const [cur] = await db
      .select({
        type: listings.type,
        status: listings.status,
        reservePrice: listings.reservePrice,
        highBid: sql<
          number | null
        >`(select max(${bids.amount}) from ${bids} where ${bids.listingId} = ${listings.id})`,
      })
      .from(listings)
      .where(and(eq(listings.id, d.id), eq(listings.sellerId, user.id)))
      .limit(1);
    if (!cur) return fail("Listing not found.");
    if (cur.status === "sold" || cur.status === "withdrawn")
      return fail("This listing is closed and can no longer be edited.");
    if (cur.type !== "auction" && (d.askingPrice == null || d.askingPrice <= 0))
      return fail("Enter an asking price.");
    if (
      cur.type === "auction" &&
      cur.highBid != null &&
      d.reservePrice != null &&
      cur.reservePrice != null &&
      d.reservePrice > cur.reservePrice
    )
      return fail("The reserve cannot be raised once bidding has started.");
    const photos = d.photos.map(safeUrl).filter((p): p is string => !!p);
    await db
      .update(listings)
      .set({
        make: d.make,
        model: d.model,
        year: d.year,
        trim: d.trim || null,
        vin: d.vin || null,
        miles: d.miles,
        color: d.color || null,
        colorClass: d.colorClass,
        condition: d.condition,
        history: d.history,
        packages: d.packages,
        title: d.title,
        description: d.description || null,
        photos,
        location: d.location || null,
        askingPrice: cur.type === "auction" ? null : (d.askingPrice ?? null),
        reservePrice: cur.type === "auction" ? (d.reservePrice ?? null) : null,
        sellerDetails: d.sellerDetails ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(listings.id, d.id), eq(listings.sellerId, user.id)));
    revalidatePath("/listings");
    revalidatePath("/");
    revalidatePath(`/listings/${d.id}`);
    return { ok: true, data: { id: d.id } };
  } catch (e) {
    return toError(e);
  }
}

/**
 * Owner deletes their listing outright. Allowed in any status as long as
 * nobody has bid on it; an auction with bids must be taken down (withdrawn)
 * instead so bidders keep a record. Bids cascade; service orders keep their
 * row with the listing reference cleared.
 */
export async function deleteListing(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: fd.get("id") });
    if (!parsed.success) return fail("Invalid request.");
    const [cur] = await db
      .select({
        id: listings.id,
        bidCount: sql<number>`(select count(*) from ${bids} where ${bids.listingId} = ${listings.id})::int`,
      })
      .from(listings)
      .where(and(eq(listings.id, parsed.data.id), eq(listings.sellerId, user.id)))
      .limit(1);
    if (!cur) return fail("Listing not found.");
    if (Number(cur.bidCount) > 0)
      return fail("This auction has bids, so it cannot be deleted. Take it down instead.");
    await db
      .delete(listings)
      .where(and(eq(listings.id, parsed.data.id), eq(listings.sellerId, user.id)));
    revalidatePath("/garage");
    revalidatePath("/listings");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

/** Kept for the edit page's "Delete draft" button. */
export async function deleteDraftListing(fd: FormData): Promise<ActionResult> {
  return deleteListing(fd);
}

export async function publishListing(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: fd.get("id") });
    if (!parsed.success) return fail("Invalid request.");
    await db
      .update(listings)
      .set({
        status: "active",
        auctionEndsAt: sql`case when ${listings.type} = 'auction' and ${listings.auctionEndsAt} is null then now() + interval '7 days' else ${listings.auctionEndsAt} end`,
      })
      .where(
        and(
          eq(listings.id, parsed.data.id),
          eq(listings.sellerId, user.id),
          eq(listings.status, "draft"),
        ),
      );
    revalidatePath("/listings");
    revalidatePath("/");
    revalidatePath(`/listings/${parsed.data.id}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

async function setStatus(fd: FormData, status: "withdrawn" | "sold"): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: fd.get("id") });
    if (!parsed.success) return fail("Invalid request.");
    await db
      .update(listings)
      .set({ status, closedAt: new Date() })
      .where(
        and(
          eq(listings.id, parsed.data.id),
          eq(listings.sellerId, user.id),
          inArray(listings.status, ["draft", "active", "ended"]),
        ),
      );
    revalidatePath("/listings");
    revalidatePath("/");
    revalidatePath(`/listings/${parsed.data.id}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
/** Owner puts a withdrawn or ended listing back on the market. Auctions get a fresh 7-day clock. */
export async function relistListing(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: fd.get("id") });
    if (!parsed.success) return fail("Invalid request.");
    await db
      .update(listings)
      .set({
        status: "active",
        closedAt: null,
        auctionEndsAt: sql`case when ${listings.type} = 'auction' then now() + interval '7 days' else ${listings.auctionEndsAt} end`,
      })
      .where(
        and(
          eq(listings.id, parsed.data.id),
          eq(listings.sellerId, user.id),
          inArray(listings.status, ["withdrawn", "ended"]),
        ),
      );
    revalidatePath("/listings");
    revalidatePath("/");
    revalidatePath(`/listings/${parsed.data.id}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function withdrawListing(fd: FormData) {
  return setStatus(fd, "withdrawn");
}
export async function markListingSold(fd: FormData) {
  return setStatus(fd, "sold");
}

export async function placeBidAction(
  _prev: ActionResult<{ amount: number }> | null,
  fd: FormData,
): Promise<ActionResult<{ amount: number }>> {
  try {
    const user = await requireUser();
    return placeBid(String(fd.get("listingId") ?? ""), Number(fd.get("amount")), user.id);
  } catch (e) {
    return toError(e);
  }
}
