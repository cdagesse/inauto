"use server";

import { z } from "zod";
import { listSellModels, type SellModel } from "./queries/sell-catalog";
import { type ActionResult, fail, toError } from "./result";

const schema = z.object({ makeSlug: z.string().min(1).max(60) });

/** Public, read-only. Models and generations of a make for the sell picker. */
export async function getSellModels(raw: unknown): Promise<ActionResult<SellModel[]>> {
  try {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return fail("Pick a make.");
    const data = await listSellModels(parsed.data.makeSlug);
    return { ok: true, data };
  } catch (e) {
    return toError(e);
  }
}
