import "server-only";
import { cache } from "react";
import { loadRegionInput } from "@/server/queries/regions";
import { aggregateRegions, type RegionsOverview } from "./regions";

/** Regions with their types and makes, once per request. Empty regions when the database is away. */
export const getRegions = cache(async (): Promise<RegionsOverview> => {
  try {
    return aggregateRegions(await loadRegionInput());
  } catch (err) {
    console.warn("regions: database unavailable", (err as Error).message);
    return aggregateRegions({ sales: [], auctions: [], dataThrough: null });
  }
});
