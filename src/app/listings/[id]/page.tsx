import { BrandLogo } from "@/components/site/brand-logo";
import { StickyHead } from "@/components/listings/sticky-head";
import { RecordView } from "@/components/home/recent-views";
import { after } from "next/server";
import { recordCarView } from "@/server/views";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { signInHref } from "@/components/account/require-signin";
import { fmtDate, mi, usd } from "@/lib/format/money";
import { BidForm } from "@/components/listings/bid-form";
import { Countdown } from "@/components/listings/countdown";
import { ExpandedRegion } from "@/components/listings/expandable";
import { MarketBlock, MarketBlockFallback } from "@/components/listings/market-block";
import { MarketSliver, MarketSliverFallback } from "@/components/listings/market-sliver";
import { PurchaseCta } from "@/components/listings/purchase-cta";
import { PhotoGallery } from "@/components/listings/photo-gallery";
import { ServiceOrderForm } from "@/components/listings/service-order-form";
import {
  VinTimelineSection,
  VinTimelineSkeleton,
} from "@/components/listings/vin-timeline-section";
import { verdictClass, verdictLabel } from "@/components/listings/verdict";
import type { PriceGuidance } from "@/lib/valuation/types";
import { adminDeleteListingForm } from "@/server/admin/actions";
import {
  deleteListingForm,
  markListingSoldForm,
  publishListingForm,
  relistListingForm,
  withdrawListingForm,
} from "@/server/forms";
import { OwnerBar } from "@/components/listings/owner-bar";
import { toggleFeaturedForm } from "@/server/admin/featured";
import { isFeatured } from "@/server/queries/featured";
import { minimumIncrement } from "@/server/listings-schema";
import { getListingForViewer, getTitleCheckForViewer } from "@/server/queries/listings";
import { TitleReportCard } from "@/components/listings/title-report-card";
import { isVin } from "@/lib/vin/timeline";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // Same viewer as the page so the request-cached loader runs once per request.
  const session = await auth();
  const l = await getListingForViewer(id, session?.user?.id ?? null);
  if (!l) return { title: "Listing", robots: { index: false } };
  return { title: l.title, description: `${l.year} ${l.make} ${l.model}, ${mi(l.miles)} miles.` };
}

