import type { MarketSnapshot } from "@/lib/market/types";
import { dayLabel, longDate, median, mi, usd } from "./format";

/** Generation-aware tables. Pure components: fine in client or server trees. */

export function ByYearTable({
  snapshot,
  selected,
}: {
  snapshot: MarketSnapshot;
  selected: string;
}) {
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            <th>Model year</th>
            <th>Generation</th>
            <th className="n">Sold</th>
            <th className="n">Median price</th>
            <th className="n">Median miles</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.byYear.map((r) => (
            <tr key={r.year} className={r.generation === selected ? "sel" : undefined}>
              <td className="mono">{r.year}</td>
              <td>
                {r.generation}
                {r.n < 8 && (
                  <>
                    {" "}
                    <span className="pill">Thin</span>
                  </>
                )}
              </td>
              <td className="n">{r.n}</td>
              <td className="n">{usd(r.median)}</td>
              <td className="n">{mi(r.medianMiles)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuctionTables({
  snapshot,
  selected,
}: {
  snapshot: MarketSnapshot;
  selected: string;
}) {
  const A = snapshot.auctions;
  const short = snapshot.model.shortName;
  const rows = snapshot.order
    .map((code) => {
      const s = A.filter((r) => r.status === "sold" && r.generation === code);
      const g = snapshot.generations[code];
      return {
        code,
        n: s.length,
        aucMed: median(s.map((r) => r.price)),
        aucMiles: median(s.map((r) => r.miles)),
        dealerMed: g.median,
        dealerMiles: g.medianMiles,
      };
    })
    .filter((r) => r.n > 0);
  return (
    <>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Generation</th>
              <th className="n">Auction sales</th>
              <th className="n">Auction median</th>
              <th className="n">Their median miles</th>
              <th className="n">Dealer median</th>
              <th className="n">Dealer miles</th>
              <th className="n">Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gap = ((r.aucMed ?? 0) - r.dealerMed) / r.dealerMed;
              return (
                <tr key={r.code} className={r.code === selected ? "sel" : undefined}>
                  <td>{r.code}</td>
                  <td className="n">{r.n}</td>
                  <td className="n">{usd(r.aucMed)}</td>
                  <td className="n">{mi(r.aucMiles)}</td>
                  <td className="n">{usd(r.dealerMed)}</td>
                  <td className="n">{mi(r.dealerMiles)}</td>
                  <td className="n mono" style={{ color: gap >= 0 ? "var(--up)" : "var(--down)" }}>
                    {gap >= 0 ? "+" : ""}
                    {(gap * 100).toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Read the gap with care: most of the {snapshot.order[0]} auction cars were Weissach-package
        cars, and a few auction results per generation is a small sample. The 991 cars come in 5 to
        7 percent under dealer asks at similar miles, roughly the room you&apos;d expect between a
        dealer&apos;s asking price and a hammer price. The 997.1 figure is a single 33,780-mile car
        and says little about the generation.
      </p>
      <div className="tw" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>Ended</th>
              <th>Car</th>
              <th>Platform</th>
              <th className="n">Miles</th>
              <th className="n">Result</th>
            </tr>
          </thead>
          <tbody>
            {A.map((r) => (
              <tr key={r.id} className={r.generation === selected ? "sel" : undefined}>
                <td className="mono">{longDate(r.endedAt)}</td>
                <td>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.year} {short}
                    {r.weissach ? " Weissach" : ""}
                  </a>{" "}
                  <span style={{ color: "var(--ink-3)" }}>{r.generation}</span>
                </td>
                <td className="src">{r.platform}</td>
                <td className="n">{mi(r.miles)}</td>
                <td className="n">
                  {usd(r.price)}
                  {r.status === "rnm" && (
                    <>
                      {" "}
                      <span className="rnm">High bid, no sale</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function RecentSalesTable({
  snapshot,
  selected,
}: {
  snapshot: MarketSnapshot;
  selected: string;
}) {
  const short = snapshot.model.shortName;
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            <th>Sold</th>
            <th>Car</th>
            <th>Color</th>
            <th className="n">Miles</th>
            <th className="n">Price</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.recentDealerSales.map((r, i) => (
            <tr key={i} className={r.generation === selected ? "sel" : undefined}>
              <td className="mono">{dayLabel(r.soldDate)}</td>
              <td>
                {r.year} {short} <span style={{ color: "var(--ink-3)" }}>{r.generation}</span>
              </td>
              <td>{r.color || <span style={{ color: "var(--ink-3)" }}>Not listed</span>}</td>
              <td className="n">{mi(r.miles)}</td>
              <td className="n">{usd(r.price)}</td>
              <td className="mono">{r.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GenerationGuide({ snapshot }: { snapshot: MarketSnapshot }) {
  return (
    <div className="guide">
      {[...snapshot.order].reverse().map((code) => {
        const g = snapshot.generations[code];
        return (
          <div className="g" key={code}>
            <h3>{g.name}</h3>
            <div className="yrs">{g.years}</div>
            <dl>
              <dt>Engine</dt>
              <dd>{g.engine}</dd>
              <dt>Output</dt>
              <dd>{g.hp}</dd>
              <dt>Gearbox</dt>
              <dd>{g.gearbox}</dd>
              <dt>Sticker</dt>
              <dd>{usd(g.msrp)}</dd>
              <dt>Sells for</dt>
              <dd>
                <b>{usd(g.median)}</b>
              </dd>
              <dt>Multiple</dt>
              <dd>{g.multiple.toFixed(2)}×</dd>
            </dl>
            {g.extra && (
              <div className="note" style={{ fontSize: 12 }}>
                {g.extra}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
