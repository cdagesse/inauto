/** Pure cleaning rules. Rows are marked, never deleted. */

export type ExcludedReason = "outlier_price" | "likely_mislabeled" | "incomplete" | "manual";

export const OUTLIER_LO = 0.4;
export const OUTLIER_HI = 2.5;

export interface CleanInput {
  price: number | null;
  miles: number | null;
  year: number | null;
  /** Trailing-180-day median for the row's generation, null when unknown. */
  genMedian: number | null;
  /** Existing manual mark; manual exclusions are never overwritten. */
  existing?: ExcludedReason | null;
}

/**
 * Rule table for likely-mislabeled rows: cars priced like a different, rarer model.
 * The prototype's case: delivery-mile 2016 "GT3 RS" listings at $680k–$900k (911 R or mislabeled).
 * Extend here as new models are added; keep it data, not code, when it moves to valuation_config.
 */
export interface MislabelRule {
  years: [number, number];
  maxMiles: number;
  minPrice: number;
}
export const MISLABEL_RULES: Record<string, MislabelRule[]> = {
  // keyed by model slug
  "911-gt3-rs": [{ years: [2016, 2016], maxMiles: 500, minPrice: 600_000 }],
};

export function isLikelyMislabeled(
  modelSlug: string,
  row: { year: number | null; miles: number | null; price: number | null },
): boolean {
  const rules = MISLABEL_RULES[modelSlug] ?? [];
  return rules.some(
    (r) =>
      row.year != null &&
      row.year >= r.years[0] &&
      row.year <= r.years[1] &&
      row.miles != null &&
      row.miles <= r.maxMiles &&
      row.price != null &&
      row.price >= r.minPrice,
  );
}

export function classify(modelSlug: string, row: CleanInput): ExcludedReason | null {
  if (row.existing === "manual") return "manual";
  if (row.price == null || row.miles == null) return "incomplete";
  if (isLikelyMislabeled(modelSlug, row)) return "likely_mislabeled";
  if (row.genMedian != null && row.genMedian > 0) {
    if (row.price < OUTLIER_LO * row.genMedian || row.price > OUTLIER_HI * row.genMedian)
      return "outlier_price";
  }
  return null;
}
