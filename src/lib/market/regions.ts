import { REGIONS } from "@/data/regions";
import { segmentForMake } from "@/data/segments";

/** Sales window: the last 90 days, or the 90 before them. */
export type SalesWindow = "last" | "prior";

/** One (region, model, window) group of dealer sales, as the query returns it. */
export interface RegionSaleRow {
  region: string;
  make: string;
  makeName: string;
  modelId: string;
  win: SalesWindow;
  n: number;
  median: number;
  /** Median days on market, when the rows carried one. */
  dom: number | null;
}

/** Sold auctions in a region over the last 90 days. */
export interface RegionAuctionRow {
  region: string;
  n: number;
  median: number | null;
}

export interface RegionInput {
  sales: RegionSaleRow[];
  auctions: RegionAuctionRow[];
  dataThrough: string | null;
}

/** A model needs this many sales in both windows before it counts toward a price change. */
export const MIN_MODEL_SALES = 3;
/** Sales-weighted count behind a price change before it is shown. */
export const MIN_READ_SALES = 10;

/** How a group of models moved over the last 90 days against the 90 before. */
export interface Movement {
  sales90: number;
  prior90: number;
  /** Change in sales count, or null when the prior window had none. */
  volumeChange: number | null;
  /** Sales-weighted change in each model's median price, or null on too few sales. */
  priceChange: number | null;
  /** Sales behind the price change. */
  n90: number;
  /** Typical days to sell in the last 90 days, or null when unknown. */
  daysToSell: number | null;
  /** Typical sale price in the last 90 days: sales-weighted median of model medians. */
  medianPrice: number | null;
}

export interface TypeInRegion extends Movement {
  key: string;
  name: string;
  short: string;
  /** Share of the region's last-90-day sales. */
  share: number;
}

export interface MakeInRegion extends Movement {
  slug: string;
  name: string;
  segment: string;
}

export interface RegionStats extends Movement {
  key: string;
  name: string;
  short: string;
  blurb: string;
  states: string[];
  /** Share of national last-90-day dealer sales. */
  share: number;
  auctionSales90: number;
  auctionMedian: number | null;
  /** Segments ranked by sales in the region. */
  types: TypeInRegion[];
  /** Type with the biggest price gain, and the biggest loss, among those with a read. */
  strongest: TypeInRegion | null;
  softest: TypeInRegion | null;
  /** Top makes by sales in the region. */
  makes: MakeInRegion[];
}

export interface RegionsOverview {
  dataThrough: string | null;
  national: Movement;
  regions: RegionStats[];
}

const TOP_MAKES = 8;

function weightedMedian(pairs: { value: number; weight: number }[]): number | null {
  const rows = pairs.filter((p) => p.weight > 0).sort((a, b) => a.value - b.value);
  const total = rows.reduce((a, p) => a + p.weight, 0);
  if (!total) return null;
  let acc = 0;
  for (const p of rows) {
    acc += p.weight;
    if (acc >= total / 2) return p.value;
  }
  return rows[rows.length - 1]?.value ?? null;
}

/** Two groups of the same model and window, combined: counts add, medians average by count. */
function merge(a: RegionSaleRow, b: RegionSaleRow): RegionSaleRow {
  const n = a.n + b.n;
  const domA = a.dom != null ? a.dom * a.n : null;
  const domB = b.dom != null ? b.dom * b.n : null;
  const domN = (a.dom != null ? a.n : 0) + (b.dom != null ? b.n : 0);
  return {
    ...a,
    n,
    median: n > 0 ? (a.median * a.n + b.median * b.n) / n : 0,
    dom: domN > 0 ? ((domA ?? 0) + (domB ?? 0)) / domN : null,
  };
}

