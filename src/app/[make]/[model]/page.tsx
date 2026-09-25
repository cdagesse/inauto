import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMarketSnapshot, listMarketModels } from "@/lib/market/source";
import { ModelMarket } from "@/components/market/model-market";
import { GenerationGuide } from "@/components/market/tables";
import { longDate, usd } from "@/components/market/format";
import { getCatalogModel } from "@/server/queries/catalog";
import { requestMarketReport } from "@/server/reports";
import { ReportPending } from "./report-pending";

export const revalidate = 3600;

type Params = { make: string; model: string };

export async function generateStaticParams() {
  const models = await listMarketModels();
  return models.map((m) => ({ make: m.make.slug, model: m.model.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { make, model } = await params;
  const s = await getMarketSnapshot(make, model);
  if (!s) {
    const c = await getCatalogModel(make, model);
    if (!c) return { title: "Model not found" };
    return {
      title: `${c.make} ${c.model} market report`,
      description: `Market report for the ${c.make} ${c.model} is being built from dealer sales and auction results.`,
      robots: { index: false, follow: false },
    };
  }
  const top = s.generations[s.order[0]];
  const title = `${s.make.name} ${s.model.name} prices and market report`;
  const description = `${s.totals.dealerSales} dealer sales and ${s.totals.auctionSales} auction results. ${top.name} median ${usd(top.median)}, ${s.totals.activeNow} for sale now. Data through ${longDate(s.dataThrough)}. Value your ${s.model.shortName} and see whether to auction it, sell to a dealer, or list it yourself.`;
  return {
    title,
    description,
    alternates: { canonical: `/${s.make.slug}/${s.model.slug}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function ModelPage({ params }: { params: Promise<Params> }) {
  const { make, model } = await params;
  const s = await getMarketSnapshot(make, model);
  if (!s) {
    const c = await getCatalogModel(make, model);
    if (!c) notFound();
    const years = c.yearStart ? `${c.yearStart} to ${c.yearEnd ?? "present"}` : "";
    // A first visit (even without JavaScript) queues the report; the action is idempotent.
    let status = c.reportStatus;
    if (status === "none") {
      const r = await requestMarketReport({ makeSlug: c.makeSlug, modelSlug: c.modelSlug });
      if (r.ok) status = "requested";
    }
    return (
      <>
        <div className="crumbs">
          <Link href="/markets" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
            Markets
          </Link>{" "}
          / {c.make} / <b>{c.shortName ?? c.model}</b>
        </div>
        <div className="hero">
          <div>
            <div className="eyebrow">Market report · Dealer retail and auction, United States</div>
            <h1 className="hero-title">
              <span>{c.parentLine ?? c.make}</span>
              {c.shortName ?? c.model}
            </h1>
          </div>
          <div className="asof">{years}</div>
        </div>
        <ReportPending
          makeSlug={c.makeSlug}
          modelSlug={c.modelSlug}
          status={status}
          error={c.reportError}
        />
      </>
    );
  }
  const top = s.generations[s.order[0]];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${s.make.name} ${s.model.name} market data`,
    description: `Dealer sale prices, active listings and auction results for the ${s.make.name} ${s.model.name}, aggregated by generation. ${top.name} median sold price ${usd(top.median)}.`,
    url: `/${s.make.slug}/${s.model.slug}`,
    temporalCoverage: `${s.dealerSince}/${s.dataThrough}`,
    spatialCoverage: "United States",
    creator: { "@type": "Organization", name: "InAuto" },
    isBasedOn: ["https://visor.vin", "https://oldcarsdata.com"],
    variableMeasured: [
      "median sold price",
      "median mileage",
      "days to sell",
      "auction hammer price",
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="crumbs">
        <Link href="/markets" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
          Markets
        </Link>{" "}
        / {s.make.name} / {s.model.parentLine.replace(s.make.name, "").trim() || s.model.name} /{" "}
        <b>{s.model.shortName}</b> · <a href="#value">Value my car</a>
      </div>

      <div className="hero">
        <div>
          <div className="eyebrow">Market report · Dealer retail and auction, United States</div>
          <h1 className="hero-title">
            <span>{s.model.parentLine}</span>
            {s.model.shortName}
          </h1>
        </div>
        <div className="asof">
          Data through {longDate(s.dataThrough)}
          <br />
          {s.totals.dealerSales} dealer sales since {longDate(s.dealerSince)}
          <br />
          {s.totals.auctionSales} auction sales since {monthYear(s.auctionSince)}
          <br />
          {s.totals.activeNow} listed for sale today
        </div>
      </div>

      <ModelMarket snapshot={s} />

      <div className="market">
        <section>
          <h2 className="sec">Generation guide</h2>
          <p className="sub">
            What changed between generations, and how each is trading against its original sticker.
          </p>
          <GenerationGuide snapshot={s} />
        </section>
      </div>

      <footer className="method">
        <div>
          <h4>How these numbers are built</h4>
          <p>
            Dealer figures are asking prices at the moment a car left the market (Visor sold
            listings). Auction figures are hammer prices from Old Cars Data, which aggregates Bring
            a Trailer, Cars &amp; Bids, RM Sotheby&apos;s, Bonhams, Barrett-Jackson and 14 other
            platforms. Medians are used throughout so a few mispriced or mislabeled listings do not
            move the result.
          </p>
          <p>
            Change figures compare the median of the last 90 days ({ninetyDayWindow(s.dataThrough)})
            with the 90 days before it. Months at either end of the window are partial.
          </p>
        </div>
        <div>
          <h4>Limits of this sample</h4>
          <p>
            Dealer history starts {longDate(s.dealerSince)}. Auction data covers only the{" "}
            {s.auctions.length} most recent {s.model.shortName} results because the Old Cars Data
            free plan returns 20 rows per search and 10 searches a month. A paid plan opens the full
            archive back to 2018 and would extend every trend line on this page.
          </p>
          <p>
            The value tool fits a price-vs-mileage curve to each generation&apos;s dealer sales,
            converts it to an expected hammer price using the measured auction-to-dealer gap, and
            estimates dealer offers from a margin that widens for slower-selling generations.
            Package, color, condition and history adjustments are fixed starting assumptions, not
            yet measured.
          </p>
          <p>
            Seven 2016 listings between $680,000 and $900,000 with delivery miles were excluded from
            the 991.1 chart and range as likely mislabeled (911 R or special-order cars).
          </p>
        </div>
      </footer>
    </>
  );
}

function monthYear(d: string) {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
}

function ninetyDayWindow(through: string) {
  const end = new Date(through + "T00:00:00Z");
  const start = new Date(end.getTime() - 90 * 86400000);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const f = (d: Date) => `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return `${f(start)} to ${f(end)}`;
}
