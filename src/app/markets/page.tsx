import type { Metadata } from "next";
import Link from "next/link";
import { longDate } from "@/components/market/format";
import { NodeCard } from "@/components/market/market-nodes";
import { RegionsTable } from "@/components/market/region-nodes";
import { SegmentsTable } from "@/components/market/segments-table";
import { SearchBox } from "@/components/site/search";
import { getRegions } from "@/lib/market/region-source";
import { getMarketTree } from "@/lib/market/tree-source";
import { soft } from "@/server/result";

export const metadata: Metadata = {
  title: "Markets",
  description:
    "Collector car market by US region and by segment: where sales are rising or falling, which types of car are strongest in each part of the country, then volume and price trends for supercars, luxury, European performance, American, Japanese and British classics down to each make and model.",
};

export const revalidate = 3600;

export default async function MarketsPage() {
  const [tree, regions] = await Promise.all([
    getMarketTree(),
    getRegions().catch(soft("markets regions", null)),
  ]);
  const withData = tree.segments.filter((s) => s.stats);
  const totalSales = withData.reduce((a, s) => a + (s.stats?.dealerSales ?? 0), 0);
  const totalModels = withData.reduce((a, s) => a + (s.stats?.models ?? 0), 0);

  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">Markets · United States</div>
          <h1 className="hero-title">
            <span>UrCar</span>Markets
          </h1>
          <p className="sub" style={{ maxWidth: "60ch" }}>
            Start with a region to see where sales are rising or falling and which types of car are
            strongest there, or with a segment to follow volume and prices down to each make and
            model. Every number comes from real dealer sales and auction results.
          </p>
        </div>
        <div className="asof">
          {tree.dataThrough ? (
            <>
              Data through {longDate(tree.dataThrough)}
              <br />
            </>
          ) : null}
          {totalSales.toLocaleString("en-US")} dealer sales across {totalModels} models
          <br />
          {tree.segments.length} segments
        </div>
      </div>

      <div className="search markets-search" role="search">
        <SearchBox size="hero" placeholder="Jump to a make or model, e.g. Ferrari 812" />
      </div>

      <section className="markets-compare">
        <h2 className="sec">By region</h2>
        <p className="sub">
          Dealer sales in the last 90 days for each part of the country, whether prices and volume
          are up or down against the 90 days before, and which types of car have the best and worst
          90-day price move there (a type needs 10 weighted sales for a read). Open a region for its
          types, makes and states.
        </p>
        {regions && regions.national.sales90 > 0 ? (
          <>
            <RegionsTable regions={regions.regions} />
            <p className="hint" style={{ marginTop: 10 }}>
              <Link href="/markets/regions" className="seg-link-name">
                All regions →
              </Link>
            </p>
          </>
        ) : (
          <p className="note">
            No dealer sales with a recognisable US state in the last 90 days, so there is no
            regional read yet.
          </p>
        )}
      </section>

      <section className="markets-compare">
        <h2 className="sec">Segments at a glance</h2>
        <p className="sub">
          Monthly dealer sales and a price index for each segment. The index sets every
          generation&apos;s normal price at 100, so a rising line means cars are selling above their
          usual level.
        </p>
        <SegmentsTable segments={tree.segments} />
      </section>

      <section>
        <h2 className="sec">Drill in</h2>
        <p className="sub">Pick a segment to see its makes, then a make to see its models.</p>
        <div className="node-grid">
          {tree.segments.map((s) => (
            <NodeCard
              key={s.key}
              href={`/markets/${s.key}`}
              eyebrow="Segment"
              title={s.name}
              blurb={s.blurb}
              stats={s.stats}
              footer={`${s.catalogMakes} makes · ${s.stats?.models ?? 0} of ${s.catalogModels} models reported`}
            />
          ))}
        </div>
      </section>
    </>
  );
}
