"use client";

import { useState } from "react";
import type { MarketSnapshot } from "@/lib/market/types";
import { mi, niceTicks, seriesVar, usd, usdK } from "./format";
import { useWidth } from "./use-width";

type Tip = { x: number; y: number; html: React.ReactNode };

export interface ScatterHighlight {
  miles: number;
  price: number;
  label: string;
}

export function ScatterChart({
  snapshot,
  selected,
  highlight,
}: {
  snapshot: MarketSnapshot;
  selected: string;
  /** One extra point (for example the car on a listing page) drawn as a ring on top of the cloud. */
  highlight?: ScatterHighlight;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const [tip, setTip] = useState<Tip | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const g = snapshot.generations[selected];
  const pts = snapshot.dealerSales[selected];
  if (!pts) {
    return (
      <p className="note" style={{ padding: "40px 8px" }}>
        Only {g.sold} {g.name} sales in the window, too few for a mileage curve. Individual results
        are in the model-year and recent-sales tables.
      </p>
    );
  }
  const W = Math.max(300, width);
  const H = 300;
  const M = { l: 54, r: 14, t: 10, b: 34 };
  const auctionsSold = snapshot.auctions.filter(
    (r) => r.status === "sold" && r.generation === selected,
  );
  const all = pts
    .map((p) => [p.miles, p.price / 1000] as const)
    .concat(auctionsSold.map((r) => [r.miles, r.price / 1000] as const))
    .concat(
      highlight && highlight.price > 0 ? [[highlight.miles, highlight.price / 1000] as const] : [],
    );
  const xmax = Math.max(...all.map((p) => p[0]));
  const xt = niceTicks(0, xmax, 5);
  const ymin = Math.min(...all.map((p) => p[1]));
  const ymax = Math.max(...all.map((p) => p[1]));
  const yt = niceTicks(ymin * 0.95, ymax * 1.02, 5);
  const xTop = xt[xt.length - 1];
  const yTop = yt[yt.length - 1];
  const xs = (v: number) => M.l + ((W - M.l - M.r) * v) / xTop;
  const ys = (v: number) => M.t + (H - M.t - M.b) * (1 - (v - yt[0]) / (yTop - yt[0]));
  const col = seriesVar(Math.max(0, snapshot.chartSeries.indexOf(selected)));
  const au = auctionsSold.filter(
    (r) => r.miles <= xTop && r.price / 1000 >= yt[0] && r.price / 1000 <= yTop,
  );
  const my = ys(g.median / 1000);
  const lx = M.l + 10;
  const ly = M.t + 12;

  return (
    <div className="chart" ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Sold price against mileage for ${g.name}`}
      >
        {yt.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={ys(t)} y2={ys(t)} stroke="var(--grid)" />
            <text x={M.l - 8} y={ys(t) + 4} textAnchor="end">
              ${t}k
            </text>
          </g>
        ))}
        {xt.map((t) => (
          <text key={t} x={xs(t)} y={H - 14} textAnchor="middle">
            {t >= 1000 ? t / 1000 + "k" : t}
          </text>
        ))}
        <text x={W - M.r} y={H - 1} textAnchor="end">
          miles
        </text>
        {pts.map((p, i) => {
          const x = xs(p.miles);
          const y = ys(p.price / 1000);
          const on = hot === i;
          return (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r={on ? 5.5 : 4}
                fill={col}
                fillOpacity={on ? 1 : 0.55}
                stroke="var(--card)"
                strokeWidth={1}
              />
              <circle
                cx={x}
                cy={y}
                r={9}
                fill="transparent"
                onPointerEnter={() => {
                  setHot(i);
                  setTip({
                    x,
                    y,
                    html: (
                      <>
                        <b>${p.price / 1000}k</b> · {mi(p.miles)} miles
                      </>
                    ),
                  });
                }}
                onPointerLeave={() => {
                  setHot(null);
                  setTip(null);
                }}
              />
            </g>
          );
        })}
        {au.map((r) => {
          const x = xs(r.miles);
          const y = ys(r.price / 1000);
          const k = 6;
          return (
            <g key={r.id}>
              <path
                d={`M${x} ${y - k}L${x + k} ${y}L${x} ${y + k}L${x - k} ${y}Z`}
                fill="var(--card)"
                stroke="var(--ink)"
                strokeWidth={2}
              />
              <circle
                cx={x}
                cy={y}
                r={10}
                fill="transparent"
                onPointerEnter={() =>
                  setTip({
                    x,
                    y,
                    html: (
                      <>
                        Auction · <b>{usd(r.price)}</b> · {mi(r.miles)} mi
                        <br />
                        <span style={{ opacity: 0.7 }}>
                          {r.platform}
                          {r.weissach ? ", Weissach" : ""}
                        </span>
                      </>
                    ),
                  })
                }
                onPointerLeave={() => setTip(null)}
              />
            </g>
          );
        })}
        {au.length > 0 && (
          <g>
            <circle cx={lx} cy={ly} r={4} fill={col} fillOpacity={0.55} />
            <text x={lx + 9} y={ly + 4} className="lbl">
              Dealer
            </text>
            <path
              d={`M${lx + 62} ${ly - 5}L${lx + 67} ${ly}L${lx + 62} ${ly + 5}L${lx + 57} ${ly}Z`}
              fill="var(--card)"
              stroke="var(--ink)"
              strokeWidth={2}
            />
            <text x={lx + 73} y={ly + 4} className="lbl">
              Auction
            </text>
          </g>
        )}
        {highlight && highlight.price > 0 && (
          <g>
            <circle
              cx={xs(Math.min(highlight.miles, xTop))}
              cy={ys(highlight.price / 1000)}
              r={9}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
            />
            <circle
              cx={xs(Math.min(highlight.miles, xTop))}
              cy={ys(highlight.price / 1000)}
              r={3.5}
              fill="var(--accent)"
            />
            <circle
              cx={xs(Math.min(highlight.miles, xTop))}
              cy={ys(highlight.price / 1000)}
              r={14}
              fill="transparent"
              onPointerEnter={() =>
                setTip({
                  x: xs(Math.min(highlight.miles, xTop)),
                  y: ys(highlight.price / 1000),
                  html: (
                    <>
                      {highlight.label} · <b>{usd(highlight.price)}</b> · {mi(highlight.miles)} mi
                    </>
                  ),
                })
              }
              onPointerLeave={() => setTip(null)}
            />
          </g>
        )}
        <line x1={M.l} x2={W - M.r} y1={my} y2={my} stroke="var(--ink-2)" strokeDasharray="4 4" />
        <text x={W - M.r} y={my - 6} textAnchor="end" className="lbl">
          median {usdK(g.median)}
        </text>
      </svg>
      {tip && (
        <div
          className="tip on"
          style={{ left: `${(tip.x / W) * 100}%`, top: `${(tip.y / H) * 100}%` }}
        >
          {tip.html}
        </div>
      )}
    </div>
  );
}
