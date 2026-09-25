import type {
  AuctionRow,
  AuctionStatus,
  GenerationStats,
  MarketSnapshot,
  MonthlyPoint,
} from "./types";

/**
 * Pure builder: plain rows (as loaded from Postgres) in, a MarketSnapshot out.
 * No I/O, no dates from the wall clock (pass `now`). Every statistic follows
 * spec section 4; medians throughout so a few bad rows cannot move a result.
 */

export interface BuildGeneration {
  id: string;
  code: string;
  name: string;
  yearStart: number;
  yearEnd: number;
  originalMsrp: number | null;
  engine: string | null;
  hp: string | null;
  gearbox: string | null;
  notes: string | null;
  packages: string[];
  sortOrder: number;
}

export interface BuildDealerSale {
  year: number | null;
  miles: number | null;
  price: number | null;
  color: string | null;
  isPts: boolean;
  packages: string[];
  state: string | null;
  daysOnMarket: number | null;
  soldDate: string | null; // YYYY-MM-DD
  generationId: string | null;
  excludedReason: string | null;
}

export interface BuildDealerActive {
  price: number | null;
  miles: number | null;
  generationId: string | null;
  year: number | null;
}

export interface BuildAuction {
  source: string;
  sourceId: string;
  url: string | null;
  year: number | null;
  miles: number | null;
  hammerPrice: number | null;
  status: AuctionStatus;
  endedAt: Date | string | null;
  packages: string[];
  generationId: string | null;
  excludedReason: string | null;
}

export interface SnapshotInput {
  make: { name: string; slug: string };
  model: { name: string; slug: string; shortName: string | null; parentLine: string | null };
  generations: BuildGeneration[];
  dealerSales: BuildDealerSale[];
  dealerActive: BuildDealerActive[];
  auctions: BuildAuction[];
  now: Date;
}

/* ---------- small numeric helpers (kept local so this module has no server deps) ---------- */

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

const r0 = (v: number | null | undefined): number =>
  v == null || !Number.isFinite(v) ? 0 : Math.round(v);
const DAY = 86_400_000;

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ym(d: Date): string {
  return d.toISOString().slice(0, 7);
}
function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function yearsLabel(a: number, b: number): string {
  return a === b ? String(a) : `${a} to ${b}`;
}

/** Trailing-window counts and medians for the 90-day change KPI. */
function window90(rows: { price: number; date: Date }[], now: Date) {
  const t90 = now.getTime() - 90 * DAY;
  const t180 = now.getTime() - 180 * DAY;
  const last = rows.filter((r) => r.date.getTime() > t90).map((r) => r.price);
  const prior = rows
    .filter((r) => r.date.getTime() > t180 && r.date.getTime() <= t90)
    .map((r) => r.price);
  return { last90: median(last), prior90: median(prior), n90: last.length, nPrior90: prior.length };
}

/** Mileage band edges chosen by how the generation actually trades. */
function bandEdges(miles: number[]): number[] {
  const m = median(miles) ?? 0;
  const candidates =
    m < 3_000 ? [500, 1_000, 2_500, 5_000, 10_000] : [2_500, 5_000, 10_000, 15_000, 20_000];
  const max = Math.max(...miles);
  return candidates.filter((e) => e < max);
}

const PTS = "Paint to Sample";

