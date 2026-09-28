/**
 * The Markets drill-down: segments → makes → models, each with volume and
 * price trends aggregated from model snapshots. Pure and serializable.
 *
 * Price trend is an index, not a dollar figure: every generation's monthly
 * median is expressed relative to that generation's overall median (100),
 * then averaged weighted by sales. That lets a segment mix a $30k Miata
 * with a $500k GT3 RS without the mix swamping the signal.
 */
import { SEGMENTS, type Segment, segmentForMake } from "@/data/segments";
import type { MarketSnapshot } from "./types";

/** What the tree needs from a snapshot; stored summaries satisfy it. */
export type TreeSnapshot = Pick<
  MarketSnapshot,
  "make" | "model" | "dataThrough" | "totals" | "order" | "generations" | "monthly"
>;

export interface TrendPoint {
  month: string; // YYYY-MM
  partial: boolean;
  /** Dealer sales in the month. */
  n: number;
  /** Sales-weighted price index, 100 = each generation's overall median. Null when no sales. */
  index: number | null;
}

export interface NodeStats {
  models: number;
  dealerSales: number;
  auctionSales: number;
  activeNow: number;
  /** Median of the models' headline (latest generation) medians. */
  medianPrice: number | null;
  /** Sales-weighted 90-day change across generations. Null without enough data. */
  change90: number | null;
  n90: number;
  trend: TrendPoint[];
}

export interface ModelNode {
  make: { name: string; slug: string };
  model: { name: string; slug: string; shortName: string };
  headline: number;
  stats: NodeStats;
}

export interface MakeNode {
  name: string;
  slug: string;
  segment: string;
  stats: NodeStats | null;
  models: ModelNode[];
  /** Published catalog models, including those without a report yet. */
  catalogModels: number;
}

export interface SegmentNode extends Omit<Segment, "makes"> {
  stats: NodeStats | null;
  makes: MakeNode[];
  catalogMakes: number;
  catalogModels: number;
}

export interface CatalogMakeCount {
  slug: string;
  name: string;
  models: number;
  ready: number;
}

export interface MarketTree {
  segments: SegmentNode[];
  months: string[];
  dataThrough: string | null;
}

export const TREND_MONTHS = 8;

