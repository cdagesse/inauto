import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { longDate } from "@/components/market/format";
import { usd } from "@/lib/format/money";
import { ChangePill, NodeKpis, TrendPair } from "@/components/market/market-nodes";
import { Sparkline } from "@/components/market/sparkline";
import { BrandLogo } from "@/components/site/brand-logo";
import { segmentByKey, segmentForMake } from "@/data/segments";
import { getMarketTree } from "@/lib/market/tree-source";
import { listSellModels } from "@/server/queries/sell-catalog";
import { soft } from "@/server/result";

export const revalidate = 3600;

type Params = { segment: string; make: string };

/**
 * Make pages render on first request and are then cached for an hour. They are
 * not pre-rendered at build time: each one needs every model snapshot, and
 * sixty of them in a build was the slowest step by far.
 */
export const dynamicParams = true;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { segment, make } = await params;
  const tree = await getMarketTree();
  const node = tree.segments.find((s) => s.key === segment)?.makes.find((m) => m.slug === make);
  if (!node) return { title: "Make not found" };
  return {
    title: `${node.name} market: models, prices and trends`,
    description: `${node.name} models ranked by dealer sales with median prices, 90-day change and monthly volume, from real dealer sales and auction results.`,
    alternates: { canonical: `/markets/${segment}/${make}` },
  };
}

export default async function MakePage({ params }: { params: Promise<Params> }) {
  const { segment, make } = await params;
  const seg = segmentByKey(segment);
  if (!seg || segmentForMake(make).key !== seg.key) notFound();
  const [tree, catalog] = await Promise.all([
    getMarketTree(),
    listSellModels(make).catch(soft(`markets ${make} catalog`, [])),
  ]);
  const node = tree.segments.find((s) => s.key === segment)?.makes.find((m) => m.slug === make);
  if (!node && catalog.length === 0) notFound();
  const name = node?.name ?? catalog[0]?.name ?? make;
  const reported = new Set((node?.models ?? []).map((m) => m.model.slug));
  const pending = catalog.filter((c) => !reported.has(c.slug));

  return (
    <>
      <div className="crumbs">
        <Link href="/markets" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
          Markets
        </Link>{" "}
        /{" "}
        <Link
          href={`/markets/${seg.key}`}
          style={{ color: "var(--ink-3)", textDecoration: "none" }}
        >
          {seg.short}
        </Link>{" "}
        / <b>{name}</b>
      </div>
      <div className="hero">
        <div className="with-logo">
          <BrandLogo make={make} px={64} />
          <div>
            <div className="eyebrow">{seg.name} · Dealer retail and auction, United States</div>
            <h1 className="hero-title">
              <span>{seg.short}</span>
              {name}
            </h1>
          </div>
        </div>
        <div className="asof">
          {tree.dataThrough ? (
            <>
              Data through {longDate(tree.dataThrough)}
              <br />
            </>
          ) : null}
          {node?.stats?.models ?? 0} of {Math.max(node?.catalogModels ?? 0, catalog.length)} models
          reported
        </div>
      </div>

      {node?.stats ? (
        <div className="market">
          <NodeKpis stats={node.stats} label={name} />
          <section>
            <h2 className="sec">Volume and price trend</h2>
            <p className="sub">
              Monthly dealer sales across every reported {name} model, and a sales-weighted price
              index where 100 is each generation&apos;s normal price.
            </p>
            <TrendPair stats={node.stats} wide />
          </section>
        </div>
      ) : (
        <p className="note" style={{ padding: "16px 0" }}>
          No {name} model has a market report yet. Open any model below and we build one from dealer
          sales and auction results, usually within a few minutes.
        </p>
      )}

      <section className="market-section">
        <h2 className="sec">Models</h2>
        <p className="sub">Ranked by dealer sales. Open a model for its full market report.</p>
        {node && node.models.length ? (
          <div className="tw">
            <table className="compare models-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th className="n">Median price</th>
                  <th className="n">90-day</th>
                  <th className="n">Dealer sales</th>
                  <th className="n">For sale</th>
                  <th>Sales per month</th>
                  <th>Price index</th>
                </tr>
              </thead>
              <tbody>
                {node.models.map((m) => (
                  <tr key={m.model.slug}>
                    <td>
                      <Link href={`/${m.make.slug}/${m.model.slug}`} className="seg-link-name">
                        {m.model.name}
                      </Link>
                      <div className="hint">
                        {m.stats.auctionSales} auction results · median of latest generation
                      </div>
                    </td>
                    <td className="n">{m.headline > 0 ? usd(m.headline) : "n/a"}</td>
                    <td className="n">
                      <ChangePill change={m.stats.change90} n90={m.stats.n90} />
                    </td>
                    <td className="n">{m.stats.dealerSales.toLocaleString("en-US")}</td>
                    <td className="n">{m.stats.activeNow.toLocaleString("en-US")}</td>
                    <td className="spark-cell">
                      <Sparkline trend={m.stats.trend} kind="volume" width={160} height={40} />
                    </td>
                    <td className="spark-cell">
                      <Sparkline trend={m.stats.trend} kind="index" width={160} height={40} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {pending.length ? (
          <>
            <h3 className="sec" style={{ fontSize: 18, marginTop: 24 }}>
              {node && node.models.length ? "More models, reports on request" : "Models"}
            </h3>
            <p className="sub">
              Open one and we build its report from dealer sales and auction results.
            </p>
            <div className="make-chips">
              {pending.map((c) => (
                <Link key={c.slug} href={`/${make}/${c.slug}`} className="make-chip">
                  <span>{c.name}</span>
                  {c.yearStart ? (
                    <span className="count">
                      {c.yearStart}–{c.yearEnd ?? "now"}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
