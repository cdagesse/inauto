"use client";

import { useState } from "react";
import type { MarketSnapshot } from "@/lib/market/types";
import { monthLabel, niceTicks, seriesVar, usd, usdK } from "./format";
import { useWidth } from "./use-width";

export function TrendChart({ snapshot, selected }: { snapshot: MarketSnapshot; selected: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(900);
  const [hover, setHover] = useState<number | null>(null);
  const W = Math.max(320, width);
  const H = 320;
  const M = { l: 58, r: 64, t: 14, b: 30 };
  const months = snapshot.monthly;
  const series = snapshot.chartSeries;
  const step = (W - M.l - M.r) / (months.length - 1);
  const xs = (i: number) => M.l + i * step;
  const vals: number[] = [];
  for (const d of months) for (const k of series) if (d.series[k]) vals.push(d.series[k].median);
  const ticks = niceTicks(Math.min(...vals) * 0.92, Math.max(...vals) * 1.03, 5);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const ys = (v: number) => M.t + (H - M.t - M.b) * (1 - (v - y0) / (y1 - y0));
  const pw = step / 2;
  const selInSeries = series.includes(selected);
  const year = months[0]?.month.slice(0, 4);

  return (
    <>
      <div className="legend">
        {series.map((k, i) => (
          <span key={k}>
            <i style={{ background: seriesVar(i) }} />
            {k}
          </span>
        ))}
        <span style={{ color: "var(--ink-3)" }}>* partial month · points need 3+ sales</span>
      </div>
      <div className="chart" ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          aria-label="Median monthly sold price by generation"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.l}
                x2={W - M.r}
                y1={ys(t)}
                y2={ys(t)}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text x={M.l - 8} y={ys(t) + 4} textAnchor="end">
                {usdK(t)}
              </text>
            </g>
          ))}
          {months.map((m, i) => (
            <text key={m.month} x={xs(i)} y={H - 8} textAnchor="middle">
              {monthLabel(m.month) + (m.partial ? "*" : "")}
            </text>
          ))}
          {[0, months.length - 1].map((i) => (
            <rect
              key={i}
              x={Math.max(M.l, xs(i) - pw)}
              y={M.t}
              width={pw}
              height={H - M.t - M.b}
              fill="var(--grid)"
              opacity={0.5}
            />
          ))}
          {series.map((k, si) => {
            const pts = months
              .map((d, i) =>
                d.series[k] && d.series[k].n >= 3 ? { x: xs(i), y: ys(d.series[k].median) } : null,
              )
              .filter((p): p is { x: number; y: number } => p !== null);
            if (!pts.length) return null;
            const isSel = k === selected;
            const col = seriesVar(si);
            const last = pts[pts.length - 1];
            return (
              <g key={k} opacity={isSel || !selInSeries ? 1 : 0.45}>
                <path
                  d={pts
                    .map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1))
                    .join(" ")}
                  fill="none"
                  stroke={col}
                  strokeWidth={isSel ? 3 : 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {pts.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={isSel ? 4.5 : 3.5}
                    fill={col}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ))}
                <text x={last.x + 10} y={last.y + 4} className="lbl">
                  {k}
                </text>
              </g>
            );
          })}
          {hover !== null && (
            <line
              x1={xs(hover)}
              x2={xs(hover)}
              y1={M.t}
              y2={H - M.b}
              stroke="var(--ink-3)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
            />
          )}
          <rect
            x={M.l - 20}
            y={0}
            width={W - M.l - M.r + 40}
            height={H}
            fill="transparent"
            onPointerMove={(e) => {
              const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
              const x = ((e.clientX - r.left) * W) / r.width;
              let i = Math.round((x - M.l) / step);
              i = Math.max(0, Math.min(months.length - 1, i));
              setHover(i);
            }}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover !== null && (
          <div className="tip on" style={{ left: `${(xs(hover) / W) * 100}%`, top: M.t + 30 }}>
            <div style={{ opacity: 0.7, marginBottom: 2 }}>
              {monthLabel(months[hover].month)} {year}
              {months[hover].partial ? " (partial)" : ""}
            </div>
            {series.map((k) => {
              const s = months[hover].series[k];
              return s ? (
                <div key={k}>
                  {k} <b>{usd(s.median)}</b> <span style={{ opacity: 0.7 }}>{s.n} sold</span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    </>
  );
}