function median(a: number[]): number | null {
  if (a.length === 0) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function headlineOf(s: TreeSnapshot): number {
  const first = s.order.map((c) => s.generations[c]).find((g) => g && g.median > 0);
  return first?.median ?? 0;
}

/** Union of months across snapshots, sorted, trimmed to the last TREND_MONTHS. */
export function monthAxis(snapshots: TreeSnapshot[]): string[] {
  const set = new Set<string>();
  for (const s of snapshots) for (const m of s.monthly) set.add(m.month);
  return [...set].sort().slice(-TREND_MONTHS);
}

export function aggregate(snapshots: TreeSnapshot[], months: string[]): NodeStats {
  let dealerSales = 0;
  let auctionSales = 0;
  let activeNow = 0;
  const heads: number[] = [];
  let chgNum = 0;
  let chgDen = 0;
  const byMonth = new Map<
    string,
    { n: number; idxNum: number; idxDen: number; partial: boolean }
  >();
  for (const m of months) byMonth.set(m, { n: 0, idxNum: 0, idxDen: 0, partial: false });

  for (const s of snapshots) {
    dealerSales += s.totals.dealerSales;
    auctionSales += s.totals.auctionSales;
    activeNow += s.totals.activeNow;
    const h = headlineOf(s);
    if (h > 0) heads.push(h);
    for (const code of s.order) {
      const g = s.generations[code];
      if (!g) continue;
      if (g.n90 > 0 && g.prior90 > 0 && g.last90 > 0) {
        chgNum += g.n90 * ((g.last90 - g.prior90) / g.prior90);
        chgDen += g.n90;
      }
    }
    for (const p of s.monthly) {
      const slot = byMonth.get(p.month);
      if (!slot) continue;
      if (p.partial) slot.partial = true;
      for (const [code, v] of Object.entries(p.series)) {
        const base = s.generations[code]?.median ?? 0;
        slot.n += v.n;
        if (base > 0 && v.median > 0) {
          slot.idxNum += v.n * (v.median / base) * 100;
          slot.idxDen += v.n;
        }
      }
    }
  }
  const trend: TrendPoint[] = months.map((month) => {
    const v = byMonth.get(month)!;
    return {
      month,
      partial: v.partial,
      n: v.n,
      index: v.idxDen > 0 ? Math.round((v.idxNum / v.idxDen) * 10) / 10 : null,
    };
  });
  return {
    models: snapshots.length,
    dealerSales,
    auctionSales,
    activeNow,
    medianPrice: median(heads),
    change90: chgDen > 0 ? chgNum / chgDen : null,
    n90: chgDen,
    trend,
  };
}

function byVolume<T extends { stats: NodeStats | null; name?: string }>(a: T, b: T) {
  const va = a.stats?.dealerSales ?? -1;
  const vb = b.stats?.dealerSales ?? -1;
  if (vb !== va) return vb - va;
  return (a.name ?? "").localeCompare(b.name ?? "");
}

export function buildMarketTree(
  snapshots: TreeSnapshot[],
  catalog: CatalogMakeCount[],
): MarketTree {
  const months = monthAxis(snapshots);
  const dataThrough = snapshots.reduce<string | null>(
    (acc, s) => (acc == null || s.dataThrough > acc ? s.dataThrough : acc),
    null,
  );

  // Every catalog make gets a node, with or without data.
  const makeNodes = new Map<string, MakeNode & { snaps: TreeSnapshot[] }>();
  for (const c of catalog) {
    makeNodes.set(c.slug, {
      name: c.name,
      slug: c.slug,
      segment: segmentForMake(c.slug).key,
      stats: null,
      models: [],
      catalogModels: c.models,
      snaps: [],
    });
  }
  for (const s of snapshots) {
    let node = makeNodes.get(s.make.slug);
    if (!node) {
      node = {
        name: s.make.name,
        slug: s.make.slug,
        segment: segmentForMake(s.make.slug).key,
        stats: null,
        models: [],
        catalogModels: 0,
        snaps: [],
      };
      makeNodes.set(s.make.slug, node);
    }
    node.snaps.push(s);
    node.models.push({
      make: s.make,
      model: { name: s.model.name, slug: s.model.slug, shortName: s.model.shortName },
      headline: headlineOf(s),
      stats: aggregate([s], months),
    });
  }
  for (const node of makeNodes.values()) {
    if (node.snaps.length) node.stats = aggregate(node.snaps, months);
    node.models.sort(byVolume);
    if (node.catalogModels < node.models.length) node.catalogModels = node.models.length;
  }

  const segments: SegmentNode[] = SEGMENTS.map((seg) => {
    const makes = [...makeNodes.values()].filter((m) => m.segment === seg.key).sort(byVolume);
    const snaps = makes.flatMap((m) => m.snaps);
    return {
      key: seg.key,
      name: seg.name,
      short: seg.short,
      blurb: seg.blurb,
      stats: snaps.length ? aggregate(snaps, months) : null,
      makes: makes.map((m) => ({
        name: m.name,
        slug: m.slug,
        segment: m.segment,
        stats: m.stats,
        models: m.models,
        catalogModels: m.catalogModels,
      })),
      catalogMakes: makes.length,
      catalogModels: makes.reduce((a, m) => a + m.catalogModels, 0),
    };
  })
    .filter((s) => s.key !== "other" || s.makes.length > 0)
    .sort((a, b) => {
      if (a.key === "other") return 1;
      if (b.key === "other") return -1;
      return byVolume(a, b);
    });

  return { segments, months, dataThrough };
}
