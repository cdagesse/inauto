/** Pure helpers for the listing-page market summary; kept out of the client component so they are unit-testable. */

/** Generation for a car: the matched code when valid, else the one whose year list contains the model year. */
export function generationFor(
  years: Record<string, number[]>,
  matched: string | null | undefined,
  year: number | null | undefined,
  fallback: string,
): string {
  if (matched && years[matched]) return matched;
  if (year != null) {
    for (const [code, ys] of Object.entries(years)) if (ys.includes(year)) return code;
  }
  return fallback;
}

export type DeltaDirection = "under" | "over" | "at";

/** "Current bid is 8% under our market value", with the direction for colouring. */
export function priceDelta(
  price: number | null | undefined,
  marketValue: number,
  label: string,
): { pct: number; direction: DeltaDirection; text: string } | null {
  if (price == null || price <= 0 || marketValue <= 0) return null;
  const pct = (price - marketValue) / marketValue;
  const abs = Math.abs(Math.round(pct * 100));
  const direction: DeltaDirection = pct < -0.005 ? "under" : pct > 0.005 ? "over" : "at";
  const text =
    direction === "at"
      ? `${label} is right at our market value`
      : `${label} is ${abs}% ${direction} our market value`;
  return { pct, direction, text };
}

/** Packages we can infer from free text (a listing title or trim line). */
export function packagesFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  if (/weissach/i.test(text)) out.push("weissach");
  return out;
}
