import type { PriceVerdict } from "@/lib/valuation/types";

export function verdictLabel(v: PriceVerdict) {
  return {
    too_low: "Priced too low",
    low: "Below market",
    fair: "Fairly priced",
    high: "Above market",
    too_high: "Priced too high",
  }[v];
}
export function verdictClass(v: PriceVerdict) {
  return v === "fair" ? "up" : v === "too_high" || v === "too_low" ? "down" : "";
}
