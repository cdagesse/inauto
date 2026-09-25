import "server-only";
import { getMarketSnapshot } from "@/lib/market/source";
import type { MarketSnapshot } from "@/lib/market/types";
import { slugify } from "./result";

export interface MarketMatch {
  snapshot: MarketSnapshot;
  generation: string | null;
  href: string;
}

/** Matches a free-text make/model (and optional year) to a published market model. */
export async function matchMarketModel(
  make: string,
  model: string,
  year?: number | null,
): Promise<MarketMatch | null> {
  const makeSlug = slugify(make);
  const modelSlug = slugify(model);
  const candidates = [modelSlug, `911-${modelSlug}`, modelSlug.replace(/^porsche-/, "")];
  for (const c of candidates) {
    const snapshot = await getMarketSnapshot(makeSlug, c);
    if (!snapshot) continue;
    let generation: string | null = null;
    if (year) {
      for (const [code, years] of Object.entries(snapshot.years)) {
        if (years.includes(year)) generation = code;
      }
    }
    return { snapshot, generation, href: `/${snapshot.make.slug}/${snapshot.model.slug}` };
  }
  return null;
}
