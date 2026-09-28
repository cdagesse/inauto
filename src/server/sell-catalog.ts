"use server";

import { z } from "zod";
import { listSellModels, listTrims, type SellModel, type TrimOption } from "./queries/sell-catalog";
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

const trimSchema = z.object({
  makeSlug: z.string().min(1).max(60),
  modelSlug: z.string().min(1).max(80),
});

/** Public, read-only. Trims seen on the market for a model, for the Buy page filter drawer. */
export async function getTrimOptions(raw: unknown): Promise<ActionResult<TrimOption[]>> {
  try {
    const parsed = trimSchema.safeParse(raw);
    if (!parsed.success) return fail("Pick a model.");
    const data = await listTrims(parsed.data.makeSlug, parsed.data.modelSlug);
    return { ok: true, data };
  } catch (e) {
    return toError(e);
  }
}
