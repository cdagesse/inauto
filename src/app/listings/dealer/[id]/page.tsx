import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { DealerDetail } from "@/components/listings/dealer-detail";
import { ExpandedRegion } from "@/components/listings/expandable";
import type { UrCarRead } from "@/components/listings/external-detail";
import { MarketBlock, MarketBlockFallback } from "@/components/listings/market-block";
import {
  VinTimelineSection,
  VinTimelineSkeleton,
} from "@/components/listings/vin-timeline-section";
import { packagesFromText } from "@/components/market/market-summary-lib";
import { dealerTitle } from "@/lib/listings/dealer-cursor";
import { getMarketSnapshot } from "@/lib/market/source";
import { maskVin } from "@/lib/sources/live";
import { valuate } from "@/lib/valuation/engine";
import { isVin } from "@/lib/vin/timeline";
import { getDealerListing } from "@/server/queries/dealers";
import { recordCarView } from "@/server/views";
import { mi, usd } from "@/lib/format/money";
import { carLine, carPreview } from "@/lib/seo/preview";
import { dealerPlace } from "@/components/listings/dealer-card";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const l = await getDealerListing(id);
  // Third-party inventory: never indexed under our domain.
  if (!l) return { title: "Listing", robots: { index: false, follow: false } };
  const title = `${dealerTitle(l)} at ${l.dealerName ?? "a dealer"}`;
  const description = `${carLine([
    l.miles ? `${mi(l.miles)} mi` : null,
    l.price != null ? `asking ${usd(l.price)}` : null,
    dealerPlace(l),
  ])}. For sale at ${l.dealerName ?? "a dealer"}.`;
  return {
    title,
    robots: { index: false, follow: false },
    ...carPreview({
      title: `${title} · UrCar`,
      description,
      photos: l.photos,
      path: `/listings/dealer/${l.id}`,
    }),
  };
}

/** Pick the generation for the valuation: the matched one, else by year from the snapshot. */
function generationFor(
  years: Record<string, number[]>,
  matched: string | null,
  year: number | null,
) {
  if (matched && years[matched]) return matched;
  if (year == null) return null;
  for (const [code, ys] of Object.entries(years)) if (ys.includes(year)) return code;
  return null;
}

export default async function DealerListingPage({ params }: { params: Params }) {
  const { id } = await params;
  const l = await getDealerListing(id);
  if (!l) notFound();
  after(() => recordCarView("dealer", l.id));

  const reportHref = `/${l.market.makeSlug}/${l.market.modelSlug}`;
  const snapshot = await getMarketSnapshot(l.market.makeSlug, l.market.modelSlug);
  const gen = snapshot ? generationFor(snapshot.years, l.market.generationCode, l.year) : null;
  const year = l.year ?? (gen && snapshot ? snapshot.years[gen][0] : null);
  let valuation = null;
  if (snapshot && gen && year != null) {
    try {
      valuation = valuate(snapshot, {
        generation: gen,
        year,
        miles: l.miles ?? snapshot.generations[gen].medianMiles,
        packages: l.packages,
        colorClass: "std",
        condition: "ex",
        history: "clean",
      });
    } catch (e) {
      console.warn("dealer valuation failed", e instanceof Error ? e.message : e);
    }
  }
  const read: UrCarRead = {
    valuation,
    reportHref,
    modelName: l.market.modelName,
    pending: !snapshot,
  };
  const title = dealerTitle(l);
  const expandId = `market-dealer-${l.id}`;
  const market = (
    <>
      <ExpandedRegion id={expandId}>
        <Suspense fallback={<MarketBlockFallback />}>
          <MarketBlock
            market={l.market}
            make={l.make}
            model={l.model}
            car={{
              year: l.year,
              miles: l.miles,
              price: l.price,
              packages: l.packages.length
                ? l.packages
                : packagesFromText(`${title} ${l.trim ?? ""}`),
              title,
            }}
            priceLabel="Asking price"
          />
        </Suspense>
      </ExpandedRegion>
      {isVin(l.vin) ? (
        <Suspense fallback={<VinTimelineSkeleton />}>
          <VinTimelineSection
            vin={l.vin}
            current={{ kind: "dealer", id: l.id }}
            vinShown={maskVin(l.vin)}
          />
        </Suspense>
      ) : null}
    </>
  );
  return <DealerDetail l={l} read={read} market={market} expandId={expandId} />;
}
