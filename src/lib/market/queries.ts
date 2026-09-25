import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auctionResults, dealerActive, dealerSales, generations, makes, models } from "@/db/schema";
import type { SnapshotInput } from "./build";

/** Bound the rows a single page build reads; medians barely move past this and it caps memory. */
const MAX_DEALER_ROWS = 5000;
const MAX_AUCTION_ROWS = 1000;

/**
 * Loads everything buildSnapshot needs for one model. Returns null when the
 * model is unknown or has no market rows at all, so callers can fall back.
 */
export async function loadSnapshotInput(
  makeSlug: string,
  modelSlug: string,
  now = new Date(),
): Promise<SnapshotInput | null> {
  const [head] = await db
    .select({
      makeName: makes.name,
      makeSlug: makes.slug,
      modelId: models.id,
      modelName: models.name,
      modelSlug: models.slug,
      shortName: models.shortName,
      parentLine: models.parentLine,
    })
    .from(models)
    .innerJoin(makes, eq(models.makeId, makes.id))
    .where(and(eq(makes.slug, makeSlug), eq(models.slug, modelSlug)))
    .limit(1);
  if (!head) return null;

  const [gens, sales, auctions] = await Promise.all([
    db.select().from(generations).where(eq(generations.modelId, head.modelId)),
    db
      .select({
        year: dealerSales.year,
        miles: dealerSales.miles,
        price: dealerSales.price,
        color: dealerSales.color,
        isPts: dealerSales.isPts,
        packages: dealerSales.packages,
        state: dealerSales.state,
        daysOnMarket: dealerSales.daysOnMarket,
        soldDate: dealerSales.soldDate,
        generationId: dealerSales.generationId,
        excludedReason: dealerSales.excludedReason,
      })
      .from(dealerSales)
      .where(eq(dealerSales.modelId, head.modelId))
      .orderBy(desc(dealerSales.soldDate))
      .limit(MAX_DEALER_ROWS),
    db
      .select({
        source: auctionResults.source,
        sourceId: auctionResults.sourceId,
        url: auctionResults.url,
        year: auctionResults.year,
        miles: auctionResults.miles,
        hammerPrice: auctionResults.hammerPrice,
        status: auctionResults.status,
        endedAt: auctionResults.endedAt,
        packages: auctionResults.packages,
        generationId: auctionResults.generationId,
        excludedReason: auctionResults.excludedReason,
      })
      .from(auctionResults)
      .where(eq(auctionResults.modelId, head.modelId))
      .orderBy(desc(auctionResults.endedAt))
      .limit(MAX_AUCTION_ROWS),
  ]);
  if (sales.length === 0 && auctions.length === 0) return null;

  // Only the latest snapshot day counts as "listed now".
  const activeRows = await db
    .select({
      price: dealerActive.price,
      miles: dealerActive.miles,
      generationId: dealerActive.generationId,
      year: dealerActive.year,
    })
    .from(dealerActive)
    .where(
      and(
        eq(dealerActive.modelId, head.modelId),
        eq(
          dealerActive.snapshotDate,
          sql`(select max(${dealerActive.snapshotDate}) from ${dealerActive} where ${dealerActive.modelId} = ${head.modelId})`,
        ),
      ),
    );

  return {
    make: { name: head.makeName, slug: head.makeSlug },
    model: {
      name: head.modelName,
      slug: head.modelSlug,
      shortName: head.shortName,
      parentLine: head.parentLine,
    },
    generations: gens.map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
      yearStart: g.yearStart,
      yearEnd: g.yearEnd,
      originalMsrp: g.originalMsrp,
      engine: g.engine,
      hp: g.hp,
      gearbox: g.gearbox,
      notes: g.notes,
      packages: g.packages,
      sortOrder: g.sortOrder,
    })),
    dealerSales: sales,
    dealerActive: activeRows,
    auctions,
    now,
  };
}

/** Models that have a ready report or any market rows, for the index page. */
export async function listModelsWithData(): Promise<{ makeSlug: string; modelSlug: string }[]> {
  const rows = await db
    .select({ makeSlug: makes.slug, modelSlug: models.slug })
    .from(models)
    .innerJoin(makes, eq(models.makeId, makes.id))
    .where(
      sql`${models.reportStatus} = 'ready' or exists (select 1 from ${dealerSales} where ${dealerSales.modelId} = ${models.id}) or exists (select 1 from ${auctionResults} where ${auctionResults.modelId} = ${models.id})`,
    )
    .orderBy(makes.name, models.name);
  return rows;
}
