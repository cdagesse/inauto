import Link from "next/link";
import type { MakeInRegion, RegionStats, TypeInRegion } from "@/lib/market/regions";
import { usdK } from "@/lib/format/money";
import { ChangePill } from "./market-nodes";

const count = (v: number) => v.toLocaleString("en-US");

export function signedPct(v: number, digits = 1): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}

/** Sales-count change against the prior 90 days; the price sibling is ChangePill. */
export function VolumePill({ change, prior }: { change: number | null; prior?: number }) {
  if (change == null) return <span className="pill">no prior read</span>;
  const up = change >= 0;
  return (
    <span
      className={`pill ${up ? "up" : "down"}`}
      title={prior != null ? `${count(prior)} sales in the prior 90 days` : undefined}
    >
      {signedPct(change, 0)} volume
    </span>
  );
}

function TypeRead({ t }: { t: TypeInRegion | null }) {
  if (!t || t.priceChange == null) return <span className="hint">n/a</span>;
  return (
    <>
      <Link href={`/markets/${t.key}`} className="seg-link-name">
        {t.short}
      </Link>{" "}
      <span className={`pill ${t.priceChange >= 0 ? "up" : "down"}`}>
        {signedPct(t.priceChange)}
      </span>
    </>
  );
}

function typeLine(t: TypeInRegion | null, label: string): string | null {
  if (!t || t.priceChange == null) return null;
  return `${label}: ${t.short} ${signedPct(t.priceChange)}`;
}

/** One region on the Markets page: sales, typical price, days to sell, and the price and volume moves. */
export function RegionCard({ region }: { region: RegionStats }) {
  const reads = [typeLine(region.strongest, "Strongest"), typeLine(region.softest, "Softest")]
    .filter((s): s is string => s != null)
    .join(" · ");
  return (
    <Link href={`/markets/regions/${region.key}`} className="panel node-card link-card">
      <div className="node-head">
        <div>
          <div className="name">{region.name}</div>
          <p className="blurb">{region.blurb}</p>
        </div>
      </div>
      <div className="node-nums">
        <div>
          <div className="lab">Dealer sales · 90 days</div>
          <div className="num big">{count(region.sales90)}</div>
        </div>
        <div>
          <div className="lab">Typical price</div>
          <div className="num big">
            {region.medianPrice != null ? usdK(region.medianPrice) : "n/a"}
          </div>
        </div>
        <div>
          <div className="lab">Days to sell</div>
          <div className="num big">{region.daysToSell ?? "n/a"}</div>
        </div>
        <div className="chg-cell">
          <ChangePill change={region.priceChange} n90={region.n90} />
        </div>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>
        <VolumePill change={region.volumeChange} prior={region.prior90} />
      </div>
      <div className="hint foot">{reads || "Not enough sales for a type read yet"}</div>
    </Link>
  );
}

/** Regions side by side: sales, share, price and volume moves, days to sell, strongest and softest type. */
export function RegionsTable({ regions }: { regions: RegionStats[] }) {
  return (
    <div className="tw">
      <table className="compare">
        <thead>
          <tr>
            <th>Region</th>
            <th className="n">Dealer sales · 90d</th>
            <th className="n">Share</th>
            <th className="n">Prices · 90d</th>
            <th className="n">Volume vs prior 90</th>
            <th className="n">Days to sell</th>
            <th>Strongest type</th>
            <th>Softest type</th>
          </tr>
        </thead>
        <tbody>
          {regions.map((r) => (
            <tr key={r.key}>
              <td>
                <Link href={`/markets/regions/${r.key}`} className="seg-link-name">
                  {r.name}
                </Link>
                <div className="hint">{r.states.join(", ")}</div>
              </td>
              <td className="n">{count(r.sales90)}</td>
              <td className="n">{Math.round(r.share * 100)}%</td>
              <td className="n">
                <ChangePill change={r.priceChange} n90={r.n90} />
              </td>
              <td className="n">
                <VolumePill change={r.volumeChange} prior={r.prior90} />
              </td>
              <td className="n">{r.daysToSell ?? "n/a"}</td>
              <td>
                <TypeRead t={r.strongest} />
              </td>
              <td>
                <TypeRead t={r.softest} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Which types of car are winning in a region: ranked by sales, with price and volume moves. */
export function TypesTable({ types }: { types: TypeInRegion[] }) {
  return (
    <div className="tw">
      <table className="compare">
        <thead>
          <tr>
            <th>Type</th>
            <th className="n">Dealer sales · 90d</th>
            <th className="n">Share</th>
            <th className="n">Prices · 90d</th>
            <th className="n">Volume vs prior 90</th>
            <th className="n">Days to sell</th>
            <th className="n">Typical price</th>
          </tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr key={t.key}>
              <td>
                <Link href={`/markets/${t.key}`} className="seg-link-name">
                  {t.name}
                </Link>
              </td>
              <td className="n">{count(t.sales90)}</td>
              <td className="n">{Math.round(t.share * 100)}%</td>
              <td className="n">
                <ChangePill change={t.priceChange} n90={t.n90} />
              </td>
              <td className="n">
                <VolumePill change={t.volumeChange} prior={t.prior90} />
              </td>
              <td className="n">{t.daysToSell ?? "n/a"}</td>
              <td className="n">{t.medianPrice != null ? usdK(t.medianPrice) : "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Top makes in a region by sales, with their price and volume moves. */
export function MakesTable({ makes }: { makes: MakeInRegion[] }) {
  return (
    <div className="tw">
      <table className="compare">
        <thead>
          <tr>
            <th>Make</th>
            <th className="n">Dealer sales · 90d</th>
            <th className="n">Prices · 90d</th>
            <th className="n">Volume vs prior 90</th>
            <th className="n">Days to sell</th>
            <th className="n">Typical price</th>
          </tr>
        </thead>
        <tbody>
          {makes.map((m) => (
            <tr key={m.slug}>
              <td>
                <Link href={`/markets/${m.segment}/${m.slug}`} className="seg-link-name">
                  {m.name}
                </Link>
              </td>
              <td className="n">{count(m.sales90)}</td>
              <td className="n">
                <ChangePill change={m.priceChange} n90={m.n90} />
              </td>
              <td className="n">
                <VolumePill change={m.volumeChange} prior={m.prior90} />
              </td>
              <td className="n">{m.daysToSell ?? "n/a"}</td>
              <td className="n">{m.medianPrice != null ? usdK(m.medianPrice) : "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
