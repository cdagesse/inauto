import "server-only";
import type { MarketSnapshot } from "./types";
import gt3rs from "@/data/fixtures/porsche-911-gt3-rs.json";

/**
 * Market snapshot source. Today this reads the frozen fixture (the prototype's
 * dataset as of Sep 19, 2026). When the nightly pipeline has populated
 * market_daily / dealer_sale / auction_result for a model, swap this for a
 * DB-backed builder that produces the same MarketSnapshot shape; nothing
 * downstream changes.
 */
const FIXTURES: Record<string, MarketSnapshot> = {
  "porsche/911-gt3-rs": gt3rs as unknown as MarketSnapshot,
};

export async function getMarketSnapshot(makeSlug: string, modelSlug: string): Promise<MarketSnapshot | null> {
  return FIXTURES[`${makeSlug}/${modelSlug}`] ?? null;
}

export async function listMarketModels(): Promise<
  { make: MarketSnapshot["make"]; model: MarketSnapshot["model"]; totals: MarketSnapshot["totals"]; headline: number }[]
> {
  return Object.values(FIXTURES).map((s) => ({
    make: s.make,
    model: s.model,
    totals: s.totals,
    headline: s.generations[s.order[0]].median,
  }));
}
