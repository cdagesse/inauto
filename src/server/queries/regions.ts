import "server-only";
import { sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { auctionResults, dealerSales, makes, models } from "@/db/schema";
import { stateSpellings } from "@/data/regions";
import { effectiveSoldDate } from "@/lib/market/queries";
import type { RegionAuctionRow, RegionInput, RegionSaleRow } from "@/lib/market/regions";

/** Both windows the regions compare: the last 90 days against the 90 before. */
export const REGION_WINDOW_DAYS = 90;

function rowsOf<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[];
}

/** VALUES list mapping every state spelling to its region key, for a join. */
function regionValues() {
  return sql.join(
    stateSpellings().map((p) => sql`(${p.spelling}, ${p.region})`),
    sql`, `,
  );
}

/** A stored state the way normalizeState() reads it: trimmed, upper-cased, periods dropped. */
const stateKey = (col: SQLWrapper) => sql`upper(replace(trim(${col}), '.', ''))`;

interface SaleRow {
  region: string;
  make: string;
  makeName: string;
  modelId: string;
  win: "last" | "prior";
  n: number;
  domN: number;
  median: number | string | null;
  dom: number | string | null;
}

interface AuctionRow {
  region: string;
  n: number;
  median: number | string | null;
}

const num = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/**
 * Dealer sales of the last 180 days grouped by region, model and window, plus sold
 * auctions per region for the last 90 days. Sales are dated the way the snapshots date
 * them (sold date, else listed date plus days on market, else fetch date). Rows without
 * a recognisable US state are left out, as are auctions outside the US or not in dollars.
 */
export async function loadRegionInput(): Promise<RegionInput> {
  const last = sql.raw(String(REGION_WINDOW_DAYS));
  const span = sql.raw(String(REGION_WINDOW_DAYS * 2));
  const [salesRes, auctionRes, throughRes] = await Promise.all([
    db.execute(sql`
      with region(state, key) as (values ${regionValues()})
      select r.key as region, ${makes.slug} as make, ${makes.name} as "makeName",
        ${dealerSales.modelId} as "modelId",
        case when ${effectiveSoldDate} > current_date - ${last} then 'last' else 'prior' end as win,
        count(*)::int as n,
        count(${dealerSales.daysOnMarket})::int as "domN",
        (percentile_cont(0.5) within group (order by ${dealerSales.price}))::float8 as median,
        (percentile_cont(0.5) within group (order by ${dealerSales.daysOnMarket}))::float8 as dom
      from ${dealerSales}
      join region r on r.state = ${stateKey(dealerSales.state)}
      join ${models} on ${models.id} = ${dealerSales.modelId}
      join ${makes} on ${makes.id} = ${models.makeId}
      where ${dealerSales.excludedReason} is null and ${dealerSales.price} > 0
        and ${effectiveSoldDate} > current_date - ${span}
        and ${effectiveSoldDate} <= current_date
      group by 1, 2, 3, 4, 5
    `),
    db.execute(sql`
      with region(state, key) as (values ${regionValues()})
      select r.key as region, count(*)::int as n,
        (percentile_cont(0.5) within group (order by ${auctionResults.hammerPrice}))::float8 as median
      from ${auctionResults}
      join region r on r.state = ${stateKey(sql`${auctionResults.rawJson}->>'state'`)}
      where ${auctionResults.status} = 'sold' and ${auctionResults.excludedReason} is null
        and ${auctionResults.hammerPrice} > 0
        and ${auctionResults.endedAt} > now() - interval '90 days'
        and coalesce(upper(${auctionResults.rawJson}->>'country_code'), 'US') = 'US'
        and coalesce(upper(${auctionResults.rawJson}->>'currency'), 'USD') = 'USD'
      group by 1
    `),
    db.execute(sql`
      select max(${effectiveSoldDate})::text as through
      from ${dealerSales}
      where ${dealerSales.excludedReason} is null and ${effectiveSoldDate} <= current_date
    `),
  ]);
  const sales: RegionSaleRow[] = rowsOf<SaleRow>(salesRes).map((r) => ({
    region: r.region,
    make: r.make,
    makeName: r.makeName,
    modelId: r.modelId,
    win: r.win,
    n: Number(r.n),
    domN: Number(r.domN),
    median: num(r.median) ?? 0,
    dom: num(r.dom),
  }));
  const auctions: RegionAuctionRow[] = rowsOf<AuctionRow>(auctionRes).map((r) => ({
    region: r.region,
    n: Number(r.n),
    median: num(r.median),
  }));
  const through = rowsOf<{ through: string | null }>(throughRes)[0]?.through ?? null;
  return { sales, auctions, dataThrough: through };
}
