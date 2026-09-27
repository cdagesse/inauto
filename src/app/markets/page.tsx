import type { Metadata } from "next";
import Link from "next/link";
import { longDate } from "@/components/market/format";
import { NodeCard } from "@/components/market/market-nodes";
import { Sparkline } from "@/components/market/sparkline";
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
        <div className="tw">
          <table className="compare">
            <thead>
              <tr>
                <th>Segment</th>
                <th className="n">Median price</th>
                <th className="n">90-day</th>
                <th className="n">Dealer sales</th>
                <th className="n">For sale</th>
                <th>Sales per month</th>
                <th>Price index</th>
              </tr>
            </thead>
            <tbody>
              {tree.segments.map((s) => (
                <tr key={s.key}>
                  <td>
                    <Link href={`/markets/${s.key}`} className="seg-link-name">
                      {s.short}
                    </Link>
                    <div className="hint">
                      {s.catalogMakes} makes · {s.stats?.models ?? 0} of {s.catalogModels} models
                      reported
                    </div>
                  </td>
                  <td className="n">
                    {s.stats?.medianPrice != null
                      ? "$" + Math.round(s.stats.medianPrice).toLocaleString("en-US")
                      : "n/a"}
                  </td>
                  <td
                    className={`n ${s.stats?.change90 == null ? "" : s.stats.change90 >= 0 ? "up" : "down"}`}
                  >
                    {s.stats?.change90 != null
                      ? `${s.stats.change90 >= 0 ? "+" : ""}${(s.stats.change90 * 100).toFixed(1)}%`
                      : "n/a"}
                  </td>
                  <td className="n">{(s.stats?.dealerSales ?? 0).toLocaleString("en-US")}</td>
                  <td className="n">{(s.stats?.activeNow ?? 0).toLocaleString("en-US")}</td>
                  <td className="spark-cell">
                    {s.stats ? (
                      <Sparkline trend={s.stats.trend} kind="volume" width={160} height={40} />
                    ) : null}
                  </td>
                  <td className="spark-cell">
                    {s.stats ? (
                      <Sparkline trend={s.stats.trend} kind="index" width={160} height={40} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
