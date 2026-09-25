"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MarketSnapshot } from "@/lib/market/types";
import { valuate } from "@/lib/valuation/engine";
import type { ValuationResult } from "@/lib/valuation/types";
import { mi, usd, usdK } from "./format";
import { priceDelta } from "./market-summary-lib";
import { ScatterChart } from "./scatter-chart";
import { TrendChart } from "./trend-chart";

export interface SummaryCar {
  year: number | null;
  miles: number | null;
  price: number | null;
  packages: string[];
  title: string;
}

/**
 * The market page's core sections, scoped to one car, for listing detail pages:
 * KPI row, this car against the market, the trend and mileage charts, and comps.
 * Same components and CSS as the model page so the two read as one product.
 */
export function MarketSummary({
  snapshot,
  generation,
  car,
  priceLabel,
  reportHref,
}: {
  snapshot: MarketSnapshot;
  generation: string;
  car: SummaryCar;
  priceLabel: "Current bid" | "Asking price" | "Sold for";
  reportHref: string;
}) {
  const initial = snapshot.generations[generation] ? generation : snapshot.order[0];
  const [sel, setSel] = useState(initial);
  const g = snapshot.generations[sel];
  const ch = g.prior90 > 0 ? (g.last90 - g.prior90) / g.prior90 : 0;
  const up = ch >= 0;
  const dealerSinceLabel = fmtShort(snapshot.dealerSince);
  const bands = snapshot.milesBands[sel];
  const bandMax = bands ? Math.max(...bands.map((b) => b.median)) : 0;
  const milesUsed = car.miles ?? g.medianMiles;
  const yearUsed =
    car.year != null && snapshot.years[sel]?.includes(car.year)
      ? car.year
      : (snapshot.years[sel]?.[0] ?? car.year ?? new Date().getUTCFullYear());

  const valuation = useMemo<ValuationResult | null>(() => {
    try {
      return valuate(snapshot, {
        generation: sel,
        year: yearUsed,
        miles: milesUsed,
        packages: car.packages,
        colorClass: "std",
        condition: "ex",
        history: "clean",
      });
    } catch {
      return null;
    }
  }, [snapshot, sel, yearUsed, milesUsed, car.packages]);

  const delta = valuation ? priceDelta(car.price, valuation.marketValue, priceLabel) : null;
  const highlight =
    car.price && car.price > 0
      ? { miles: milesUsed, price: car.price, label: "This car" }
      : undefined;

  return (
    <section className="market-summary market" aria-labelledby="ms-h">
      <div className="ms-head">
        <div>
          <div className="eyebrow">Market data</div>
          <h2 id="ms-h" className="sec">
            {snapshot.make.name} {snapshot.model.name}
          </h2>
        </div>
        <Link href={reportHref} className="btn sm">
          Full market report →
        </Link>
      </div>

      {snapshot.order.length > 1 && (
        <nav className="gens" aria-label="Generation">
          {snapshot.order.map((k) => {
            const gg = snapshot.generations[k];
            return (
              <button
                key={k}
                type="button"
                className="gen"
                aria-pressed={k === sel}
                onClick={() => setSel(k)}
              >
                <b>{gg.name}</b>
                <small>{gg.years}</small>
              </button>
            );
          })}
        </nav>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="l">
            Median sold price · {g.name}
            {g.thin && (
              <>
                {" "}
                <span className="pill">Thin sample</span>
              </>
            )}
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
          <div className="s">
            {usdK(g.prior90)} to {usdK(g.last90)} median, {g.n90} sales in last 90 days
          </div>
        </div>
        <div className="kpi">
          <div className="l">Sales since {dealerSinceLabel}</div>
          <div className="v">{g.sold}</div>
          <div className="s">Median {g.daysToSell} days to sell</div>
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
        <div className="kpi">
          <div className="l">vs. original sticker</div>
          <div className="v">{g.multiple.toFixed(2)}×</div>
          <div className="s">MSRP {usdK(g.msrp)} median</div>
        </div>
      </div>

      <section>
        <h2 className="sec">This car vs. the market</h2>
        <p className="sub">
          A {yearUsed} {g.name} at {mi(milesUsed)} miles
          {car.miles == null ? " (mileage not listed, so we use the typical figure)" : ""}
          {car.packages.includes("weissach") ? " with the Weissach package" : ""}, assuming a
          standard color, excellent condition and a clean history.
        </p>
        {valuation ? (
          <div className="this-car">
            <div className="panel">
              <div className="lab">Our market value</div>
              <div className="display num big">{usd(valuation.marketValue)}</div>
              <div className="hint">
                Typical range {usd(valuation.range.lo)} to {usd(valuation.range.hi)}
                {valuation.thin ? " · thin sample, treat as a starting point" : ""}
              </div>
            </div>
            <div className="panel">
              <div className="lab">{priceLabel}</div>
              <div className="display num big">{car.price ? usd(car.price) : "No price yet"}</div>
              {delta ? (
                <div className={`delta ${delta.direction}`}>{delta.text}.</div>
              ) : (
                <div className="hint">Nothing to compare against yet.</div>
              )}
              <div className="hint" style={{ marginTop: 6 }}>
                Expected hammer at auction {usd(valuation.auction.expectedHammer)} · typical dealer
                offer {usd(valuation.dealer.offer)}
              </div>
            </div>
          </div>
        ) : (
          <p className="note">Not enough {g.name} sales to value this car yet.</p>
        )}
      </section>

      {snapshot.chartSeries.length > 0 && (
        <section>
          <h2 className="sec">Price trend by generation</h2>
          <p className="sub">
            Median sold price per month for the generations with enough sales to chart.
          </p>
          <div className="panel">
            <TrendChart snapshot={snapshot} selected={sel} />
          </div>
        </section>
      )}

      <section>
        <h2 className="sec">Price vs. mileage, {g.name}</h2>
        <p className="sub">
          Each dot is one {g.name} dealer sale since {dealerSinceLabel}; diamonds are auction sales.
          {highlight ? " The ring is this car." : ""}
        </p>
        <div className="grid2">
          <div className="panel">
            <ScatterChart snapshot={snapshot} selected={sel} highlight={highlight} />
          </div>
          <div>
            {bands && (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Mileage</th>
                      <th className="n">Sold</th>
                      <th>Median price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bands.map((b) => (
                      <tr key={b.from}>
                        <td className="mono">
                          {mi(b.from)}
                          {b.to ? " to " + mi(b.to) : "+"}
                        </td>
                        <td className="n">{b.n}</td>
                        <td>
                          <div className="bar-cell">
                            <span className="num">{usd(b.median)}</span>
                            <i style={{ width: `${((b.median / bandMax) * 60).toFixed(0)}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {valuation && valuation.comps.length > 0 && (
        <section>
          <h2 className="sec">Closest comparable sales</h2>
          <p className="sub">Nearest {g.name} sales by mileage, dealer and auction.</p>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="n">Miles</th>
                  <th className="n">Price</th>
                </tr>
              </thead>
              <tbody>
                {valuation.comps.map((c, i) => (
                  <tr key={i}>
                    <td>
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noopener noreferrer">
                          {c.year ?? ""}
                          {c.packages?.includes("weissach") ? " Weissach" : ""}
                          {c.year ? ", " : ""}
                          {c.source}
                        </a>
                      ) : (
                        c.source
                      )}
                    </td>
                    <td className="n">{mi(c.miles)}</td>
                    <td className="n">
                      {usd(c.price)}
                      {c.rnm ? (
                        <>
                          {" "}
                          <span className="rnm">High bid, no sale</span>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="note">
        Built from {snapshot.totals.dealerSales.toLocaleString("en-US")} dealer sales and{" "}
        {snapshot.totals.auctionSales} auction results, data through {snapshot.dataThrough}. Value
        from a price-vs-mileage curve fit to {g.name} dealer sales. This is an estimate, not an
        offer.
      </p>
    </section>
  );
}

function fmtShort(d: string) {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
}
