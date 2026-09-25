"use client";

import type { MarketSnapshot } from "@/lib/market/types";
import { useGeneration } from "./use-generation";
import { ValuationTool } from "@/components/valuation/tool";
import { TrendChart } from "./trend-chart";
import { ScatterChart } from "./scatter-chart";
import { mi, usd, usdK } from "./format";
import { AuctionTables, ByYearTable, RecentSalesTable } from "./tables";

/** Everything on the model page that reacts to the selected generation. */
export function ModelMarket({ snapshot }: { snapshot: MarketSnapshot }) {
  const [sel, select] = useGeneration(snapshot.model.slug, snapshot.order, snapshot.order[0]);
  const g = snapshot.generations[sel];
  const ch = (g.last90 - g.prior90) / g.prior90;
  const up = ch >= 0;
  const short = snapshot.model.shortName;
  const dealerSinceLabel = fmtShort(snapshot.dealerSince);
  const bands = snapshot.milesBands[sel];
  const bandMax = bands ? Math.max(...bands.map((b) => b.median)) : 0;
  const first = bands?.[0];
  const last = bands?.[bands.length - 1];
  const chartable = snapshot.chartSeries;

  return (
    <div className="market">
      <nav className="gens" aria-label="Generation">
        {snapshot.order.map((k) => {
          const gg = snapshot.generations[k];
          return (
            <button
              key={k}
              type="button"
              className="gen"
              aria-pressed={k === sel}
              onClick={() => select(k)}
            >
              <b>{gg.name}</b>
              <small>{gg.years}</small>
            </button>
          );
        })}
      </nav>

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

      <section id="value">
        <h2 className="sec">What is my {short} worth?</h2>
        <p className="sub">
          Enter your car and we&apos;ll estimate its market value from the dealer and auction sales
          on this page, then show what you&apos;d walk away with at auction, selling to a dealer, or
          listing it yourself.
        </p>
        <ValuationTool snapshot={snapshot} />
      </section>

      <section>
        <h2 className="sec">Price trend by generation</h2>
        <p className="sub">
          Median sold price per month for the {chartable.length === 3 ? "three" : chartable.length}{" "}
          generations with enough sales to chart. The 997 cars trade too thinly for a monthly line;
          their sales are in the table below.
        </p>
        <div className="panel">
          <TrendChart snapshot={snapshot} selected={sel} />
        </div>
      </section>

      <section>
        <h2 className="sec">Price vs. mileage, {g.name}</h2>
        <p className="sub">
          {snapshot.dealerSales[sel]
            ? `Each dot is one ${g.name} dealer sale since ${dealerSinceLabel}; diamonds are auction sales. ${
                sel === snapshot.order[0]
                  ? "Delivery-mile cars carry the biggest premium; the curve flattens after about 2,500 miles."
                  : `Miles matter less than on the ${snapshot.order[0]}; condition, color and spec explain most of the spread.`
              }`
            : ""}
        </p>
        <div className="grid2">
          <div className="panel">
            <ScatterChart snapshot={snapshot} selected={sel} />
          </div>
          <div>
            {bands && (
              <>
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
                {first && last && (
                  <p className="note">
                    A {g.name} under {mi(first.to)} miles sells for about{" "}
                    {usdK(first.median - last.median)} more than one over {mi(last.from)} miles.
                    {sel === "991.1"
                      ? " Mileage bands use the 60 sales left after removing the mislabeled listings."
                      : ""}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="sec">By model year</h2>
        <p className="sub">
          Sold results by model year. The 2011 figures include the RS 4.0, a 600-car run that sells
          at a large premium to the standard 997.2.
        </p>
        <ByYearTable snapshot={snapshot} selected={sel} />
      </section>

      <StaticTables snapshot={snapshot} />

      <section>
        <h2 className="sec">Auction results</h2>
        <p className="sub">
          The {snapshot.auctions.length} most recent {short} auctions across Bring a Trailer,
          Sotheby&apos;s Motorsport, Bonhams, Barrett-Jackson and Hagerty, from Old Cars Data.
          Hammer prices are what the car actually sold for; reserve-not-met rows show the high bid.
        </p>
        <AuctionTables snapshot={snapshot} selected={sel} />
      </section>

      <section>
        <h2 className="sec">Recent dealer sales</h2>
        <p className="sub">The latest dealer sales with an advertised price.</p>
        <RecentSalesTable snapshot={snapshot} selected={sel} />
      </section>
    </div>
  );
}

function StaticTables({ snapshot }: { snapshot: MarketSnapshot }) {
  const white =
    snapshot.colors.find((c) => c.color === "White")?.median ?? snapshot.colors[0]?.median ?? 1;
  const tot = snapshot.totals.dealerSales;
  const smax = snapshot.states[0]?.n ?? 1;
  const top = snapshot.order[0];
  return (
    <section className="grid2">
      <div>
        <h2 className="sec">Color premium, {top}</h2>
        <p className="sub">Median sold price by exterior color, colors with at least 5 sales.</p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Color</th>
                <th className="n">Sold</th>
                <th className="n">Median</th>
                <th className="n">vs. White</th>
              </tr>
            </thead>
            <tbody>
              {[...snapshot.colors]
                .sort((a, b) => b.median - a.median)
                .map((c) => {
                  const d = (c.median - white) / white;
                  return (
                    <tr key={c.color}>
                      <td>{c.color}</td>
                      <td className="n">{c.n}</td>
                      <td className="n">{usd(c.median)}</td>
                      <td
                        className="n mono"
                        style={{
                          color:
                            d > 0.001 ? "var(--up)" : d < -0.001 ? "var(--down)" : "var(--ink-3)",
                        }}
                      >
                        {d > 0 ? "+" : ""}
                        {(d * 100).toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h2 className="sec">Where they sell</h2>
        <p className="sub">Share of all {snapshot.model.shortName} sales by dealer state.</p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>State</th>
                <th className="n">Sales</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.states.map((s) => (
                <tr key={s.state}>
                  <td className="mono">{s.state}</td>
                  <td className="n">{s.n}</td>
                  <td>
                    <div className="bar-cell">
                      <span className="num">{((s.n / tot) * 100).toFixed(0)}%</span>
                      <i style={{ width: `${((s.n / smax) * 60).toFixed(0)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function fmtShort(d: string) {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
}
