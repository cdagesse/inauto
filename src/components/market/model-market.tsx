"use client";

import type { MarketSnapshot } from "@/lib/market/types";
import { useGeneration } from "./use-generation";
import { ValuationTool } from "@/components/valuation/tool";
import { TrendChart } from "./trend-chart";
import { ScatterChart } from "./scatter-chart";
import { mi, usd, usdK } from "@/lib/format/money";
import { AuctionTables, ByYearTable, RecentSalesTable } from "./tables";
import { VenueTable } from "./venue-table";
import { compareVenues } from "@/lib/market/venues";
import { AUCTION_THIN } from "@/lib/market/build";
import { monthYear } from "./format";

/** Everything on the model page that reacts to the selected generation. */
export function ModelMarket({ snapshot }: { snapshot: MarketSnapshot }) {
  const [sel, select] = useGeneration(snapshot.model.slug, snapshot.order, snapshot.order[0]);
  const g = snapshot.generations[sel];
  // A generation with no dealer sales yet reads from its sold auctions instead of showing zeros.
  const viaAuctions = g.sold === 0 && (g.auctionSold ?? 0) > 0;
  const price = viaAuctions
    ? {
        median: g.auctionMedian ?? 0,
        lo: g.auctionLo ?? 0,
        hi: g.auctionHi ?? 0,
        thin: (g.auctionSold ?? 0) < AUCTION_THIN,
        miles: g.auctionMedianMiles ?? 0,
        last90: g.auctionLast90 ?? 0,
        prior90: g.auctionPrior90 ?? 0,
        n90: g.auctionN90 ?? 0,
      }
    : {
        median: g.median,
        lo: g.lo,
        hi: g.hi,
        thin: g.thin,
        miles: g.medianMiles,
        last90: g.last90,
        prior90: g.prior90,
        n90: g.n90,
      };
  const ch = price.prior90 > 0 ? (price.last90 - price.prior90) / price.prior90 : null;
  const up = ch != null && ch >= 0;
  const multiple = viaAuctions
    ? g.msrp && price.median
      ? Math.round((price.median / g.msrp) * 100) / 100
      : 0
    : g.multiple;
  const offered = g.auctionOffered ?? 0;
  const short = snapshot.model.shortName;
  // "the S30" reads fine; "the All years" does not, so a single catch-all generation goes by
  // the model's name.
  const genRef = snapshot.order.length === 1 ? short : g.name;
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
            {viaAuctions ? "Median hammer price" : "Median sold price"} · {g.name}
            {price.thin && (
              <>
                {" "}
                <span className="pill">Thin sample</span>
              </>
            )}
          </div>
          <div className="v">{usd(price.median)}</div>
          <div className="s">
            Typical range {usd(price.lo)} to {usd(price.hi)}
          </div>
        </div>
        <div className="kpi">
          <div className="l">90-day change</div>
          {ch == null ? (
            <div className="v">n/a</div>
          ) : (
            <div className={`v chg ${up ? "up" : "down"}`}>
              {up ? "+" : ""}
              {(ch * 100).toFixed(1)}%
            </div>
          )}
          <div className="s">
            {ch == null
              ? "Not enough sales in the prior 90 days"
              : `${usdK(price.prior90)} to ${usdK(price.last90)} median, ${price.n90} ${
                  viaAuctions ? "auction " : ""
                }sales in last 90 days`}
          </div>
        </div>
        {viaAuctions ? (
          <div className="kpi">
            <div className="l">Auction sales since {monthYear(snapshot.auctionSince)}</div>
            <div className="v">{g.auctionSold}</div>
            <div className="s">
              {offered > 0
                ? `${offered} offered, ${Math.round(((g.auctionSold ?? 0) / offered) * 100)}% sold`
                : "Hammer prices, reserve-not-met excluded"}
            </div>
          </div>
        ) : (
          <div className="kpi">
            <div className="l">Sales since {dealerSinceLabel}</div>
            <div className="v">{g.sold}</div>
            <div className="s">Median {g.daysToSell} days to sell</div>
          </div>
        )}
        <div className="kpi">
          <div className="l">For sale now</div>
          <div className="v">{g.active}</div>
          <div className="s">
            {g.active > 0 ? `Asking ${usdK(g.activeMedian)} median` : "No dealer listings pulled"}
          </div>
        </div>
        <div className="kpi">
          <div className="l">Median miles</div>
          <div className="v">{mi(price.miles)}</div>
          <div className="s">
            {viaAuctions ? "On sold auction cars" : `Listed now ${mi(g.activeMedianMiles)}`}
          </div>
        </div>
        <div className="kpi">
          <div className="l">vs. original sticker</div>
          <div className="v">{multiple ? `${multiple.toFixed(2)}×` : "n/a"}</div>
          <div className="s">
            {g.msrp ? `MSRP ${usdK(g.msrp)} median` : "No original MSRP on file"}
          </div>
        </div>
      </div>
      {viaAuctions && (
        <p className="note">
          No dealer sales for the {genRef} have been pulled yet, so these figures come from{" "}
          {g.auctionSold} auction results. Dealer figures replace them once sales are on file.
        </p>
      )}

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
        {chartable.length ? (
          <>
            <p className="sub">
              Median dealer sold price per month for the{" "}
              {chartable.length === 1 ? "generation" : `${chartable.length} generations`} with
              enough sales to chart. Generations that trade too thinly for a monthly line are in the
              tables below.
            </p>
            <div className="panel">
              <TrendChart snapshot={snapshot} selected={sel} />
            </div>
          </>
        ) : (
          <p className="sub">
            Not enough monthly dealer sales to chart a trend yet.
            {snapshot.totals.auctionSales > 0
              ? " The auction results below carry the price history for now."
              : ""}
          </p>
        )}
      </section>

      <section>
        <h2 className="sec">Price vs. mileage, {g.name}</h2>
        <p className="sub">
          {snapshot.dealerSales[sel]?.length
            ? `Each dot is one ${g.name} dealer sale since ${dealerSinceLabel}; diamonds are auction sales. ${
                sel === snapshot.order[0]
                  ? "Delivery-mile cars carry the biggest premium; the curve flattens after about 2,500 miles."
                  : `Miles matter less than on the ${snapshot.order[0]}; condition, color and spec explain most of the spread.`
              }`
            : `No ${genRef} dealer sales on file yet; each diamond is one auction sale.`}
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
          {snapshot.byYearBasis === "auction"
            ? "Auction hammer prices by model year; no dealer sales have been pulled yet."
            : "Dealer sold results by model year."}
          {snapshot.model.slug === "911-gt3-rs"
            ? " The 2011 figures include the RS 4.0, a 600-car run that sells at a large premium to the standard 997.2."
            : ""}
        </p>
        <ByYearTable snapshot={snapshot} selected={sel} />
      </section>

      {snapshot.totals.dealerSales > 0 && <StaticTables snapshot={snapshot} />}

      <section>
        <h2 className="sec">Auction results</h2>
        <p className="sub">
          The {snapshot.auctions.length} most recent {short} auctions across Bring a Trailer,
          Sotheby&apos;s Motorsport, Bonhams, Barrett-Jackson and Hagerty, from Old Cars Data.
          Hammer prices are what the car actually sold for; reserve-not-met rows show the high bid.
        </p>
        <AuctionTables snapshot={snapshot} selected={sel} />
      </section>

      <section id="venues">
        <h2 className="sec">Where the {genRef} sells best</h2>
        <p className="sub">
          The same generation, venue by venue: how many came to auction, how many actually sold, and
          the median hammer. Enter your mileage in the value tool above and the sell page narrows
          this to cars like yours.
        </p>
        <VenueTable comparison={compareVenues(snapshot, { generation: sel })} short={short} />
      </section>

      <section>
        <h2 className="sec">Recent dealer sales</h2>
        {snapshot.recentDealerSales.length ? (
          <>
            <p className="sub">The latest dealer sales with an advertised price.</p>
            <RecentSalesTable snapshot={snapshot} selected={sel} />
          </>
        ) : (
          <p className="sub">No dealer sales have been pulled for the {short} yet.</p>
        )}
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
