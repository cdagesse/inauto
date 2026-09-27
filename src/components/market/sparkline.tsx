import type { TrendPoint } from "@/lib/market/tree";
import { monthLabel } from "./format";

/**
 * Server-rendered SVG sparklines for the Markets drill-down. "volume" draws
 * monthly sales as bars; "index" draws the price index as a line against a
 * 100 baseline. Partial months are hatched lighter.
 */
export function Sparkline({
  trend,
  kind,
  width = 220,
  height = 56,
  label,
}: {
  trend: TrendPoint[];
  kind: "volume" | "index";
  width?: number;
  height?: number;
  label?: string;
}) {
  const pad = { t: 6, b: 16, l: 4, r: 4 };
  const W = width;
  const H = height;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const n = trend.length;
  const first = trend[0]?.month;
  const last = trend[n - 1]?.month;
  const empty = trend.every((p) => (kind === "volume" ? p.n === 0 : p.index == null));

  let body: React.ReactNode;
  if (empty || n === 0) {
    body = (
      <text x={W / 2} y={pad.t + innerH / 2 + 4} textAnchor="middle" className="spark-empty">
        no data yet
      </text>
    );
  } else if (kind === "volume") {
    const max = Math.max(1, ...trend.map((p) => p.n));
    const gap = 3;
    const bw = (innerW - gap * (n - 1)) / n;
    body = trend.map((p, i) => {
      const h = (p.n / max) * innerH;
      return (
        <rect
          key={p.month}
          x={pad.l + i * (bw + gap)}
          y={pad.t + innerH - h}
          width={bw}
          height={Math.max(h, p.n > 0 ? 1.5 : 0)}
          rx={1.5}
          className={`spark-bar${p.partial ? " partial" : ""}`}
        >
          <title>
            {monthLabel(p.month)}: {p.n} sales{p.partial ? " (partial month)" : ""}
          </title>
        </rect>
      );
    });
  } else {
    const vals = trend.map((p) => p.index).filter((v): v is number => v != null);
    const lo = Math.min(100, ...vals);
    const hi = Math.max(100, ...vals);
    const span = Math.max(hi - lo, 4);
    const ys = (v: number) => pad.t + innerH * (1 - (v - (lo - span * 0.08)) / (span * 1.16));
    const xs = (i: number) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const pts = trend
      .map((p, i) => (p.index == null ? null : `${xs(i).toFixed(1)},${ys(p.index).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
    const lastPt = [...trend].reverse().find((p) => p.index != null);
    const lastIdx = lastPt ? trend.indexOf(lastPt) : -1;
    body = (
      <>
        <line x1={pad.l} x2={W - pad.r} y1={ys(100)} y2={ys(100)} className="spark-base" />
        <polyline points={pts} className="spark-line" />
        {lastPt && lastPt.index != null ? (
          <circle cx={xs(lastIdx)} cy={ys(lastPt.index)} r={2.5} className="spark-dot" />
        ) : null}
        {trend.map((p, i) =>
          p.index != null ? (
            <circle key={p.month} cx={xs(i)} cy={ys(p.index)} r={6} fill="transparent">
              <title>
                {monthLabel(p.month)}: index {p.index}
                {p.partial ? " (partial month)" : ""}
              </title>
            </circle>
          ) : null,
        )}
      </>
    );
  }

  return (
    <figure className="spark">
      {label ? <figcaption className="lab">{label}</figcaption> : null}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`${label ?? kind} trend, ${first ?? ""} to ${last ?? ""}`}
      >
        {body}
        {first && last && n > 1 ? (
          <>
            <text x={pad.l} y={H - 3} className="spark-axis">
              {monthLabel(first)}
            </text>
            <text x={W - pad.r} y={H - 3} textAnchor="end" className="spark-axis">
              {monthLabel(last)}
            </text>
          </>
        ) : null}
      </svg>
    </figure>
  );
}
