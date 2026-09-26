import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { longDate, mi, usd, usdK } from "@/components/market/format";
import { BrandLogo } from "@/components/site/brand-logo";
import { ValuationTool } from "@/components/valuation/tool";
import { getMarketSnapshot } from "@/lib/market/source";
import { generationFor } from "@/lib/sell/picker-lib";
import { getCatalogModel } from "@/server/queries/catalog";
import { requestMarketReport } from "@/server/reports";
import { ReportPending } from "@/app/[make]/[model]/report-pending";

type Params = { make: string; model: string };

const query = z.object({
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  gen: z.string().trim().max(40).optional(),
  trim: z.string().trim().max(80).optional(),
  miles: z.coerce.number().int().min(0).max(2_000_000).optional(),
});

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { make, model } = await params;
  const s = await getMarketSnapshot(make, model);
  const c = s ? null : await getCatalogModel(make, model);
  const name = s ? `${s.make.name} ${s.model.name}` : c ? `${c.make} ${c.model}` : "your car";
  return {
    title: `Sell your ${name}`,
    description: `What your ${name} is worth today from real dealer and auction sales, what you would keep at auction, from a dealer, or selling it yourself, and how to list it on InAuto.`,
    robots: { index: false, follow: true },
  };
}

export default async function SellModelPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ make, model }, sp] = await Promise.all([params, searchParams]);
  const q = query.safeParse(sp).data ?? {};
  const s = await getMarketSnapshot(make, model);

  const listQs = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") p.set(k, String(v));
    return `/sell/list?${p.toString()}`;
  };

  if (!s) {
    const c = await getCatalogModel(make, model);
    if (!c) notFound();
    let status = c.reportStatus;
    if (status === "none") {
      const r = await requestMarketReport({ makeSlug: c.makeSlug, modelSlug: c.modelSlug });
      if (r.ok) status = "requested";
    }
    const listHref = listQs({
      make: c.make,
      model: c.model,
      year: q.year,
      trim: q.trim,
      miles: q.miles,
    });
    return (
      <>
        <div className="crumbs">
          <Link href="/sell" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
            Sell
          </Link>{" "}
          / {c.make} / <b>{c.shortName ?? c.model}</b>
        </div>
        <div className="hero">
          <div className="with-logo">
            <BrandLogo make={c.makeSlug} px={64} />
            <div>
              <div className="eyebrow">Sell · Priced from real dealer and auction sales</div>
              <h1 className="hero-title">
                <span>
                  Sell your {q.year ? `${q.year} ` : ""}
                  {c.parentLine ?? c.make}
                </span>
                {c.shortName ?? c.model}
              </h1>
            </div>
          </div>
          <div className="asof">
            {q.miles != null ? `${mi(q.miles)} miles` : ""}
            {q.trim ? (
              <>
                <br />
                {q.trim}
              </>
            ) : null}
          </div>
        </div>
        <ReportPending
          makeSlug={c.makeSlug}
          modelSlug={c.modelSlug}
          status={status}
          error={c.reportError}
        />
        <div className="rec sell-pitch" style={{ marginTop: 0 }}>
          <b>You do not have to wait for the report to list.</b>
          <p>
            List your {c.shortName ?? c.model} on InAuto now, free. We attach the market report to
            your listing as soon as it is built, and buyers can order title vetting and an
            inspection before they commit.
          </p>
          <div className="pitch-ctas">
            <Link href={listHref} className="btn primary">
              List it on InAuto
            </Link>
            <Link href="/sell" className="btn">
              Pick a different car
            </Link>
          </div>
        </div>
      </>
    );
  }

  const gen = generationFor(s.years, s.order, q.year, q.gen);
  const g = s.generations[gen];
  const year = q.year && (s.years[gen] ?? []).includes(q.year) ? q.year : (s.years[gen] ?? [])[0];
  const ch = g.prior90 ? (g.last90 - g.prior90) / g.prior90 : 0;
  const up = ch >= 0;
  const short = s.model.shortName;
  const listHref = listQs({
    make: s.make.name,
    model: s.model.name,
    year,
    trim: s.order.length > 1 ? g.name : q.trim,
    miles: q.miles,
  });

  return (
    <>
      <div className="crumbs">
        <Link href="/sell" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
          Sell
        </Link>{" "}
        / {s.make.name} / <b>{short}</b> ·{" "}
        <Link href={`/${s.make.slug}/${s.model.slug}`}>Full market report</Link>
      </div>

      <div className="hero">
        <div className="with-logo">
          <BrandLogo make={s.make.slug} px={64} />
          <div>
            <div className="eyebrow">Sell · Priced from real dealer and auction sales</div>
            <h1 className="hero-title">
              <span>
                Sell your {year ? `${year} ` : ""}
                {s.model.parentLine}
              </span>
              {short}
            </h1>
          </div>
        </div>
        <div className="asof">
          {g.name} · {g.years}
          <br />
          {q.miles != null ? `${mi(q.miles)} miles` : `Typical ${mi(g.medianMiles)} miles`}
          <br />
          Data through {longDate(s.dataThrough)}
          <br />
          {s.totals.activeNow} listed for sale today
        </div>
      </div>

      <div className="market">
        <div className="kpis">
          <div className="kpi">
            <div className="l">
              Median sold price · {g.name}
              {g.thin ? (
                <>
                  {" "}
                  <span className="pill">Thin sample</span>
                </>
              ) : null}
            </div>
            <div className="v">{usd(g.median)}</div>
            <div className="s">
              Typical range {usd(g.lo)} to {usd(g.hi)}
            </div>
          </div>
          <div className="kpi">
            <div className="l">90-day change</div>
            <div className={`v chg ${up ? "up" : "down"}`}>
              {up ? "+" : ""}
              {(ch * 100).toFixed(1)}%
            </div>
            <div className="s">{g.n90} sales in the last 90 days</div>
          </div>
          <div className="kpi">
            <div className="l">Days to sell</div>
            <div className="v">{g.daysToSell}</div>
            <div className="s">Median, dealer retail</div>
          </div>
          <div className="kpi">
            <div className="l">For sale now</div>
            <div className="v">{g.active}</div>
            <div className="s">Asking {usdK(g.activeMedian)} median</div>
          </div>
          <div className="kpi">
            <div className="l">Median miles</div>
            <div className="v">{mi(g.medianMiles)}</div>
            <div className="s">Listed now {mi(g.activeMedianMiles)}</div>
          </div>
          <div className="kpi kpi-cta">
            <div className="l">Ready to sell?</div>
            <Link href={listHref} className="btn primary">
              List it on InAuto
            </Link>
            <div className="s">Free · title vetting · inspection</div>
          </div>
        </div>

        <section id="value">
          <h2 className="sec">What is my {short} worth?</h2>
          <p className="sub">
            Adjust anything below. The estimate, the three ways to sell and what you would keep
            update instantly, and every path can be listed on InAuto in one click.
          </p>
          <ValuationTool
            snapshot={s}
            mode="sell"
            initial={{ generation: gen, year, miles: q.miles }}
          />
        </section>

        <section className="why-inauto">
          <h2 className="sec">Why sellers list on InAuto</h2>
          <div className="props" style={{ paddingTop: 12 }}>
            <div className="panel prop">
              <div className="eyebrow">Priced to sell</div>
              <h3>Buyers see the same data you do</h3>
              <p>
                Your listing carries the {short} market report, so your asking price is backed by{" "}
                {s.totals.dealerSales} dealer sales and {s.totals.auctionSales} auction results, not
                a guess.
              </p>
            </div>
            <div className="panel prop">
              <div className="eyebrow">Your format</div>
              <h3>Classified or auction, free to list</h3>
              <p>
                Set a price and field offers, or run a 7 or 14 day auction with a reserve. No
                listing fee, so you keep what the big platforms would charge.
              </p>
            </div>
            <div className="panel prop">
              <div className="eyebrow">Safer for both sides</div>
              <h3>Vetted title, verified buyers</h3>
              <p>
                Buyers can order title vetting and an independent condition report before they
                commit, which means fewer tire kickers and a faster close for you.
              </p>
            </div>
          </div>
          <div className="ctas" style={{ paddingTop: 16 }}>
            <Link href={listHref} className="btn primary">
              List my {year ? `${year} ` : ""}
              {short}
            </Link>
            <Link href={`/${s.make.slug}/${s.model.slug}`} className="btn">
              See the full {short} market report
            </Link>
            <Link href="/sell" className="btn">
              Value a different car
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
