import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { ExternalDetail, type UrCarRead } from "@/components/listings/external-detail";
import { ExpandedRegion } from "@/components/listings/expandable";
import { ExternalAdminBar } from "@/components/listings/external-admin-bar";
import { isFeatured } from "@/server/queries/featured";
import { MarketBlock, MarketBlockFallback } from "@/components/listings/market-block";
import {
  VinTimelineSection,
  VinTimelineSkeleton,
} from "@/components/listings/vin-timeline-section";
import { packagesFromText } from "@/components/market/market-summary-lib";
import { env } from "@/env/server";
import { getMarketSnapshot } from "@/lib/market/source";
import { isPlatformKey } from "@/lib/sources/platforms";
import { valuate } from "@/lib/valuation/engine";
import { getExternalListing } from "@/server/queries/external";
import { isVin } from "@/lib/vin/timeline";
import { after } from "next/server";
import { recordCarView } from "@/server/views";
import { maskVin } from "@/lib/sources/live";

export const dynamic = "force-dynamic";

type Params = Promise<{ source: string; sourceId: string }>;

async function load(params: Params) {
  const { source, sourceId } = await params;
  if (!isPlatformKey(source) || sourceId.length > 120) return null;
  return getExternalListing(source, decodeURIComponent(sourceId));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const l = await load(params);
  // Third-party content: never indexed under our domain.
  if (!l) return { title: "Listing", robots: { index: false, follow: false } };
  return { title: `${l.title} on ${l.sourceName}`, robots: { index: false, follow: false } };
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

export default async function ExternalListingPage({ params }: { params: Params }) {
  const l = await load(params);
  if (!l) notFound();
  after(() => recordCarView("external", l.id));
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const featured = isAdmin ? await isFeatured("external", l.id) : false;

  // The valuation feeds the headline delta in the sticky head, so it stays in the
  // first wave; the snapshot read is request-cached and shared with <MarketBlock>.
  let read: UrCarRead | null = null;
  if (l.market) {
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
          packages: /weissach/i.test(l.title) ? ["weissach"] : [],
          colorClass: "std",
          condition: "ex",
          history: "clean",
        });
      } catch (e) {
        console.warn("external valuation failed", e instanceof Error ? e.message : e);
      }
    }
    read = { valuation, reportHref, modelName: l.market.modelName, pending: !snapshot };
  }

  const live = l.status === "live";
  const price = live ? l.currentBid : (l.finalPrice ?? l.currentBid);
  const priceLabel = l.status === "sold" ? "Sold for" : "Current bid";
  const expandId = `market-${l.source}-${l.sourceId}`;
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
              price: price ?? null,
              packages: packagesFromText(`${l.title} ${l.trim ?? ""}`),
              title: l.title,
            }}
            priceLabel={priceLabel}
          />
        </Suspense>
      </ExpandedRegion>
      {isVin(l.vin) ? (
        <Suspense fallback={<VinTimelineSkeleton />}>
          <VinTimelineSection
            vin={l.vin}
            current={{ kind: "external", id: `${l.source}:${l.sourceId}` }}
            vinShown={maskVin(l.vin)}
          />
        </Suspense>
      ) : null}
    </>
  );

  return (
    <div className={isAdmin ? "has-owner-bar" : undefined}>
      <ExternalDetail
        l={l}
        read={read}
        showPhotos={env.externalPhotos}
        signedIn={!!session?.user}
        market={market}
        expandId={expandId}
      />
      {isAdmin ? (
        <ExternalAdminBar
          refId={l.id}
          back={`/listings/ext/${l.source}/${encodeURIComponent(l.sourceId)}`}
          featured={featured}
          live={live}
        />
      ) : null}
    </div>
  );
}
