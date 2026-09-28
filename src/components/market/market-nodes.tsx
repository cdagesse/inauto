import Link from "next/link";
import type { NodeStats } from "@/lib/market/tree";
import { Sparkline } from "./sparkline";
import { usd, usdK } from "@/lib/format/money";

/** Green/red 90-day change pill, or a neutral "n/a". */
export function ChangePill({ change, n90 }: { change: number | null; n90?: number }) {
  if (change == null) return <span className="pill">no 90-day read</span>;
  const up = change >= 0;
  return (
    <span
      className={`pill ${up ? "up" : "down"}`}
      title={n90 ? `${n90} sales in 90 days` : undefined}
    >
      {up ? "+" : ""}
      {(change * 100).toFixed(1)}% 90d
    </span>
  );
}

/** KPI strip shared by the segment and make pages. */
export function NodeKpis({ stats, label }: { stats: NodeStats; label: string }) {
  return (
    <div className="kpis node-kpis">
      <div className="kpi">
        <div className="l">Median price · {label}</div>
        <div className="v">{stats.medianPrice != null ? usd(stats.medianPrice) : "n/a"}</div>
        <div className="s">Median of {stats.models} model medians, latest generation</div>
      </div>
      <div className="kpi">
        <div className="l">90-day change</div>
        {stats.change90 != null ? (
          <div className={`v chg ${stats.change90 >= 0 ? "up" : "down"}`}>
            {stats.change90 >= 0 ? "+" : ""}
            {(stats.change90 * 100).toFixed(1)}%
          </div>
        ) : (
          <div className="v">n/a</div>
        )}
        <div className="s">Sales-weighted across generations, {stats.n90} sales</div>
      </div>
      <div className="kpi">
        <div className="l">Dealer sales</div>
        <div className="v">{stats.dealerSales.toLocaleString("en-US")}</div>
        <div className="s">{stats.auctionSales.toLocaleString("en-US")} auction results</div>
      </div>
      <div className="kpi">
        <div className="l">For sale now</div>
        <div className="v">{stats.activeNow.toLocaleString("en-US")}</div>
        <div className="s">Dealer listings today</div>
      </div>
      <div className="kpi">
        <div className="l">Models with reports</div>
        <div className="v">{stats.models}</div>
        <div className="s">More build on first visit</div>
      </div>
    </div>
  );
}

export function TrendPair({ stats, wide = false }: { stats: NodeStats; wide?: boolean }) {
  const w = wide ? 520 : 220;
  const h = wide ? 96 : 56;
  return (
    <div className={`spark-pair${wide ? " wide" : ""}`}>
      <Sparkline trend={stats.trend} kind="volume" width={w} height={h} label="Sales per month" />
      <Sparkline
        trend={stats.trend}
        kind="index"
        width={w}
        height={h}
        label="Price index (100 = normal)"
      />
    </div>
  );
}

/** A drill-down card: segment on /markets, make on a segment page. */
export function NodeCard({
  href,
  eyebrow,
  title,
  blurb,
  stats,
  footer,
  logo,
}: {
  href: string;
  eyebrow?: string;
  title: string;
  blurb?: string;
  stats: NodeStats | null;
  footer: string;
  logo?: React.ReactNode;
}) {
  return (
    <Link href={href} className="panel node-card link-card">
      <div className="node-head">
        {logo}
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <div className="name">{title}</div>
        </div>
      </div>
      {blurb ? <p className="blurb">{blurb}</p> : null}
      {stats ? (
        <>
          <div className="node-nums">
            <div>
              <div className="lab">Median price</div>
              <div className="num big">
                {stats.medianPrice != null ? usdK(stats.medianPrice) : "n/a"}
              </div>
            </div>
            <div>
              <div className="lab">Dealer sales</div>
              <div className="num big">{stats.dealerSales.toLocaleString("en-US")}</div>
            </div>
            <div>
              <div className="lab">For sale</div>
              <div className="num big">{stats.activeNow.toLocaleString("en-US")}</div>
            </div>
            <div className="chg-cell">
              <ChangePill change={stats.change90} n90={stats.n90} />
            </div>
          </div>
          <TrendPair stats={stats} />
        </>
      ) : (
        <p className="note pending-note">
          No market report yet. Open a model and we build its report from dealer sales and auction
          results.
        </p>
      )}
      <div className="hint foot">{footer}</div>
    </Link>
  );
}