export function buildSnapshot(input: SnapshotInput): MarketSnapshot {
  const gens = [...input.generations].sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(gens.map((g) => [g.id, g]));
  const genForYear = (y: number | null) =>
    y == null ? undefined : gens.find((g) => y >= g.yearStart && y <= g.yearEnd);
  const codeOf = (generationId: string | null, year: number | null): string | null =>
    (generationId && byId.get(generationId)?.code) ?? genForYear(year)?.code ?? null;

  // Cleaned dealer sales with the fields every statistic needs.
  type Sale = {
    code: string | null;
    year: number | null;
    miles: number | null;
    price: number;
    color: string | null;
    isPts: boolean;
    state: string | null;
    dom: number | null;
    date: Date | null;
  };
  const sales: Sale[] = input.dealerSales
    .filter((r) => r.excludedReason == null && r.price != null && r.price > 0)
    .map((r) => ({
      code: codeOf(r.generationId, r.year),
      year: r.year,
      miles: r.miles,
      price: r.price as number,
      color: r.isPts ? PTS : r.color,
      isPts: r.isPts,
      state: r.state,
      dom: r.daysOnMarket,
      date: toDate(r.soldDate),
    }));
  const active = input.dealerActive.map((r) => ({
    code: codeOf(r.generationId, r.year),
    price: r.price,
    miles: r.miles,
  }));
  const auctionsAll = input.auctions
    .map((a) => ({ ...a, code: codeOf(a.generationId, a.year), ended: toDate(a.endedAt) }))
    .sort((a, b) => (b.ended?.getTime() ?? 0) - (a.ended?.getTime() ?? 0));
  const auctionsSold = auctionsAll.filter(
    (a) => a.status === "sold" && a.excludedReason == null && a.hammerPrice,
  );

  // Date bounds.
  const saleDates = sales.map((s) => s.date).filter((d): d is Date => d != null);
  const endDates = auctionsAll.map((a) => a.ended).filter((d): d is Date => d != null);
  const maxSale = saleDates.length
    ? new Date(Math.max(...saleDates.map((d) => d.getTime())))
    : null;
  const maxEnd = endDates.length ? new Date(Math.max(...endDates.map((d) => d.getTime()))) : null;
  const dataThroughDate =
    maxSale && maxEnd ? (maxSale > maxEnd ? maxSale : maxEnd) : (maxSale ?? maxEnd ?? input.now);
  const dealerSinceDate = saleDates.length
    ? new Date(Math.min(...saleDates.map((d) => d.getTime())))
    : dataThroughDate;
  const auctionSinceDate = endDates.length
    ? new Date(Math.min(...endDates.map((d) => d.getTime())))
    : dataThroughDate;

  // Per-generation stats.
  const generations: Record<string, GenerationStats> = {};
  const years: Record<string, number[]> = {};
  const dealerSales: MarketSnapshot["dealerSales"] = {};
  const milesBands: MarketSnapshot["milesBands"] = {};

  for (const g of gens) {
    const rows = sales.filter((s) => s.code === g.code);
    const prices = rows.map((r) => r.price);
    const miles = rows.map((r) => r.miles).filter((m): m is number => m != null);
    const n = rows.length;
    const thin = n < 30;
    const med = median(prices);
    const act = active.filter((a) => a.code === g.code);
    const dated = rows.filter((r): r is Sale & { date: Date } => r.date != null);
    const w = window90(dated, input.now);
    const msrp = g.originalMsrp ?? 0;
    generations[g.code] = {
      code: g.code,
      name: g.name,
      years: yearsLabel(g.yearStart, g.yearEnd),
      sold: n,
      active: act.length,
      median: r0(med),
      lo: r0(thin ? (prices.length ? Math.min(...prices) : 0) : percentile(prices, 0.25)),
      hi: r0(thin ? (prices.length ? Math.max(...prices) : 0) : percentile(prices, 0.75)),
      medianMiles: r0(median(miles)),
      msrp,
      multiple: msrp && med ? Math.round((med / msrp) * 100) / 100 : 0,
      daysToSell: r0(median(rows.map((r) => r.dom).filter((d): d is number => d != null))),
      activeMedian: r0(median(act.map((a) => a.price).filter((p): p is number => p != null))),
      activeMedianMiles: r0(median(act.map((a) => a.miles).filter((m): m is number => m != null))),
      last90: r0(w.last90 ?? med),
      prior90: r0(w.prior90 ?? w.last90 ?? med),
      n90: w.n90,
      nPrior90: w.nPrior90,
      thin,
      engine: g.engine ?? "",
      hp: g.hp ?? "",
      gearbox: g.gearbox ?? "",
      extra: g.notes,
      packages: g.packages,
    };
    years[g.code] = Array.from({ length: g.yearEnd - g.yearStart + 1 }, (_, i) => g.yearEnd - i);

    const pts = rows
      .filter((r): r is Sale & { miles: number } => r.miles != null)
      .map((r) => ({ miles: r.miles, price: r.price }));
    if (pts.length) dealerSales[g.code] = pts;

    if (pts.length >= 30) {
      const edges = bandEdges(pts.map((p) => p.miles));
      const bounds: [number, number | null][] = [];
      let from = 0;
      for (const e of edges) {
        bounds.push([from, e]);
        from = e;
      }
      bounds.push([from, null]);
      const bands = bounds
        .map(([lo, hi]) => {
          const inBand = pts.filter((p) => p.miles >= lo && (hi == null || p.miles < hi));
          return {
            from: lo,
            to: hi,
            n: inBand.length,
            median: r0(median(inBand.map((p) => p.price))),
          };
        })
        .filter((b) => b.n > 0);
      if (bands.length >= 2) milesBands[g.code] = bands;
    }
  }

  // Monthly trend: last 8 months ending at the data-through month.
  const lastMonth = addMonths(dataThroughDate, 0);
  const monthly: MonthlyPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = addMonths(lastMonth, -i);
    const end = addMonths(start, 1);
    const key = ym(start);
    const series: MonthlyPoint["series"] = {};
    for (const g of gens) {
      const inMonth = sales.filter(
        (s) => s.code === g.code && s.date && s.date >= start && s.date < end,
      );
      if (inMonth.length)
        series[g.code] = { n: inMonth.length, median: r0(median(inMonth.map((s) => s.price))) };
    }
    const partial =
      (i === 7 && dealerSinceDate > start) ||
      (i === 0 && dataThroughDate.getTime() < end.getTime() - DAY);
    monthly.push({ month: key, partial, series });
  }
  const chartSeries = gens
    .filter((g) => monthly.filter((m) => (m.series[g.code]?.n ?? 0) >= 3).length >= 3)
    .slice(0, 3)
    .map((g) => g.code);

  // By model year.
  const yearMap = new Map<number, Sale[]>();
  for (const s of sales)
    if (s.year != null) yearMap.set(s.year, [...(yearMap.get(s.year) ?? []), s]);
  const byYear = [...yearMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, rows]) => ({
      year,
      n: rows.length,
      median: r0(median(rows.map((r) => r.price))),
      medianMiles: r0(median(rows.map((r) => r.miles).filter((m): m is number => m != null))),
      generation: rows[0].code ?? genForYear(year)?.code ?? "",
    }));

  // Color premium for the headline generation.
  const head = gens[0]?.code;
  const colorMap = new Map<string, number[]>();
  for (const s of sales)
    if (s.code === head && s.color)
      colorMap.set(s.color, [...(colorMap.get(s.color) ?? []), s.price]);
  const colors = [...colorMap.entries()]
    .filter(([, p]) => p.length >= 5)
    .map(([color, p]) => ({ color, n: p.length, median: r0(median(p)) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  // Where they sell.
  const stateMap = new Map<string, number>();
  for (const s of sales) if (s.state) stateMap.set(s.state, (stateMap.get(s.state) ?? 0) + 1);
  const states = [...stateMap.entries()]
    .map(([state, n]) => ({ state, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  const recentDealerSales = sales
    .filter((s): s is Sale & { date: Date } => s.date != null && s.year != null)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 14)
    .map((s) => ({
      soldDate: ymd(s.date),
      year: s.year as number,
      color: s.color,
      miles: s.miles,
      price: s.price,
      state: s.state ?? "",
      generation: s.code ?? "",
    }));

  const auctions: AuctionRow[] = auctionsAll.map((a) => ({
    id: `${a.source}:${a.sourceId}`,
    endedAt: a.ended ? ymd(a.ended) : "",
    platform: a.source,
    status: a.status,
    price: a.hammerPrice ?? 0,
    year: a.year ?? 0,
    miles: a.miles ?? 0,
    weissach: a.packages.includes("weissach"),
    url: a.url ?? "",
    generation: a.code ?? "",
  }));

  return {
    make: input.make,
    model: {
      name: input.model.name,
      slug: input.model.slug,
      shortName: input.model.shortName ?? input.model.name,
      parentLine: input.model.parentLine ?? input.make.name,
    },
    dataThrough: ymd(dataThroughDate),
    dealerSince: ymd(dealerSinceDate),
    auctionSince: `${ym(auctionSinceDate)}-01`,
    totals: {
      dealerSales: sales.length,
      auctionSales: auctionsSold.length,
      activeNow: active.length,
    },
    order: gens.map((g) => g.code),
    chartSeries,
    years,
    generations,
    monthly,
    byYear,
    colors,
    milesBands,
    states,
    recentDealerSales,
    dealerSales,
    auctions,
  };
}
