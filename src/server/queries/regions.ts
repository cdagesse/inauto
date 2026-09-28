import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { stateSpellings } from "@/data/regions";
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

interface SaleRow {
  region: string;
  make: string;
  makeName: string;
  modelId: string;
  win: "last" | "prior";
  n: number;
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
 * auctions per region for the last 90 days. Rows without a recognisable state are left out.
 */
export async function loadRegionInput(): Promise<RegionInput> {
  const [salesRes, auctionRes, throughRes] = await Promise.all([
    db.execute(sql`
      with region(state, key) as (values ${regionValues()})
      select r.key as region, mk.slug as make, mk.name as "makeName", s.model_id as "modelId",
        case when s.sold_date > current_date - ${sql.raw(String(REGION_WINDOW_DAYS))} then 'last' else 'prior' end as win,
        count(*)::int as n,
        (percentile_cont(0.5) within group (order by s.price))::float8 as median,
        (percentile_cont(0.5) within group (order by s.days_on_market))::float8 as dom
      from dealer_sale s
      join region r on r.state = upper(trim(s.state))
      join model m on m.id = s.model_id
      join make mk on mk.id = m.make_id
      where s.excluded_reason is null and s.price > 0
        and s.sold_date > current_date - ${sql.raw(String(REGION_WINDOW_DAYS * 2))}
        and s.sold_date <= current_date
      group by 1, 2, 3, 4, 5
    `),
    db.execute(sql`
      with region(state, key) as (values ${regionValues()})
      select r.key as region, count(*)::int as n,
        (percentile_cont(0.5) within group (order by a.hammer_price))::float8 as median
      from auction_result a
      join region r on r.state = upper(trim(a.raw_json->>'state'))
      where a.status = 'sold' and a.excluded_reason is null and a.hammer_price > 0
        and a.ended_at > now() - interval '90 days'
      group by 1
    `),
    db.execute(sql`
      select max(sold_date)::text as through from dealer_sale where excluded_reason is null
    `),
  ]);
  const sales: RegionSaleRow[] = rowsOf<SaleRow>(salesRes).map((r) => ({
    region: r.region,
    make: r.make,
    makeName: r.makeName,
    modelId: r.modelId,
    win: r.win,
    n: Number(r.n),
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
