export const usd = (v: number | null | undefined) =>
  v == null ? "n/a" : "$" + Math.round(v).toLocaleString("en-US");
export const usdK = (v: number) => "$" + Math.round(v / 1000) + "k";
export const mi = (v: number | null | undefined) =>
  v == null ? "n/a" : Math.round(v).toLocaleString("en-US");
export const fmtDate = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