/** Movement for a set of rows that all belong to one group (region, type or make). */
export function movement(rows: RegionSaleRow[]): Movement {
  // A model can appear once per region and window; a national or type-wide read merges them.
  const byModel = new Map<string, { last?: RegionSaleRow; prior?: RegionSaleRow }>();
  for (const r of rows) {
    const slot = byModel.get(r.modelId) ?? {};
    const have = slot[r.win];
    slot[r.win] = have ? merge(have, r) : r;
    byModel.set(r.modelId, slot);
  }
  let sales90 = 0;
  let prior90 = 0;
  let num = 0;
  let den = 0;
  let domNum = 0;
  let domDen = 0;
  const medians: { value: number; weight: number }[] = [];
  for (const { last, prior } of byModel.values()) {
    if (last) {
      sales90 += last.n;
      medians.push({ value: last.median, weight: last.n });
      if (last.dom != null) {
        domNum += last.dom * last.n;
        domDen += last.n;
      }
    }
    if (prior) prior90 += prior.n;
    if (
      last &&
      prior &&
      last.n >= MIN_MODEL_SALES &&
      prior.n >= MIN_MODEL_SALES &&
      last.median > 0 &&
      prior.median > 0
    ) {
      num += last.n * (last.median / prior.median - 1);
      den += last.n;
    }
  }
  return {
    sales90,
    prior90,
    volumeChange: prior90 > 0 ? (sales90 - prior90) / prior90 : null,
    priceChange: den >= MIN_READ_SALES ? num / den : null,
    n90: den,
    daysToSell: domDen > 0 ? Math.round(domNum / domDen) : null,
    medianPrice: weightedMedian(medians),
  };
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/** Regions, their types and makes, from grouped dealer sales and auction counts. */
export function aggregateRegions(input: RegionInput): RegionsOverview {
  const known = new Set(REGIONS.map((r) => r.key));
  const sales = input.sales.filter((r) => known.has(r.region) && r.n > 0);
  const national = movement(sales);
  const byRegion = groupBy(sales, (r) => r.region);
  const auctions = new Map(input.auctions.map((a) => [a.region, a]));

  const regions: RegionStats[] = REGIONS.map((region) => {
    const rows = byRegion.get(region.key) ?? [];
    const m = movement(rows);
    const types: TypeInRegion[] = [...groupBy(rows, (r) => segmentForMake(r.make).key).entries()]
      .map(([key, typeRows]) => {
        const seg = segmentForMake(typeRows[0]?.make ?? "");
        const tm = movement(typeRows);
        return {
          key,
          name: seg.name,
          short: seg.short,
          share: m.sales90 > 0 ? tm.sales90 / m.sales90 : 0,
          ...tm,
        };
      })
      .filter((t) => t.sales90 > 0)
      .sort((a, b) => b.sales90 - a.sales90 || a.name.localeCompare(b.name));
    const read = types.filter((t) => t.priceChange != null);
    const strongest = read.length
      ? read.reduce((a, b) => ((b.priceChange ?? 0) > (a.priceChange ?? 0) ? b : a))
      : null;
    const softestCandidate = read.length
      ? read.reduce((a, b) => ((b.priceChange ?? 0) < (a.priceChange ?? 0) ? b : a))
      : null;
    const softest = softestCandidate && softestCandidate !== strongest ? softestCandidate : null;
    const makes: MakeInRegion[] = [...groupBy(rows, (r) => r.make).entries()]
      .map(([slug, makeRows]) => ({
        slug,
        name: makeRows[0]?.makeName ?? slug,
        segment: segmentForMake(slug).key,
        ...movement(makeRows),
      }))
      .filter((mk) => mk.sales90 > 0)
      .sort((a, b) => b.sales90 - a.sales90 || a.name.localeCompare(b.name))
      .slice(0, TOP_MAKES);
    const auction = auctions.get(region.key);
    return {
      ...region,
      ...m,
      share: national.sales90 > 0 ? m.sales90 / national.sales90 : 0,
      auctionSales90: auction?.n ?? 0,
      auctionMedian: auction?.median ?? null,
      types,
      strongest,
      softest,
      makes,
    };
  }).sort((a, b) => b.sales90 - a.sales90 || a.name.localeCompare(b.name));

  return { dataThrough: input.dataThrough, national, regions };
}
