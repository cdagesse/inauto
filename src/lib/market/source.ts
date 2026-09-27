import "server-only";
import { cache } from "react";
import type { MarketSnapshot } from "./types";
import { listModelsWithData } from "./queries";
import { loadStoredSnapshot, rebuildSnapshot } from "./store";
import gt3rs from "@/data/fixtures/porsche-911-gt3-rs.json";

/**
 * Market snapshot source. Postgres first (dealer_sale, dealer_active,
 * auction_result rows fed by the nightly job and the seed), built into the
 * MarketSnapshot shape by the pure builder. The frozen prototype fixture is
 * only a fallback for a model with no rows or an unreachable database (for
 * example the CI production build), so the GT3 RS page always renders.
 */
const FIXTURES: Record<string, MarketSnapshot> = {
  "porsche/911-gt3-rs": gt3rs as unknown as MarketSnapshot,
};

/**
 * Stored snapshot first (built nightly, or when a report first becomes ready);
 * on a miss, build it now from the raw rows and store it so the next reader is
 * cheap. Pages therefore never aggregate tens of thousands of rows per request.
 */
async function fromDb(makeSlug: string, modelSlug: string): Promise<MarketSnapshot | null> {
  try {
    const stored = await loadStoredSnapshot(makeSlug, modelSlug);
    if (stored) return stored;
    return await rebuildSnapshot(makeSlug, modelSlug);
  } catch (err) {
    console.warn(
      `market snapshot: database unavailable for ${makeSlug}/${modelSlug}`,
      (err as Error).message,
    );
    return null;
  }
}

export const getMarketSnapshot = cache(
  async (makeSlug: string, modelSlug: string): Promise<MarketSnapshot | null> =>
    (await fromDb(makeSlug, modelSlug)) ?? FIXTURES[`${makeSlug}/${modelSlug}`] ?? null,
);

export interface MarketModelSummary {
  make: MarketSnapshot["make"];
  model: MarketSnapshot["model"];
  totals: MarketSnapshot["totals"];
  headline: number;
}

function summarize(s: MarketSnapshot): MarketModelSummary {
  const first = s.order.map((c) => s.generations[c]).find((g) => g && g.median > 0);
  return { make: s.make, model: s.model, totals: s.totals, headline: first?.median ?? 0 };
}

/** Every model snapshot with data (plus the fixture fallback), in catalog order. */
export const listMarketSnapshots = cache(async (): Promise<MarketSnapshot[]> => {
  const out = new Map<string, MarketSnapshot>();
  let keys: { makeSlug: string; modelSlug: string }[] = [];
  try {
    keys = await listModelsWithData();
  } catch (err) {
    console.warn("market index: database unavailable", (err as Error).message);
  }
  const snaps = await Promise.all(keys.map((k) => getMarketSnapshot(k.makeSlug, k.modelSlug)));
  keys.forEach((k, i) => {
    const snap = snaps[i];
    if (snap) out.set(`${k.makeSlug}/${k.modelSlug}`, snap);
  });
  for (const [key, s] of Object.entries(FIXTURES)) if (!out.has(key)) out.set(key, s);
  return [...out.values()];
});

export const listMarketModels = cache(async (): Promise<MarketModelSummary[]> =>
  (await listMarketSnapshots()).map(summarize),
);
