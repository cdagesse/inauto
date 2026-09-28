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
import { generationFor, packagesFromText } from "@/components/market/market-summary-lib";
import { env } from "@/env/server";
import { getMarketSnapshot } from "@/lib/market/source";
import { matchCatalog } from "@/server/market-match";
import { isPlatformKey } from "@/lib/sources/platforms";
import { valuate } from "@/lib/valuation/engine";
import { getExternalListing } from "@/server/queries/external";
import { isVin } from "@/lib/vin/timeline";
import { after } from "next/server";
import { recordCarView } from "@/server/views";
import { maskVin } from "@/lib/sources/live";
import { carLine, carPreview } from "@/lib/seo/preview";
import { fmtDate, isUsd, mi, money } from "@/lib/format/money";
import { placeLine } from "@/lib/geo";
import { effectiveStatus, outcomeLabel } from "@/lib/sources/status";

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
  const title = `${l.title} on ${l.sourceName}`;
  const status = effectiveStatus(l.status, l.endsAt);
  const price = status === "live" ? l.currentBid : (l.finalPrice ?? l.currentBid);
  const amount = price
    ? `${money(price, l.currency)}${isUsd(l.currency) ? "" : ` ${l.currency}`}`
    : null;
  const outcome =
    status === "live"
      ? amount
        ? `Current bid ${amount}`
        : "Live now"
      : status === "sold"
        ? amount
          ? `Sold for ${amount}`
          : "Sold"
        : amount
          ? `${outcomeLabel(status)}, high bid ${amount}`
          : outcomeLabel(status);
  const when = l.endsAt ? `, ${status === "live" ? "closes " : ""}${fmtDate(l.endsAt)}` : "";
  const car = carLine([
    [l.year, l.make, l.model].filter(Boolean).join(" "),
    l.miles != null ? `${mi(l.miles)} mi` : null,
    placeLine(l.location, l.country),
  ]);
  const description = `${car ? `${car}. ` : ""}${outcome} on ${l.sourceName}${when}.`;
  return {
    title,
    robots: { index: false, follow: false },
    ...carPreview({
      title: `${title} · UrCar`,
      description,
      photos: env.externalPhotos ? l.photoUrls : [],
      path: `/listings/ext/${l.source}/${encodeURIComponent(l.sourceId)}`,
    }),
  };
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
  // A listing the sync could not link by alias still gets a read when its make, model or
  // title names a catalog model; <MarketBlock> falls back the same way.
  let byName = false;
  let ref = l.market;
  if (!ref) {
    const m = await matchCatalog(l.make, l.model, l.title);
    if (m) {
      ref = { ...m, generationCode: null };
      byName = true;
    }
  }
  let read: UrCarRead | null = null;
  if (ref) {
    const reportHref = `/${ref.makeSlug}/${ref.modelSlug}`;
    const snapshot = await getMarketSnapshot(ref.makeSlug, ref.modelSlug);
    const gen = snapshot
      ? generationFor(snapshot.years, ref.generationCode, l.year, snapshot.order[0])
      : null;
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
    read = { valuation, reportHref, modelName: ref.modelName, pending: !snapshot, byName };
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
