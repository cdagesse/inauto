import "server-only";
import { priceGuidance } from "@/lib/valuation/guidance";
import type { PriceGuidance } from "@/lib/valuation/types";
import { matchMarketModel } from "./market-match";
import type { GuidanceInput } from "./pricing-schema";

export interface GuidanceResult {
  guidance: PriceGuidance | null;
  marketHref: string | null;
  generation: string | null;
}

/**
 * Price guidance for a car from the stored market snapshot. Shared by the
 * sell wizard's live preview and by createListing, which recomputes it
 * server-side so a listing never stores guidance the seller supplied.
 * Null guidance when the car does not match a market model yet.
 */
export async function computeGuidance(input: GuidanceInput): Promise<GuidanceResult> {
  const match = await matchMarketModel(input.make, input.model, input.year);
  if (!match || !match.generation)
    return { guidance: null, marketHref: match?.href ?? null, generation: null };
  const guidance = priceGuidance(match.snapshot, {
    generation: match.generation,
    year: input.year,
    miles: input.miles,
    packages: input.packages,
    colorClass: input.colorClass,
    condition: input.condition,
    history: input.history,
    askingPrice: input.askingPrice,
  });
  return { guidance, marketHref: match.href, generation: match.generation };
}
