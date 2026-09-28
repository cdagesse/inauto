/**
 * Shared display formatters for money, miles and dates. Pure, safe in client and
 * server trees. Every UI and message string should format through these so the
 * copies never drift.
 */

/** Whole US dollars: 20250 → "$20,250"; null → "n/a". */
export const usd = (v: number | null | undefined) =>
  v == null ? "n/a" : "$" + Math.round(v).toLocaleString("en-US");
/** Thousands shorthand for chart ticks and medians: 20250 → "$20k". */
export const usdK = (v: number) => "$" + Math.round(v / 1000) + "k";
/** Whole-unit amount in its own currency: USD → "$20,250", GBP → "£20,250", others → "CHF 20,250". */
export const money = (v: number | null | undefined, currency: string | null | undefined) => {
  if (v == null) return "n/a";
  const c = (currency ?? "USD").toUpperCase();
  if (c === "USD") return usd(v);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: c,
      maximumFractionDigits: 0,
      currencyDisplay: "narrowSymbol",
    }).format(Math.round(v));
  } catch {
    return `${c} ${Math.round(v).toLocaleString("en-US")}`;
  }
};
export const isUsd = (currency: string | null | undefined) =>
  (currency ?? "USD").toUpperCase() === "USD";
/** Miles with thousands separators and no unit: 48210 → "48,210"; null → "n/a". */
export const mi = (v: number | null | undefined) =>
  v == null ? "n/a" : Math.round(v).toLocaleString("en-US");
/** "Mar 4, 2026, 3:05 PM EDT" style timestamp in New York time, or "" when missing. */
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
        timeZoneName: "short",
      })
    : "";
/** "Mar 4, 2026" style date, or "" when missing. */
/** "Sep 28, 2026" in New York time, so server and browser print the same day. */
export const fmtDate = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York",
      })
    : "";

/** "Sep 28" within the current year, "Sep 28, 2025" otherwise; New York time, for cards. */
export function fmtDay(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return "";
  const date = new Date(d);
  const sameYear =
    date.toLocaleDateString("en-US", { year: "numeric", timeZone: "America/New_York" }) ===
    now.toLocaleDateString("en-US", { year: "numeric", timeZone: "America/New_York" });
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "America/New_York",
  });
}
