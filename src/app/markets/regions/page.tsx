import type { Metadata } from "next";
import Link from "next/link";
import { longDate } from "@/components/market/format";
import { RegionCard, RegionsTable, VolumePill } from "@/components/market/region-nodes";
import { getRegions } from "@/lib/market/region-source";

export const metadata: Metadata = {
  title: "Markets by region",
  description:
    "The collector car market by US region: dealer sales in the last 90 days, whether prices and volume are rising or falling, and which types of car are strongest in the Northeast, Southeast, South Central, Midwest, Mountain West and West Coast.",
  alternates: { canonical: "/markets/regions" },
};

export const revalidate = 3600;

export default async function RegionsPage() {
  const o = await getRegions();
  return (
    <>
      <div className="crumbs">
        <Link href="/markets" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
          Markets
        </Link>{" "}
        / <b>Regions</b>
      </div>
      <div className="hero">
        <div>
          <div className="eyebrow">Regions · Dealer retail, United States</div>
          <h1 className="hero-title">
            <span>Markets</span>By region
          </h1>
          <p className="sub" style={{ maxWidth: "60ch" }}>
            Where cars are selling, whether prices and volume are up or down against the prior 90
            days, and which types of car are strongest and softest in each part of the country.
          </p>
        </div>
        <div className="asof">
          {o.dataThrough ? (
            <>
              Data through {longDate(o.dataThrough)}
              <br />
            </>
          ) : null}
          {o.national.sales90.toLocaleString("en-US")} dealer sales in the last 90 days
          <br />
          <VolumePill change={o.national.volumeChange} prior={o.national.prior90} />
        </div>
      </div>

      <section className="markets-compare">
        <h2 className="sec">Regions at a glance</h2>
        <p className="sub">
          Prices compare each model&apos;s median in the last 90 days with the 90 before, weighted
          by sales; volume compares the sales counts. A type needs at least 10 weighted sales for a
          price read.
        </p>
        <RegionsTable regions={o.regions} />
      </section>

      <section>
        <h2 className="sec">Drill in</h2>
        <p className="sub">Open a region for its types, top makes and states.</p>
        <div className="node-grid">
          {o.regions.map((r) => (
            <RegionCard key={r.key} region={r} />
          ))}
        </div>
      </section>
    </>
  );
}
