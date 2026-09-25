import type { Metadata } from "next";
import Link from "next/link";
import { listMarketModels } from "@/lib/market/source";
import { usd } from "@/components/market/format";

export const metadata: Metadata = {
  title: "Markets",
  description:
    "Market reports for collector and enthusiast cars: dealer sales, auction results, and pricing by generation.",
};

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const all = await listMarketModels();
  const query = (q ?? "").trim().toLowerCase();
  const models = query
    ? all.filter((m) => `${m.make.name} ${m.model.name}`.toLowerCase().includes(query))
    : all;

  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">Market reports · United States</div>
          <h1 className="hero-title">
            <span>InAuto</span>Markets
          </h1>
        </div>
        <form action="/markets" method="get" className="search" role="search">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search a make or model"
            aria-label="Search models"
          />
          <button type="submit" className="btn primary">
            Search
          </button>
        </form>
      </div>
      {query && (
        <p className="sub">
          {models.length} result{models.length === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
        </p>
      )}
      <div className="model-list">
        {models.map((m) => (
          <Link
            key={`${m.make.slug}/${m.model.slug}`}
            href={`/${m.make.slug}/${m.model.slug}`}
            className="panel model-card"
          >
            <span className="eyebrow">{m.make.name}</span>
            <span className="name">{m.model.name}</span>
            <span className="price">{usd(m.headline)}</span>
            <span className="note" style={{ margin: 0 }}>
              Latest-generation median · {m.totals.dealerSales} dealer sales ·{" "}
              {m.totals.auctionSales} auctions · {m.totals.activeNow} for sale
            </span>
          </Link>
        ))}
        {!models.length && (
          <p className="note">
            No market report for that yet. Reports are added as the data pipeline covers more
            models.
          </p>
        )}
      </div>
    </>
  );
}
