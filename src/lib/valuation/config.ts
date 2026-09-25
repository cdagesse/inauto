/**
 * Every tunable number in the valuation engine. Keys mirror the
 * `valuation_config` table (spec section 5) so DB rows can override these
 * defaults per model or generation without a code change.
 */
export type ValuationConfig = Record<string, number>;

export const DEFAULT_CONFIG: ValuationConfig = {
  // Step 2: multiplicative adjustments
  "adj.package.weissach.992": 0.03,
  "adj.package.weissach.991.2": 0.06,
  "adj.color.spec": 0.06,
  "adj.color.pts": 0.12,
  "adj.condition.good": -0.06,
  "adj.condition.fair": -0.15,
  "adj.history.acc": -0.18,

  // Step 1: curve fitting thresholds and thin-sample path
  "fit.min_sales": 30,
  "fit.miles_offset": 250,
  "thin.year_min_sales": 5,
  "thin.miles_elasticity": -0.06,
  "thin.lo": 0.8,
  "thin.hi": 1.2,

  // Step 3: online auction
  "auction.gap_default": -0.08,
  "auction.gap_min_sales": 3,
  "auction.reserve_pct": 0.93,
  "auction.buyer_pct": 0.05,
  "auction.buyer_min": 250,
  "auction.buyer_cap": 7500,
  "auction.listing_fee": 349,
  "auction.prep": 1500,

  // Step 3: sell to a dealer
  "dealer.base": 0.08,
  "dealer.per_dom": 0.001,
  "dealer.thin": 0.04,
  "dealer.range_lo": 0.97,
  "dealer.range_hi": 1.02,

  // Step 3: list it yourself
  "private.ask": 1.04,
  "private.sale": 0.99,
  "private.cost": 1000,
  "private.days_multiple": 2,

  // Step 4: recommendation threshold
  "rec.min_abs": 5000,
  "rec.min_pct": 0.03,

  // Step 5: comps
  "comps.max_auction": 4,
  "comps.total": 7,
};

export function resolveConfig(overrides?: Partial<ValuationConfig> | null): ValuationConfig {
  const cfg: ValuationConfig = { ...DEFAULT_CONFIG };
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (typeof v === "number" && Number.isFinite(v)) cfg[k] = v;
    }
  }
  return cfg;
}

/**
 * Model years priced off a different year. Keyed by `${generation}:${year}`.
 * Example: the 2011 997.2 sample is dominated by RS 4.0 cars, so a standard
 * 2011 is priced off 2010 sales and the UI shows the RS 4.0 note.
 */
export interface YearOverride {
  useYear: number;
  note: string;
}

export const yearOverrides: Record<string, YearOverride> = {
  "997.2:2011": {
    useYear: 2010,
    note: "This estimate is for the 3.8 L car. A 2011 RS 4.0 (600 built) trades at $600,000 and up and needs a specialist appraisal.",
  },
};

export function yearOverride(generation: string, year: number): YearOverride | null {
  return yearOverrides[`${generation}:${year}`] ?? null;
}
