import "server-only";
import { cache } from "react";
import { countModelsByMake } from "@/server/queries/catalog";
import { listMarketSnapshots } from "./source";
import { buildMarketTree, type CatalogMakeCount, type MarketTree } from "./tree";

/** Segments → makes → models with trends, from every snapshot with data plus catalog counts. */
export const getMarketTree = cache(async (): Promise<MarketTree> => {
  const [snapshots, catalog] = await Promise.all([
    listMarketSnapshots(),
    countModelsByMake().catch((err): CatalogMakeCount[] => {
      console.warn("market tree: catalog unavailable", (err as Error).message);
      return [];
    }),
  ]);
  return buildMarketTree(snapshots, catalog);
});
