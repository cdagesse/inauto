import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { auctionResults, dealerActive, dealerSales, externalListings, listings } from "@/db/schema";
import { buildVinTimeline, isVin, type VinEvent, type VinRows } from "@/lib/vin/timeline";

/** Every sighting of a VIN across dealer, auction, platform and UrCar data, newest first. */
export const getVinTimeline = cache(
  async (
    vin: string | null | undefined,
    current?: { kind: "external" | "inauto"; id: string },
  ): Promise<VinEvent[]> => {
    const v = (vin ?? "").trim().toUpperCase();
    if (!isVin(v)) return [];
    const listedAt = (t: typeof dealerSales | typeof dealerActive) =>
      sql<string | null>`${t.rawJson}->>'listed_at'`;
    const [sales, active, auctions, external, inauto] = await Promise.all([
      db
        .select({
          sourceListingId: dealerSales.sourceListingId,
          price: dealerSales.price,
          miles: dealerSales.miles,
          dealerName: dealerSales.dealerName,
          state: dealerSales.state,
          // Visor's sold feed carries no sold_date; derive it as listed_at + days_on_market,
          // capped at the fetch date (same rule as the market snapshot loader).
          date: sql<
            string | null
          >`coalesce(${dealerSales.soldDate}, least(((${dealerSales.rawJson}->>'listed_at')::timestamp + make_interval(days => greatest(coalesce(${dealerSales.daysOnMarket}, 0), 0)))::date, ${dealerSales.fetchedAt}::date))::text`,
          listedAt: listedAt(dealerSales),
        })
        .from(dealerSales)
        // "incomplete" rows carry no price, dealer or dates: a sighting with nothing to show.
        .where(
          sql`${dealerSales.vin} = ${v} and ${dealerSales.excludedReason} is distinct from 'incomplete'`,
        )
        .limit(50),
      db
        .select({
          sourceListingId: dealerActive.sourceListingId,
          price: dealerActive.price,
          miles: dealerActive.miles,
          dealerName: dealerActive.dealerName,
          state: dealerActive.state,
          date: sql<string | null>`${dealerActive.snapshotDate}::text`,
          listedAt: listedAt(dealerActive),
        })
        .from(dealerActive)
        .where(eq(dealerActive.vin, v))
        .orderBy(desc(dealerActive.snapshotDate))
        .limit(400),
      db
        .select({
          source: auctionResults.source,
          sourceId: auctionResults.sourceId,
          url: auctionResults.url,
          status: auctionResults.status,
          price: auctionResults.hammerPrice,
          miles: auctionResults.miles,
          endedAt: sql<string | null>`${auctionResults.endedAt}::text`,
        })
        .from(auctionResults)
        .where(eq(auctionResults.vin, v))
        .limit(50),
      db
        .select({
          source: externalListings.source,
          sourceName: externalListings.sourceName,
          sourceId: externalListings.sourceId,
          status: externalListings.status,
          currentBid: externalListings.currentBid,
          finalPrice: externalListings.finalPrice,
          miles: externalListings.miles,
          endsAt: sql<string | null>`${externalListings.endsAt}::text`,
        })
        .from(externalListings)
        .where(eq(externalListings.vin, v))
        .limit(50),
      db
        .select({
          id: listings.id,
          status: listings.status,
          type: listings.type,
          askingPrice: listings.askingPrice,
          soldPrice: listings.soldPrice,
          miles: listings.miles,
          createdAt: sql<string>`${listings.createdAt}::text`,
          closedAt: sql<string | null>`${listings.closedAt}::text`,
        })
        .from(listings)
        .where(sql`upper(${listings.vin}) = ${v} and ${listings.type} <> 'private'`)
        .limit(50),
    ]);
    const rows: VinRows = {
      dealer: [
        ...sales.map((r) => ({ ...r, sold: true })),
        ...active.map((r) => ({ ...r, sold: false })),
      ],
      auctions: auctions.map((a) => ({
        ...a,
        status: a.status as "sold" | "rnm" | "withdrawn",
      })),
      external,
      inauto,
    };
    return buildVinTimeline(rows, current);
  },
);
