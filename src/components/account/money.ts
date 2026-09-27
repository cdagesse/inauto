export const usd = (v: number | null | undefined) =>
  v == null ? "n/a" : "$" + Math.round(v).toLocaleString("en-US");
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
export const mi = (v: number | null | undefined) =>
  v == null ? "n/a" : Math.round(v).toLocaleString("en-US");
export const fmtDate = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
