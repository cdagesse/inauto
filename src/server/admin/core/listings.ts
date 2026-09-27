import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bids, listings } from "@/db/schema";
import { type ActionResult, fail, toError } from "@/server/result";
import { audit } from "./audit";

/**
 * Admin removes a listing outright (bids cascade, service orders keep their
 * row with the listing reference cleared). One transaction, one audit row
 * that records what was removed so the log stays meaningful afterwards.
 */
export async function deleteListing(
  adminId: string,
  listingId: string,
  reason: string,
): Promise<ActionResult<{ sellerId: string }>> {
  try {
    const outcome = await db.transaction(async (tx) => {
      const [l] = await tx
        .select({
          id: listings.id,
          sellerId: listings.sellerId,
          title: listings.title,
          type: listings.type,
          status: listings.status,
          bidCount: sql<number>`(select count(*) from ${bids} where ${bids.listingId} = ${listings.id})::int`,
        })
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1);
      if (!l) return "Listing not found.";
      await tx.delete(listings).where(eq(listings.id, listingId));
      await audit(tx, adminId, "listing.delete", "listing", listingId, {
        reason,
        sellerId: l.sellerId,
        title: l.title,
        type: l.type,
        status: l.status,
        bids: Number(l.bidCount),
      });
      return { sellerId: l.sellerId };
    });
    return typeof outcome === "string" ? fail(outcome) : { ok: true, data: outcome };
  } catch (e) {
    return toError(e);
  }
}