const COND = { ex: "Excellent", good: "Good", fair: "Needs work" } as const;
const HIST = { clean: "Clean history", acc: "Accident reported" } as const;
const COLOR = { std: "Standard color", spec: "Special color", pts: "Paint to Sample" } as const;

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const session = await auth();
  const viewerId = session?.user?.id ?? null;
  const l = await getListingForViewer(id, viewerId);
  if (!l) notFound();
  after(() => recordCarView("listing", l.id));
  const featured = session?.user?.role === "admin" ? await isFeatured("listing", l.id) : false;
  const titleCheck = await getTitleCheckForViewer(l.id, viewerId);
  const closed = l.status === "sold" || l.status === "ended" || l.status === "withdrawn";
  const ended = l.ended || closed;
  const winningMine = l.status === "sold" && l.bids[0]?.mine === true;
  const outcome =
    l.type !== "auction"
      ? null
      : l.status === "sold"
        ? `Sold for ${usd(l.soldPrice ?? l.highBid)}${winningMine ? " to you" : ""}`
        : l.status === "ended"
          ? l.highBid == null
            ? "Ended with no bids"
            : "Ended, reserve not met"
          : ended
            ? "Ended, closing shortly"
            : null;
  const reserveMet =
    l.type === "auction" && l.highBid != null
      ? l.reservePrice == null || l.highBid >= l.reservePrice
      : null;
  const minBid = l.highBid ? l.highBid + minimumIncrement(l.highBid) : 100;
  const guidance = l.priceGuidance as PriceGuidance | null;
  const signinHref = signInHref(`/listings/${l.id}`);
  const marketPrice =
    l.status === "sold"
      ? (l.soldPrice ?? l.highBid ?? l.askingPrice)
      : l.type === "auction"
        ? l.highBid
        : l.askingPrice;
  const marketLabel =
    l.status === "sold" ? "Sold for" : l.type === "auction" ? "Current bid" : "Asking price";
  return (
    <article className={l.isOwner || session?.user?.role === "admin" ? "has-owner-bar" : undefined}>
      {error ? <p className="err">{error}</p> : null}
      <RecordView
        item={{
          key: `listing:${l.id}`,
          href: `/listings/${l.id}`,
          title: l.title,
          sub: `${l.year} ${l.make} ${l.model}${l.trim ? ` ${l.trim}` : ""} · ${mi(l.miles)} miles`,
          price: marketPrice ?? null,
          currency: "USD",
          priceLabel: marketLabel,
          photo: l.photos[0] ?? null,
          badge: "On UrCar",
        }}
      />
      <StickyHead photo={l.photos[0] ?? null}>
        <div className="head-main">
          <div className="eyebrow">
            <Link href="/listings">Listings</Link> /{" "}
            {l.type === "private" ? (
              <>
                private · <Link href={`/networks/${l.networkSlug}`}>{l.networkName}</Link>
              </>
            ) : (
              l.type
            )}
            {l.status !== "active" ? (
              <span className="pill" style={{ marginLeft: 8 }}>
                {l.status}
              </span>
            ) : null}
          </div>
          <div className="with-logo" style={{ marginTop: 4 }}>
            <BrandLogo make={l.make} px={36} />
            <h1 className="display head-title">{l.title}</h1>
          </div>
          <p className="sub head-sub">
            {l.year} {l.make} {l.model}
            {l.trim ? ` ${l.trim}` : ""} · {mi(l.miles)} miles{l.location ? ` · ${l.location}` : ""}{" "}
            · listed by {l.sellerName ?? "owner"}
          </p>
        </div>
        <div className="price-block">
          {l.type === "auction" ? (
            <>
              <div className="lab">{ended ? "Final bid" : "Current bid"}</div>
              <div className="display num head-price">{l.highBid ? usd(l.highBid) : "No bids"}</div>
              {outcome ? (
                <div
                  className={`pill ${l.status === "sold" ? "up" : ""}`}
                  style={{ marginBottom: 4 }}
                >
                  {outcome}
                </div>
              ) : null}
              <div className="hint">
                {l.auctionEndsAt && !closed ? (
                  <>
                    Closes in <Countdown endsAt={l.auctionEndsAt.toISOString()} />
                  </>
                ) : l.auctionEndsAt ? (
                  `Closed ${fmtDate(l.closedAt ?? l.auctionEndsAt)}`
                ) : (
                  "Not started"
                )}{" "}
                ·{" "}
                {reserveMet == null
                  ? l.reservePrice
                    ? "Reserve"
                    : "No reserve"
                  : reserveMet
                    ? "Reserve met"
                    : "Reserve not met"}
              </div>
            </>
          ) : (
            <>
              <div className="lab">Asking</div>
              <div className="display num head-price">{usd(l.askingPrice)}</div>
              {guidance ? (
                <div className="hint">
                  Market value {usd(guidance.marketValue)} ·{" "}
                  <span className={`pill ${verdictClass(guidance.verdict)}`}>
                    {verdictLabel(guidance.verdict)}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>
      </StickyHead>

      <div className="grid-2 listing-body">
        <div>
          <PhotoGallery photos={l.photos} title={l.title} />
          {l.description ? <p className="desc">{l.description}</p> : null}
          <h2 className="sec" style={{ marginTop: 20 }}>
            Specification
          </h2>
          <div className="tw">
            <table>
              <tbody>
                <Row k="Year" v={String(l.year)} />
                <Row k="Make / model" v={`${l.make} ${l.model}${l.trim ? ` ${l.trim}` : ""}`} />
                <Row k="Miles" v={mi(l.miles)} />
                <Row
                  k="Color"
                  v={`${l.color ?? "Not listed"} · ${COLOR[l.colorClass as keyof typeof COLOR] ?? l.colorClass}`}
                />
                <Row k="Condition" v={COND[l.condition as keyof typeof COND] ?? l.condition} />
                <Row k="History" v={HIST[l.history as keyof typeof HIST] ?? l.history} />
                {l.packages.length ? <Row k="Packages" v={l.packages.join(", ")} /> : null}
                <Row
                  k="VIN"
                  v={l.vin ?? "Not provided"}
                  mono
                  note={
                    !l.isOwner && !l.titleVetted && l.vin
                      ? "Full VIN shown after title vetting"
                      : undefined
                  }
                />
                <Row k="Listed" v={fmtDate(l.createdAt)} mono />
              </tbody>
            </table>
          </div>
          {l.type === "auction" && l.bids.length > 0 ? (
            <>
              <h2 className="sec" style={{ marginTop: 20 }}>
                Bid history
              </h2>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th className="n">Bid</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.bids.map((b, i) => (
                      <tr key={i}>
                        <td className="n">
                          {usd(b.amount)} {b.mine ? <span className="pill accent">you</span> : null}
                        </td>
                        <td className="mono">{b.createdAt.toLocaleString("en-US")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          {isVin(l.historyVin) ? (
            <Suspense fallback={<VinTimelineSkeleton />}>
              <VinTimelineSection
                vin={l.historyVin}
                current={{ kind: "inauto", id: l.id }}
                vinShown={l.vin}
              />
            </Suspense>
          ) : null}
        </div>

        <aside className="side">
          <Suspense fallback={<MarketSliverFallback />}>
            <MarketSliver
              id={`market-${l.id}`}
              market={l.market}
              make={l.make}
              model={l.model}
              car={{
                year: l.year,
                miles: l.miles,
                price: marketPrice ?? null,
                packages: l.packages,
                title: l.title,
              }}
              priceLabel={marketLabel}
            />
          </Suspense>
          {!l.isOwner ? (
            <PurchaseCta
              id={l.id}
              type={l.type}
              status={l.status}
              signedIn={!!session?.user}
              askingPrice={l.askingPrice}
            />
          ) : null}

          {l.type === "auction" && l.status === "active" && !ended && !l.isOwner ? (
            session?.user ? (
              <BidForm listingId={l.id} minimum={minBid} />
            ) : (
              <div className="panel">
                <Link href={signinHref} className="btn primary">
                  Sign in to bid
                </Link>
              </div>
            )
          ) : null}

          {titleCheck ? (
            <TitleReportCard
              summary={titleCheck.summary}
              mvr={titleCheck.mvr}
              when={fmtDate(titleCheck.reviewedAt ?? new Date())}
            />
          ) : null}
          <div className="panel protect">
            <div className="lab">Buyer protection</div>
            <h3 className="display" style={{ fontSize: 18, margin: "4px 0 8px" }}>
              Know before you pay
            </h3>
            {session?.user ? (
              <div className="stack">
                <ServiceOrderForm kind="title_vetting" listingId={l.id} />
                <ServiceOrderForm kind="condition_report" listingId={l.id} />
                <button type="button" className="btn" disabled>
                  Escrow (coming soon)
                </button>
              </div>
            ) : (
              <p className="note">
                <Link href={signinHref}>Sign in</Link> to order title vetting or a condition report
                for this car.
              </p>
            )}
            <p className="hint" style={{ marginTop: 8 }}>
              Independent inspectors, a title history pull, and, soon, escrow. The seller is never
              in the loop.
            </p>
          </div>

          {guidance ? (
            <div className="panel">
              <div className="lab">Price check at listing time</div>
              <dl className="kv">
                <dt>Market value</dt>
                <dd className="num">{usd(guidance.marketValue)}</dd>
                <dt>Typical range</dt>
                <dd className="num">
                  {usd(guidance.range.lo)} to {usd(guidance.range.hi)}
                </dd>
                <dt>Dealers asking</dt>
                <dd className="num">{usd(guidance.dealerAskingMedian)}</dd>
                {guidance.auctionMedian ? (
                  <>
                    <dt>Auction median</dt>
                    <dd className="num">{usd(guidance.auctionMedian)}</dd>
                  </>
                ) : null}
              </dl>
              <p className="hint">{guidance.message}</p>
              <p className="hint">This is an estimate, not an offer.</p>
            </div>
          ) : null}
        </aside>
      </div>
      {l.isOwner || session?.user?.role === "admin" ? (
        <OwnerBar
          id={l.id}
          title={l.title}
          status={l.status}
          type={l.type}
          hasBids={l.bids.length > 0}
          isOwner={l.isOwner}
          admin={
            session?.user?.role === "admin"
              ? {
                  remove: adminDeleteListingForm,
                  back: "/listings",
                  feature: { action: toggleFeaturedForm, featured },
                }
              : undefined
          }
          actions={{
            publish: publishListingForm,
            markSold: markListingSoldForm,
            withdraw: withdrawListingForm,
            relist: relistListingForm,
            remove: deleteListingForm,
          }}
        />
      ) : null}
      <ExpandedRegion id={`market-${l.id}`}>
        <Suspense fallback={<MarketBlockFallback />}>
          <MarketBlock
            market={l.market}
            make={l.make}
            model={l.model}
            car={{
              year: l.year,
              miles: l.miles,
              price: marketPrice ?? null,
              packages: l.packages,
              title: l.title,
            }}
            priceLabel={marketLabel}
          />
        </Suspense>
      </ExpandedRegion>
    </article>
  );
}

function Row({ k, v, mono, note }: { k: string; v: string; mono?: boolean; note?: string }) {
  return (
    <tr>
      <th style={{ width: 160 }}>{k}</th>
      <td className={mono ? "mono" : undefined}>
        {v}
        {note ? <div className="hint">{note}</div> : null}
      </td>
    </tr>
  );
}
