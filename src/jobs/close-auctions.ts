import { and, desc, eq, lte, sql } from "drizzle-orm";
import { bids, listings } from "@/db/schema";
import type { Db } from "@/db";

export interface CloseSummary {
  closed: number;
  sold: number;
  ended: number;
  ids: { id: string; outcome: "sold" | "ended" }[];
}

/** Pure decision: an auction with a high bid at or above its reserve (or no reserve) is sold. */
export function decideOutcome(
  listing: { reservePrice: number | null },
  highBid: { id: string; amount: number } | null,
): "sold" | "ended" {
  if (!highBid) return "ended";
  if (listing.reservePrice != null && highBid.amount < listing.reservePrice) return "ended";
  return "sold";
}

/**
 * Closes every active auction whose end time has passed. Each listing is
 * handled in its own transaction under `FOR UPDATE SKIP LOCKED`, so two
 * overlapping cron runs never double-close, and one bad row never blocks
 * the rest. Idempotent: a listing that is no longer active is skipped.
 */
export async function closeEndedAuctions(opts: {
  db: Db;
  now?: Date;
  log?: (msg: string) => void;
}): Promise<CloseSummary> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const due = await opts.db
    .select({ id: listings.id })
    .from(listings)
    .where(
      and(
        eq(listings.type, "auction"),
        eq(listings.status, "active"),
        lte(listings.auctionEndsAt, now),
      ),
    )
    .limit(500);
  const summary: CloseSummary = { closed: 0, sold: 0, ended: 0, ids: [] };
  for (const { id } of due) {
    const outcome = await opts.db.transaction(async (tx) => {
      const [l] = await tx
        .select({
          id: listings.id,
          status: listings.status,
          endsAt: listings.auctionEndsAt,
          reservePrice: listings.reservePrice,
        })
        .from(listings)
        .where(eq(listings.id, id))
        .for("update", { skipLocked: true });
      if (!l || l.status !== "active" || !l.endsAt || l.endsAt.getTime() > now.getTime())
        return null;
      const [top] = await tx
        .select({ id: bids.id, amount: bids.amount })
        .from(bids)
        .where(eq(bids.listingId, l.id))
        .orderBy(desc(bids.amount), sql`${bids.createdAt} asc`)
        .limit(1);
      const result = decideOutcome(l, top ?? null);
      await tx
        .update(listings)
        .set(
          result === "sold"
            ? { status: "sold", closedAt: now, winningBidId: top!.id, soldPrice: top!.amount }
            : { status: "ended", closedAt: now },
        )
        .where(and(eq(listings.id, l.id), eq(listings.status, "active")));
      return result;
    });
    if (!outcome) continue;
    summary.closed++;
    summary[outcome]++;
    summary.ids.push({ id, outcome });
    log(`auction ${id} ${outcome}`);
  }
  return summary;
}
