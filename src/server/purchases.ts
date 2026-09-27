"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { inquiries, listings, purchases, users } from "@/db/schema";
import { buildCart } from "@/lib/purchase/pricing";
import { inquirySchema, purchaseSchema } from "./purchases-schema";
import { type ActionResult, fail, toError } from "./result";

async function loadPurchasable(listingId: string, buyerId: string) {
  const [l] = await db
    .select({
      id: listings.id,
      sellerId: listings.sellerId,
      status: listings.status,
      type: listings.type,
      askingPrice: listings.askingPrice,
      sellerStatus: users.status,
    })
    .from(listings)
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(eq(listings.id, listingId))
    .limit(1);
  if (!l) return { ok: false as const, error: "Listing not found." };
  if (l.sellerId === buyerId) return { ok: false as const, error: "This is your own listing." };
  if (l.status !== "active" || l.sellerStatus !== "active")
    return { ok: false as const, error: "This listing is no longer available." };
  return { ok: true as const, listing: l };
}

/** Buyer sends a question to the seller. */
export async function createInquiry(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = inquirySchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check your message.");
    const d = parsed.data;
    const r = await loadPurchasable(d.listingId, user.id);
    if (!r.ok) return fail(r.error);
    const [row] = await db
      .insert(inquiries)
      .values({
        listingId: d.listingId,
        buyerId: user.id,
        sellerId: r.listing.sellerId,
        message: d.message,
        contact: d.contact || null,
      })
      .returning({ id: inquiries.id });
    revalidatePath("/garage");
    revalidatePath(`/listings/${d.listingId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return toError(e);
  }
}

/** Buyer submits a purchase request with their details, add-ons and uploads. */
export async function createPurchase(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = purchaseSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
    const d = parsed.data;
    if (d.mode === "online" && !d.acknowledged)
      return fail("Please confirm you have read the online purchase safeguards.");
    const r = await loadPurchasable(d.listingId, user.id);
    if (!r.ok) return fail(r.error);
    if (r.listing.type === "auction")
      return fail("Auctions are bought by bidding, not by request.");
    const price = r.listing.askingPrice;
    if (price == null || price <= 0) return fail("This listing has no asking price yet.");
    const cart = buildCart(price, d.options);
    const [row] = await db
      .insert(purchases)
      .values({
        listingId: d.listingId,
        buyerId: user.id,
        sellerId: r.listing.sellerId,
        mode: d.mode,
        price,
        buyer: d.buyer,
        options: d.options,
        uploads: d.uploads,
        cart: { items: cart.items, total: cart.total },
        note: d.note || null,
      })
      .returning({ id: purchases.id });
    revalidatePath("/garage");
    revalidatePath(`/listings/${d.listingId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return toError(e);
  }
}

const respondSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["accepted", "declined", "completed"]),
  note: z.string().trim().max(2000).optional().nullable(),
});

/** Seller accepts, declines or completes a request. Completing marks the listing sold. */
export async function respondToPurchase(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = respondSchema.safeParse(raw);
    if (!parsed.success) return fail("Invalid request.");
    const d = parsed.data;
    const [p] = await db
      .select({
        id: purchases.id,
        listingId: purchases.listingId,
        status: purchases.status,
        price: purchases.price,
      })
      .from(purchases)
      .where(and(eq(purchases.id, d.id), eq(purchases.sellerId, user.id)))
      .limit(1);
    if (!p) return fail("Request not found.");
    if (p.status === "cancelled" || p.status === "declined" || p.status === "completed")
      return fail("This request is already closed.");
    await db
      .update(purchases)
      .set({ status: d.decision, sellerNote: d.note || null, respondedAt: new Date() })
      .where(eq(purchases.id, d.id));
    if (d.decision === "completed") {
      await db
        .update(listings)
        .set({ status: "sold", soldPrice: p.price, closedAt: new Date() })
        .where(and(eq(listings.id, p.listingId), eq(listings.sellerId, user.id)));
      await db
        .update(purchases)
        .set({ status: "declined", respondedAt: new Date() })
        .where(and(eq(purchases.listingId, p.listingId), eq(purchases.status, "submitted")));
    }
    revalidatePath("/garage");
    revalidatePath("/listings");
    revalidatePath(`/listings/${p.listingId}`);
    revalidatePath(`/purchases/${d.id}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

/** Buyer withdraws their own request. */
export async function cancelPurchase(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: fd.get("id") });
    if (!parsed.success) return fail("Invalid request.");
    await db
      .update(purchases)
      .set({ status: "cancelled", respondedAt: new Date() })
      .where(
        and(
          eq(purchases.id, parsed.data.id),
          eq(purchases.buyerId, user.id),
          sql`${purchases.status} in ('submitted', 'accepted')`,
        ),
      );
    revalidatePath("/garage");
    revalidatePath(`/purchases/${parsed.data.id}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

/** Seller marks an inquiry read. */
export async function markInquiryRead(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: fd.get("id") });
    if (!parsed.success) return fail("Invalid request.");
    await db
      .update(inquiries)
      .set({ readAt: new Date() })
      .where(and(eq(inquiries.id, parsed.data.id), eq(inquiries.sellerId, user.id)));
    revalidatePath("/garage");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
