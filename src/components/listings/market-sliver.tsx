import Link from "next/link";
import { ExpandToggle } from "./expandable";
import { type MarketRef, resolveMarket } from "./market-block";
import { usd } from "@/lib/format/money";
import type { SummaryCar } from "@/components/market/market-summary";
import { priceDelta } from "@/components/market/market-summary-lib";
import { compareVenues } from "@/lib/market/venues";
import { valuate } from "@/lib/valuation/engine";

/**
 * The market data sliver for a listing page sidebar: the four numbers a
 * buyer wants first, and a button that expands the full market block below.
 */
export async function MarketSliver({
  id,
  market,
  make,
  model,
  car,
  priceLabel,
}: {
  id: string;
  market: MarketRef | null;
  make: string | null;
  model: string | null;
  car: SummaryCar;
  priceLabel: "Current bid" | "Asking price" | "Sold for";
}) {
  const r = await resolveMarket(market, make, model, car);
  if (!r) {
    return (
      <div className="panel market-sliver">
        <div className="lab">Market data</div>
        <p className="note" style={{ margin: "6px 0 0" }}>
          No market report for this model yet.{" "}
          <Link href="/markets" style={{ color: "var(--accent)" }}>
            Browse reports
          </Link>
        </p>
      </div>
    );
  }
  const { snapshot, generation, reportHref, ref } = r;
  if (!snapshot || !generation) {
    return (
      <div className="panel market-sliver">
        <div className="lab">Market data</div>
        <p className="note" style={{ margin: "6px 0 8px" }}>
          Building the {ref.modelName} report from dealer sales and auction results.
        </p>
        <ExpandToggle id={id} labelOpen="Hide progress" labelClosed="Show progress" />
      </div>
    );
  }
  const g = snapshot.generations[generation]!;
  const miles = car.miles ?? g.medianMiles;
  const year =
    car.year != null && snapshot.years[generation]?.includes(car.year)
      ? car.year
      : (snapshot.years[generation]?.[0] ?? car.year ?? new Date().getUTCFullYear());
  let value: number | null = null;
  try {
    value = valuate(snapshot, {
      generation,
      year,
      miles,
      packages: car.packages,
      colorClass: "std",
      condition: "ex",
      history: "clean",
    }).marketValue;
  } catch {}
  const delta = value ? priceDelta(car.price, value, priceLabel) : null;
  const ch = g.prior90 > 0 ? (g.last90 - g.prior90) / g.prior90 : null;
  const venues = compareVenues(snapshot, { generation, miles });
  return (
    <div className="panel market-sliver">
      <div className="ms-head" style={{ marginBottom: 8 }}>
        <div>
          <div className="lab">Market data · {g.name}</div>
          <b className="display" style={{ fontSize: 17 }}>
            {snapshot.make.name} {snapshot.model.shortName}
          </b>
        </div>
      </div>
      <dl className="kv sliver-kv">
        <dt>Our market value</dt>
        <dd className="num">{value ? usd(value) : "n/a"}</dd>
        {delta ? (
          <>
            <dt>{priceLabel}</dt>
            <dd
              className={`num ${delta.direction === "under" ? "up" : delta.direction === "over" ? "down" : ""}`}
            >
              {usd(car.price)} ·{" "}
              {delta.text.replace(/^Current bid is |^Asking price is |^Sold for is /, "")}
            </dd>
          </>
        ) : null}
        <dt>Median sold, {g.name}</dt>
        <dd className="num">
          {usd(g.median)}
          {ch != null ? (
            <span className={`pill ${ch >= 0 ? "up" : "down"}`} style={{ marginLeft: 6 }}>
              {ch >= 0 ? "+" : ""}
              {(ch * 100).toFixed(1)}% 90d
            </span>
          ) : null}
        </dd>
        <dt>For sale now</dt>
        <dd className="num">{g.active}</dd>
        {venues.best ? (
          <>
            <dt>Best auction venue</dt>
            <dd>{venues.best.platform}</dd>
          </>
        ) : null}
      </dl>
      <div className="card-actions" style={{ marginTop: 10 }}>
        <ExpandToggle
          id={id}
          labelOpen="Hide full market data"
          labelClosed="Show full market data"
          className="btn sm primary"
        />
        <Link href={reportHref} className="btn sm">
          Model report
        </Link>
      </div>
    </div>
  );
}
