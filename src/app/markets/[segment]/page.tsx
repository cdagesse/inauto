import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { longDate } from "@/components/market/format";
import { NodeCard, NodeKpis, TrendPair } from "@/components/market/market-nodes";
import { BrandLogo } from "@/components/site/brand-logo";
import { SEGMENTS, segmentByKey } from "@/data/segments";
import { getMarketTree } from "@/lib/market/tree-source";

export const revalidate = 3600;

type Params = { segment: string };

export function generateStaticParams() {
  return SEGMENTS.filter((s) => s.key !== "other").map((s) => ({ segment: s.key }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { segment } = await params;
  const seg = segmentByKey(segment);
  if (!seg) return { title: "Segment not found" };
  return {
    title: `${seg.name} market`,
    description: `${seg.blurb} Volume and price trends by make, from real dealer sales and auction results.`,
    alternates: { canonical: `/markets/${seg.key}` },
  };
}

export default async function SegmentPage({ params }: { params: Promise<Params> }) {
  const { segment } = await params;
  const tree = await getMarketTree();
  const node = tree.segments.find((s) => s.key === segment);
  if (!node) notFound();
  const withData = node.makes.filter((m) => m.stats);
  const pending = node.makes.filter((m) => !m.stats);

  return (
    <>
      <div className="crumbs">
        <Link href="/markets" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
          Markets
        </Link>{" "}
        / <b>{node.short}</b>
      </div>
      <div className="hero">
        <div>
          <div className="eyebrow">Segment · Dealer retail and auction, United States</div>
          <h1 className="hero-title">
            <span>Markets</span>
            {node.name}
          </h1>
          <p className="sub" style={{ maxWidth: "60ch" }}>
            {node.blurb}
          </p>
        </div>
        <div className="asof">
          {tree.dataThrough ? (
            <>
              Data through {longDate(tree.dataThrough)}
              <br />
            </>
          ) : null}
          {node.catalogMakes} makes
          <br />
          {node.stats?.models ?? 0} of {node.catalogModels} models reported
        </div>
      </div>

      {node.stats ? (
        <div className="market">
          <NodeKpis stats={node.stats} label={node.short} />
          <section>
            <h2 className="sec">Volume and price trend</h2>
            <p className="sub">
              Monthly dealer sales across every reported {node.short} model, and a sales-weighted
              price index where 100 is each generation&apos;s normal price.
            </p>
            <TrendPair stats={node.stats} wide />
          </section>
        </div>
      ) : (
        <p className="note" style={{ padding: "16px 0" }}>
          No {node.short} model has a market report yet. Open any model below and we build one.
        </p>
      )}

      <section className="market-section">
        <h2 className="sec">Makes</h2>
        <p className="sub">Ranked by dealer sales. Pick a make to see its models.</p>
        <div className="node-grid">
          {withData.map((m) => (
            <NodeCard
              key={m.slug}
              href={`/markets/${node.key}/${m.slug}`}
              title={m.name}
              stats={m.stats}
              logo={<BrandLogo make={m.slug} px={44} />}
              footer={`${m.stats?.models ?? 0} of ${m.catalogModels} models reported`}
            />
          ))}
        </div>
        {pending.length ? (
          <>
            <h3 className="sec" style={{ fontSize: 18, marginTop: 24 }}>
              Reports on request
            </h3>
            <p className="sub">
              These makes are in the catalog but no model has been asked for yet.
            </p>
            <div className="make-chips">
              {pending.map((m) => (
                <Link key={m.slug} href={`/markets/${node.key}/${m.slug}`} className="make-chip">
                  <BrandLogo make={m.slug} px={24} />
                  <span>{m.name}</span>
                  <span className="count">{m.catalogModels}</span>
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
