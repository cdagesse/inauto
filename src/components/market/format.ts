export const usd = (v: number | null | undefined) =>
  v == null ? "n/a" : "$" + Math.round(v).toLocaleString("en-US");
export const usdK = (v: number) => "$" + Math.round(v / 1000) + "k";
export const mi = (v: number | null | undefined) =>
  v == null ? "n/a" : Math.round(v).toLocaleString("en-US");
export const MON = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export const monthLabel = (m: string) => MON[+m.slice(5, 7) - 1];
export const dayLabel = (d: string) => `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
export const longDate = (d: string) => `${dayLabel(d)}, ${d.slice(0, 4)}`;

export function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((s) => span / s <= n) || mag * 10;
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const t: number[] = [];
  for (let v = a; v <= b + 1e-9; v += step) t.push(v);
  return t;
}

export function median(a: number[]): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Series color token by chart index, matching the prototype (--s1, --s2, --s3). */
export const seriesVar = (i: number) => `var(--s${(i % 3) + 1})`;
