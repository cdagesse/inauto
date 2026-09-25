"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { listings, networkMembers } from "@/db/schema";
import { createListingSchema } from "./listings-schema";
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
        priceGuidance: d.priceGuidance ?? null,
      })
      .returning({ id: listings.id });
    revalidatePath("/listings");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return toError(e);
  }
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
      .set({ status })
      .where(
        and(
          eq(listings.id, parsed.data.id),
          eq(listings.sellerId, user.id),
          inArray(listings.status, ["draft", "active", "ended"]),
        ),
      );
    revalidatePath("/listings");
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
