import type { MarketTree, NodeStats } from "./tree";

/** One entry on the market ticker strip. */
export interface TickerItem {
  kind: "index" | "segment" | "model" | "sale";
  label: string;
  /** The number shown in bold: a price, or the index level. */
  value: string;
  /** 90-day change as a fraction; null when there is no read. */
  change: number | null;
  /** Small trailing text, e.g. the platform a car sold on. */
  note?: string;
  href: string;
}

export interface TickerSale {
  title: string;
  price: number;
  sourceName: string;
  href: string;
  /** True when the car is matched to a catalog model (preferred: collector stock). */
  catalogued: boolean;
}

/** A model needs this many sales behind its 90-day change to appear as a mover. */
export const TICKER_MIN_N90 = 10;
/** A 90-day move beyond this is almost always a mix shift or a thin prior window, not news. */
export const TICKER_MAX_MOVE = 0.3;
export const TICKER_MOVERS = 8;
export const TICKER_SALES = 8;
/** A sale below this only makes the strip when the car is a catalogued collector model. */
export const TICKER_SALE_FLOOR = 25_000;

const usd = (v: number) => "$" + Math.round(v).toLocaleString("en-US");

/** "▲ 4.1%" or "▼ 2.3%"; the arrow carries the sign so the text reads at a glance. */
export function fmtChange(change: number): string {
  return `${change >= 0 ? "▲" : "▼"} ${Math.abs(change * 100).toFixed(1)}%`;
}

function latestIndex(stats: NodeStats): number | null {
  for (let i = stats.trend.length - 1; i >= 0; i--) {
    const v = stats.trend[i]!.index;
    if (v != null) return v;
  }
  return null;
}

/**
 * The strip's entries, in display order: the UrCar index, then segments, the biggest model
 * movers and the latest sales woven together so the eye never sees three of a kind in a row.
 */
export function buildTickerItems(input: {
  tree: MarketTree;
  national: NodeStats;
  sales: TickerSale[];
}): TickerItem[] {
  const { tree, national, sales } = input;
  const out: TickerItem[] = [];
  const index = latestIndex(national);
  if (index != null) {
    out.push({
      kind: "index",
      label: "UrCar Market Index",
      value: index.toFixed(1),
      change: national.change90,
      href: "/markets",
    });
  }

  const segments: TickerItem[] = tree.segments
    .filter((s) => s.stats && s.stats.medianPrice != null && s.key !== "other")
    .map((s) => ({
      kind: "segment" as const,
      label: s.short,
      value: usd(s.stats!.medianPrice!),
      change: s.stats!.change90,
      href: `/markets/${s.key}`,
    }));

  const movers: TickerItem[] = tree.segments
    .flatMap((s) => s.makes.flatMap((m) => m.models))
    .filter(
      (m) =>
        m.headline > 0 &&
        m.stats.change90 != null &&
        Math.abs(m.stats.change90) <= TICKER_MAX_MOVE &&
        m.stats.n90 >= TICKER_MIN_N90,
    )
    .sort((a, b) => Math.abs(b.stats.change90!) - Math.abs(a.stats.change90!))
    .slice(0, TICKER_MOVERS)
    .map((m) => ({
      kind: "model" as const,
      label: `${m.make.name} ${m.model.name}`,
      value: usd(m.headline),
      change: m.stats.change90,
      href: `/${m.make.slug}/${m.model.slug}`,
    }));

  const sold: TickerItem[] = sales
    .filter((s) => s.catalogued || s.price >= TICKER_SALE_FLOOR)
    .sort((a, b) => Number(b.catalogued) - Number(a.catalogued))
    .slice(0, TICKER_SALES)
    .map((s) => ({
      kind: "sale" as const,
      label: `Sold · ${s.title.length > 48 ? s.title.slice(0, 47).trimEnd() + "…" : s.title}`,
      value: usd(s.price),
      change: null,
      note: s.sourceName,
      href: s.href,
    }));

  // Weave: segment, mover, sale, repeat; leftovers follow in order.
  const queues = [segments, movers, sold];
  while (queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
    }
  }
  return out;
}
