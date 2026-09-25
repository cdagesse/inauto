import "server-only";
import { cache } from "react";
import type { MarketSnapshot } from "./types";
import { buildSnapshot } from "./build";
import { listModelsWithData, loadSnapshotInput } from "./queries";
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

async function fromDb(makeSlug: string, modelSlug: string): Promise<MarketSnapshot | null> {
  try {
    const input = await loadSnapshotInput(makeSlug, modelSlug);
    return input ? buildSnapshot(input) : null;
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

export const listMarketModels = cache(async (): Promise<MarketModelSummary[]> => {
  const out = new Map<string, MarketModelSummary>();
  let keys: { makeSlug: string; modelSlug: string }[] = [];
  try {
    keys = await listModelsWithData();
  } catch (err) {
    console.warn("market index: database unavailable", (err as Error).message);
  }
  for (const k of keys) {
    const snap = await getMarketSnapshot(k.makeSlug, k.modelSlug);
    if (snap) out.set(`${k.makeSlug}/${k.modelSlug}`, summarize(snap));
  }
  for (const [key, s] of Object.entries(FIXTURES)) if (!out.has(key)) out.set(key, summarize(s));
  return [...out.values()];
});
