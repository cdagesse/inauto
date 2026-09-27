import type { Metadata } from "next";
import { longDate } from "@/components/market/format";
import { NodeCard } from "@/components/market/market-nodes";
import { SegmentsTable } from "@/components/market/segments-table";
import { SearchBox } from "@/components/site/search";
import { getMarketTree } from "@/lib/market/tree-source";

export const metadata: Metadata = {
  title: "Markets",
  description:
    "Collector car market by segment: supercars, luxury, European performance, American, Japanese and British classics. Volume and price trends, then drill into each make and model.",
};

export const revalidate = 3600;

export default async function MarketsPage() {
  const tree = await getMarketTree();
  const withData = tree.segments.filter((s) => s.stats);
  const totalSales = withData.reduce((a, s) => a + (s.stats?.dealerSales ?? 0), 0);
  const totalModels = withData.reduce((a, s) => a + (s.stats?.models ?? 0), 0);

  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">Market reports · United States</div>
          <h1 className="hero-title">
            <span>InAuto</span>Markets
          </h1>
          <p className="sub" style={{ maxWidth: "60ch" }}>
            Start with a segment to see where volume and prices are moving, then drill into a make
            and its models. Every number comes from real dealer sales and auction results.
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
