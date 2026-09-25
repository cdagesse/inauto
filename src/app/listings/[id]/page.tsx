import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { fmtDate, mi, usd } from "@/components/account/money";
import { BidForm } from "@/components/listings/bid-form";
import { Countdown } from "@/components/listings/countdown";
import { MarketBlock } from "@/components/listings/market-block";
import { PhotoGallery } from "@/components/listings/photo-gallery";
import { ServiceOrderForm } from "@/components/listings/service-order-form";
import { verdictClass, verdictLabel } from "@/components/listings/verdict";
import type { PriceGuidance } from "@/lib/valuation/types";
import { markListingSoldForm, publishListingForm, withdrawListingForm } from "@/server/forms";
import { minimumIncrement } from "@/server/listings-schema";
import { getListingForViewer } from "@/server/queries/listings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const l = await getListingForViewer(id, null);
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
  const signinHref = `/signin?callbackUrl=${encodeURIComponent(`/listings/${l.id}`)}`;
  const marketPrice =
    l.status === "sold"
      ? (l.soldPrice ?? l.highBid ?? l.askingPrice)
      : l.type === "auction"
        ? l.highBid
        : l.askingPrice;
  const marketLabel =
    l.status === "sold" ? "Sold for" : l.type === "auction" ? "Current bid" : "Asking price";
  return (
    <article>
      <div className="page-head">
        <div>
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
          <h1
            className="display"
            style={{ fontSize: "clamp(28px,5vw,44px)", margin: "6px 0 0", lineHeight: 1 }}
          >
            {l.title}
          </h1>
          <p className="sub" style={{ marginTop: 8 }}>
            {l.year} {l.make} {l.model}
            {l.trim ? ` ${l.trim}` : ""} · {mi(l.miles)} miles{l.location ? ` · ${l.location}` : ""}{" "}
            · listed by {l.sellerName ?? "owner"}
          </p>
        </div>
        <div className="price-block">
          {l.type === "auction" ? (
            <>
              <div className="lab">{ended ? "Final bid" : "Current bid"}</div>
              <div className="display num" style={{ fontSize: 36 }}>
                {l.highBid ? usd(l.highBid) : "No bids"}
              </div>
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
              <div className="display num" style={{ fontSize: 36 }}>
                {usd(l.askingPrice)}
              </div>
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
      </div>

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
        </div>

        <aside className="side">
          {l.isOwner ? (
            <div className="panel">
              <div className="lab">Your listing</div>
              {error ? <p className="err">{error}</p> : null}
              <div className="card-actions" style={{ marginTop: 8 }}>
                {l.status === "draft" ? (
                  <form action={publishListingForm}>
                    <input type="hidden" name="id" value={l.id} />
                    <button type="submit" className="btn primary sm">
                      Publish
                    </button>
                  </form>
                ) : null}
                {l.status === "active" || l.status === "ended" ? (
                  <>
                    <form action={markListingSoldForm}>
                      <input type="hidden" name="id" value={l.id} />
                      <button type="submit" className="btn sm">
                        Mark sold
                      </button>
                    </form>
                    <form action={withdrawListingForm}>
                      <input type="hidden" name="id" value={l.id} />
                      <button type="submit" className="btn sm danger">
                        Withdraw
                      </button>
                    </form>
                  </>
                ) : null}
              </div>
            </div>
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
