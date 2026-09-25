/** Pure sanity checks run after aggregation. They warn; they never block publishing. */

export interface CheckInput {
  generationCode: string;
  channel: "dealer" | "auction";
  todayN: number;
  yesterdayN: number | null;
  todayMedian: number | null;
  yesterdayMedian: number | null;
  excludedShare: number; // 0..1 share of rows excluded for this generation
}

export interface CheckWarning {
  generationCode: string;
  channel: string;
  kind: "median_moved" | "high_excluded_share" | "row_count_drop";
  detail: string;
}

export const MEDIAN_MOVE_THRESHOLD = 0.15;
export const EXCLUDED_SHARE_THRESHOLD = 0.25;

export function runChecks(inputs: CheckInput[]): CheckWarning[] {
  const out: CheckWarning[] = [];
  for (const c of inputs) {
    if (c.todayMedian != null && c.yesterdayMedian != null && c.yesterdayMedian > 0) {
      const move = Math.abs(c.todayMedian - c.yesterdayMedian) / c.yesterdayMedian;
      if (move > MEDIAN_MOVE_THRESHOLD) {
        out.push({
          generationCode: c.generationCode,
          channel: c.channel,
          kind: "median_moved",
          detail: `median moved ${(move * 100).toFixed(1)}% (${c.yesterdayMedian} -> ${c.todayMedian})`,
        });
      }
    }
    if (c.excludedShare > EXCLUDED_SHARE_THRESHOLD) {
      out.push({
        generationCode: c.generationCode,
        channel: c.channel,
        kind: "high_excluded_share",
        detail: `${(c.excludedShare * 100).toFixed(0)}% of rows excluded`,
      });
    }
    if (c.yesterdayN != null && c.yesterdayN > 0 && c.todayN < c.yesterdayN) {
      out.push({
        generationCode: c.generationCode,
        channel: c.channel,
        kind: "row_count_drop",
        detail: `row count fell from ${c.yesterdayN} to ${c.todayN}`,
      });
    }
  }
  return out;
}
