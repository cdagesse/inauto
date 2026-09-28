import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { longDate } from "@/components/market/format";
import { MakesTable, TypesTable, signedPct } from "@/components/market/region-nodes";
import { REGIONS, regionByKey } from "@/data/regions";
import { usd, usdK } from "@/lib/format/money";
import { getRegions } from "@/lib/market/region-source";
import type { TypeInRegion } from "@/lib/market/regions";

/** One sentence on the types with the best and worst 90-day price move, whatever their sign. */
function typeRead(best: TypeInRegion | null, worst: TypeInRegion | null): string {
  if (!best || best.priceChange == null)
    return "Not enough sales yet for a type-by-type price read.";
  const b = signedPct(best.priceChange);
  if (!worst || worst.priceChange == null)
    return `Only one type has a price read here so far: ${best.name}, ${b} over 90 days.`;
  return `Best 90-day price move: ${best.name} (${b}). Worst: ${worst.name} (${signedPct(worst.priceChange)}).`;
}

export const revalidate = 3600;

type Params = { region: string };

export function generateStaticParams() {
  return REGIONS.map((r) => ({ region: r.key }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { region } = await params;
  const r = regionByKey(region);
  if (!r) return { title: "Region not found" };
  return {
    title: `${r.name} car market`,
    description: `${r.blurb} Dealer sales in the last 90 days, whether prices and volume are rising or falling, and which types of car and makes are strongest there.`,
    alternates: { canonical: `/markets/regions/${r.key}` },
  };
}

export default async function RegionPage({ params }: { params: Promise<Params> }) {
  const { region } = await params;
  if (!regionByKey(region)) notFound();
  const o = await getRegions();
  const r = o.regions.find((x) => x.key === region);
  if (!r) notFound();
  const dc = r.states.includes("DC");
  const stateCount = r.states.filter((s) => s !== "DC").length;

  return (
    <>
      <div className="crumbs">
        <Link href="/markets" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
          Markets
        </Link>{" "}
        /{" "}
        <Link href="/markets/regions" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
          Regions
        </Link>{" "}
        / <b>{r.short}</b>
      </div>
      <div className="hero">
        <div>
          <div className="eyebrow">Region · Dealer retail and auction, United States</div>
          <h1 className="hero-title">
            <span>Markets</span>
            {r.name}
          </h1>
          <p className="sub" style={{ maxWidth: "60ch" }}>
            {r.blurb} {typeRead(r.strongest, r.softest)}
          </p>
        </div>
        <div className="asof">
          {o.dataThrough ? (
            <>
              Data through {longDate(o.dataThrough)}
              <br />
            </>
          ) : null}
          {stateCount} states{dc ? " and DC" : ""}
          <br />
          {Math.round(r.share * 100)}% of US dealer sales
        </div>
      </div>

      <div className="market">
        <div className="kpis node-kpis">
          <div className="kpi">
            <div className="l">Dealer sales · last 90 days</div>
            <div className="v">{r.sales90.toLocaleString("en-US")}</div>
            <div className="s">{r.prior90.toLocaleString("en-US")} in the 90 days before</div>
          </div>
          <div className="kpi">
            <div className="l">Prices · 90 days</div>
            {r.priceChange != null ? (
              <div className={`v chg ${r.priceChange >= 0 ? "up" : "down"}`}>
                {signedPct(r.priceChange)}
              </div>
            ) : (
              <div className="v">n/a</div>
            )}
            <div className="s">
              {r.priceChange != null
                ? `Sales-weighted across models, ${r.n90.toLocaleString("en-US")} sales`
                : "Not enough sales to read a change"}
            </div>
          </div>
          <div className="kpi">
            <div className="l">Volume vs prior 90</div>
            {r.volumeChange != null ? (
              <div className={`v chg ${r.volumeChange >= 0 ? "up" : "down"}`}>
                {signedPct(r.volumeChange, 0)}
              </div>
            ) : (
              <div className="v">n/a</div>
            )}
            <div className="s">
              Nationally{" "}
              {o.national.volumeChange != null ? signedPct(o.national.volumeChange, 0) : "n/a"}
            </div>
          </div>
          <div className="kpi">
            <div className="l">Days to sell</div>
            <div className="v">{r.daysToSell ?? "n/a"}</div>
            <div className="s">
              Typical price {r.medianPrice != null ? usdK(r.medianPrice) : "n/a"}
            </div>
          </div>
          <div className="kpi">
            <div className="l">Auction sales · 90 days</div>
            <div className="v">{r.auctionSales90.toLocaleString("en-US")}</div>
            <div className="s">
              {r.auctionMedian != null ? `Median hammer ${usd(r.auctionMedian)}` : "No hammer read"}
            </div>
          </div>
        </div>
      </div>

      <section className="market-section">
        <h2 className="sec">Which types are winning here</h2>
        <p className="sub">
          Ranked by dealer sales in the {r.short} over the last 90 days. Prices compare each
          model&apos;s median with the 90 days before, weighted by sales; a type needs 10 weighted
          sales for a read. Open a type for its makes nationwide.
        </p>
        {r.types.length ? (
          <TypesTable types={r.types} />
        ) : (
          <p className="note">No dealer sales with a {r.short} state in the last 90 days.</p>
        )}
      </section>

      {r.makes.length ? (
        <section className="market-section">
          <h2 className="sec">Top makes in the {r.short}</h2>
          <p className="sub">The makes selling most here, with their price and volume moves.</p>
          <MakesTable makes={r.makes} />
        </section>
      ) : null}

      <section className="market-section">
        <h2 className="sec">States{dc ? " and DC" : ""}</h2>
        <p className="sub">
          Dealer sales count toward the {r.short} when the selling dealer is in one of these.
        </p>
        <div className="make-chips">
          {r.states.map((s) => (
            <span key={s} className="make-chip static">
              {s}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
