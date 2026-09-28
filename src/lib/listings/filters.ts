/** Pure helpers for the Buy page filter drawer: what is set, and how to say it. */
import { mi, usd } from "@/lib/format/money";

export interface CarFilter {
  make?: string;
  model?: string;
  trim?: string;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  milesMin?: number;
  milesMax?: number;
}

export const CAR_FILTER_KEYS = [
  "make",
  "model",
  "trim",
  "yearMin",
  "yearMax",
  "priceMin",
  "priceMax",
  "milesMin",
  "milesMax",
] as const;

/** Human chips for the active filters, in display order. */
export function filterChips(f: CarFilter): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  if (f.make) out.push({ key: "make", label: f.make });
  if (f.model) out.push({ key: "model", label: f.model });
  if (f.trim) out.push({ key: "trim", label: f.trim });
  if (f.yearMin != null || f.yearMax != null)
    out.push({
      key: "year",
      label:
        f.yearMin != null && f.yearMax != null
          ? f.yearMin === f.yearMax
            ? String(f.yearMin)
            : `${f.yearMin}–${f.yearMax}`
          : f.yearMin != null
            ? `${f.yearMin} and newer`
            : `${f.yearMax} and older`,
    });
  if (f.priceMin != null || f.priceMax != null)
    out.push({
      key: "price",
      label:
        f.priceMin != null && f.priceMax != null
          ? `${usd(f.priceMin)} to ${usd(f.priceMax)}`
          : f.priceMin != null
            ? `${usd(f.priceMin)} and up`
            : `Under ${usd(f.priceMax!)}`,
    });
  if (f.milesMin != null || f.milesMax != null)
    out.push({
      key: "miles",
      label:
        f.milesMin != null && f.milesMax != null
          ? `${mi(f.milesMin)} to ${mi(f.milesMax)} mi`
          : f.milesMin != null
            ? `${mi(f.milesMin)}+ mi`
            : `Under ${mi(f.milesMax!)} mi`,
    });
  return out;
}

/** Keys to drop from the query string when a chip is removed. */
export function keysForChip(key: string): string[] {
  switch (key) {
    case "year":
      return ["yearMin", "yearMax"];
    case "price":
      return ["priceMin", "priceMax"];
    case "miles":
      return ["milesMin", "milesMax"];
    default:
      return [key];
  }
}

export function countActive(f: CarFilter): number {
  return filterChips(f).length;
}
