"use server";

import { priceGuidance } from "@/lib/valuation/guidance";
import type { PriceGuidance } from "@/lib/valuation/types";
import { matchMarketModel } from "./market-match";
import { guidanceInputSchema } from "./pricing-schema";
import { type ActionResult, fail, toError } from "./result";

/** Public, read-only. Returns null data when the car does not match a market model yet. */
export async function getPriceGuidance(raw: unknown): Promise<
  ActionResult<{
    guidance: PriceGuidance | null;
    marketHref: string | null;
    generation: string | null;
  }>
> {
  try {
    const parsed = guidanceInputSchema.safeParse(raw);
    if (!parsed.success) return fail("Check the car details and asking price.");
    const input = parsed.data;
    const match = await matchMarketModel(input.make, input.model, input.year);
    if (!match || !match.generation)
      return {
        ok: true,
        data: { guidance: null, marketHref: match?.href ?? null, generation: null },
      };
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
    return { ok: true, data: { guidance, marketHref: match.href, generation: match.generation } };
  } catch (e) {
    return toError(e);
  }
}
