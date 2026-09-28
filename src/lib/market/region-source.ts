import "server-only";
import { cache } from "react";
import { loadRegionInput } from "@/server/queries/regions";
import { aggregateRegions, type RegionsOverview } from "./regions";

/**
 * Regions with their types and makes, once per request. Throws when the database is
 * away so ISR keeps serving the last good page instead of publishing six empty regions.
 */
export const getRegions = cache(async (): Promise<RegionsOverview> =>
  aggregateRegions(await loadRegionInput()),
);
