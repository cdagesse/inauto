import Link from "next/link";
import { Sparkline } from "@/components/market/sparkline";
import type { getMarketTree } from "@/lib/market/tree-source";

type Segment = Awaited<ReturnType<typeof getMarketTree>>["segments"][number];

/** Segments at a glance: median, 90-day move, dealer sales, for sale, monthly volume and price index. */
export function SegmentsTable({ segments }: { segments: Segment[] }) {
  return (
    <div className="tw">
      <table className="compare">
        <thead>
          <tr>
            <th>Segment</th>
            <th className="n">Median price</th>
            <th className="n">90-day</th>
            <th className="n">Dealer sales</th>
            <th className="n">For sale</th>
            <th>Sales per month</th>
            <th>Price index</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr key={s.key}>
              <td>
                <Link href={`/markets/${s.key}`} className="seg-link-name">
                  {s.short}
                </Link>
                <div className="hint">
                  {s.catalogMakes} makes · {s.stats?.models ?? 0} of {s.catalogModels} models
                  reported
                </div>
              </td>
              <td className="n">
                {s.stats?.medianPrice != null
                  ? "$" + Math.round(s.stats.medianPrice).toLocaleString("en-US")
                  : "n/a"}
              </td>
              <td
                className={`n ${s.stats?.change90 == null ? "" : s.stats.change90 >= 0 ? "up" : "down"}`}
              >
                {s.stats?.change90 != null
                  ? `${s.stats.change90 >= 0 ? "+" : ""}${(s.stats.change90 * 100).toFixed(1)}%`
                  : "n/a"}
              </td>
              <td className="n">{(s.stats?.dealerSales ?? 0).toLocaleString("en-US")}</td>
              <td className="n">{(s.stats?.activeNow ?? 0).toLocaleString("en-US")}</td>
              <td className="spark-cell">
                {s.stats ? (
                  <Sparkline trend={s.stats.trend} kind="volume" width={160} height={40} />
                ) : null}
              </td>
              <td className="spark-cell">
                {s.stats ? (
                  <Sparkline trend={s.stats.trend} kind="index" width={160} height={40} />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
