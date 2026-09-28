"use server";

import { computeGuidance, type GuidanceResult } from "./guidance";
import { guidanceInputSchema } from "./pricing-schema";
import { type ActionResult, fail, toError } from "./result";

/** Public, read-only. Returns null data when the car does not match a market model yet. */
export async function getPriceGuidance(raw: unknown): Promise<ActionResult<GuidanceResult>> {
  try {
    const parsed = guidanceInputSchema.safeParse(raw);
    if (!parsed.success) return fail("Check the car details and asking price.");
    return { ok: true, data: await computeGuidance(parsed.data) };
  } catch (e) {
    return toError(e);
  }
}
