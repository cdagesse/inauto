import Link from "next/link";
import { ReportPending } from "@/app/[make]/[model]/report-pending";
import { MarketSummary, type SummaryCar } from "@/components/market/market-summary";
import { generationFor } from "@/components/market/market-summary-lib";
import { getMarketSnapshot } from "@/lib/market/source";
import { matchCatalog } from "@/server/market-match";
import { requestMarketReport } from "@/server/reports";

export interface MarketRef {
  makeSlug: string;
  modelSlug: string;
  modelName: string;
  generationCode: string | null;
  reportStatus: "none" | "requested" | "building" | "ready" | "failed";
  reportError: string | null;
}

/**
 * Server component: resolves what market data a listing page can show.
 * 1) matched model with a snapshot → the full MarketSummary
 * 2) catalogued model without a report → request it (idempotent) and show the pending panel
 * 3) unmatched → try a free-text catalog match, else a short "no data" line
 */
export async function MarketBlock({
  market,
  make,
  model,
  car,
  priceLabel,
}: {
  market: MarketRef | null;
  make: string | null;
  model: string | null;
  car: SummaryCar;
  priceLabel: "Current bid" | "Asking price" | "Sold for";
}) {
  let ref: MarketRef | null = market;
  if (!ref) {
    const m = await matchCatalog(make, model, car.title);
    if (m) ref = { ...m, generationCode: null };
  }
  if (!ref) {
    return (
      <section className="market-summary">
        <div className="ms-head">
          <div>
            <div className="eyebrow">Market data</div>
            <h2 className="sec">No market report for this model yet</h2>
          </div>
          <Link href="/markets" className="btn sm">
            Browse market reports →
          </Link>
        </div>
      </section>
    );
  }

  const reportHref = `/${ref.makeSlug}/${ref.modelSlug}`;
  const snapshot = await getMarketSnapshot(ref.makeSlug, ref.modelSlug);
  if (snapshot) {
    const generation = generationFor(
      snapshot.years,
      ref.generationCode,
      car.year,
      snapshot.order[0],
    );
    return (
      <MarketSummary
        snapshot={snapshot}
        generation={generation}
        car={car}
        priceLabel={priceLabel}
        reportHref={reportHref}
      />
    );
  }

  // Catalogued but not built yet: queue it now so a first visit (even without JS) starts the job.
  let status = ref.reportStatus;
  if (status === "none") {
    const r = await requestMarketReport({ makeSlug: ref.makeSlug, modelSlug: ref.modelSlug });
    if (r.ok) status = "requested";
  }
  return (
    <section className="market-summary">
      <div className="ms-head">
        <div>
          <div className="eyebrow">Market data</div>
          <h2 className="sec">Building the market report for the {ref.modelName}…</h2>
        </div>
        <Link href={reportHref} className="btn sm">
          Model page →
        </Link>
      </div>
      <ReportPending
        makeSlug={ref.makeSlug}
        modelSlug={ref.modelSlug}
        status={status}
        error={ref.reportError}
      />
    </section>
  );
}
