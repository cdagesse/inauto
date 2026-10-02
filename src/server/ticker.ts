import "server-only";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { externalListings } from "@/db/schema";
import { listMarketSnapshots } from "@/lib/market/source";
import { loadStoredSummaries } from "@/lib/market/store";
import { buildTickerItems, type TickerItem, type TickerSale } from "@/lib/market/ticker";
import { aggregate, buildMarketTree, type CatalogMakeCount } from "@/lib/market/tree";
import { countModelsByMake } from "@/server/queries/catalog";

/** Sold auctions this recent feed the strip; older ones are history, not news. */
const SALE_WINDOW_HOURS = 48;

/** Everything the ticker shows, from stored market summaries and the latest sold auctions. */
export async function buildTicker(): Promise<{ items: TickerItem[]; dataThrough: string | null }> {
  const [snapshots, catalog, soldRows] = await Promise.all([
    loadStoredSummaries()
      .then(async (s) => (s.length ? s : listMarketSnapshots()))
      .catch((err) => {
        console.warn("ticker: summaries unavailable", (err as Error).message);
        return listMarketSnapshots();
      }),
    countModelsByMake().catch((): CatalogMakeCount[] => []),
    db
      .select({
        title: externalListings.title,
        price: sql<
          number | null
        >`coalesce(${externalListings.finalPrice}, ${externalListings.currentBid})`,
        sourceName: externalListings.sourceName,
        source: externalListings.source,
        sourceId: externalListings.sourceId,
        modelId: externalListings.modelId,
      })
      .from(externalListings)
      .where(
        and(
          eq(externalListings.status, "sold"),
          eq(externalListings.currency, "USD"),
          isNotNull(externalListings.endsAt),
          gt(externalListings.endsAt, sql`now() - make_interval(hours => ${SALE_WINDOW_HOURS})`),
          gt(sql`coalesce(${externalListings.finalPrice}, ${externalListings.currentBid})`, 0),
        ),
      )
      .orderBy(desc(externalListings.endsAt))
      .limit(40)
      .catch((err): never[] => {
        console.warn("ticker: sold auctions unavailable", (err as Error).message);
        return [];
      }),
  ]);
  const tree = buildMarketTree(snapshots, catalog);
  const national = aggregate(snapshots, tree.months);
  const sales: TickerSale[] = soldRows
    .filter((r) => r.price != null && r.price > 0)
    .map((r) => ({
      title: r.title,
      price: r.price as number,
      sourceName: r.sourceName,
      href: `/listings/ext/${r.source}/${encodeURIComponent(r.sourceId)}`,
      catalogued: r.modelId != null,
    }));
  return { items: buildTickerItems({ tree, national, sales }), dataThrough: tree.dataThrough };
}
