/** Pure statistics helpers used by aggregation and cleaning. */

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Linear-interpolated percentile, p in [0,1]. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

export interface Aggregate {
  n: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  medianMiles: number | null;
}

export function aggregate(rows: { price: number | null; miles: number | null }[]): Aggregate {
  const prices = rows.map((r) => r.price).filter((p): p is number => p != null);
  const miles = rows.map((r) => r.miles).filter((m): m is number => m != null);
  const r = (v: number | null) => (v == null ? null : Math.round(v));
  return {
    n: prices.length,
    median: r(median(prices)),
    p25: r(percentile(prices, 0.25)),
    p75: r(percentile(prices, 0.75)),
    medianMiles: r(median(miles)),
  };
}
