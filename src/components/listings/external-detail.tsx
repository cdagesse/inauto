import Link from "next/link";
import { fmtDate, mi, usd } from "@/components/account/money";
import { bidDelta, maskVin } from "@/lib/sources/live";
import { PLATFORMS } from "@/lib/sources/platforms";
import type { ValuationResult } from "@/lib/valuation/types";
import type { ExternalDetail as ExternalDetailData } from "@/server/queries/external";
import { Countdown } from "./countdown";
import { PlatformMark, SourceBadge } from "./source-badge";

export interface InAutoRead {
  valuation: ValuationResult | null;
  reportHref: string;
  modelName: string;
  /** True when the model exists in the catalog but has no report yet. */
  pending: boolean;
}

/**
 * Detail view for a third-party auction. Pure presentation: the page loads
 * the row, runs the valuation, and passes everything in.
 */
export function ExternalDetail({
  l,
  read,
  showPhotos,
  signedIn,
  market,
}: {
  l: ExternalDetailData;
  read: InAutoRead | null;
  showPhotos: boolean;
  signedIn: boolean;
  /** Full market data section (KPIs, charts, comps), rendered under the listing details. */
  market?: React.ReactNode;
}) {
  const p = PLATFORMS[l.source] ?? PLATFORMS.other;
  const platformName = l.source === "other" ? l.sourceName : p.name;
  const live = l.status === "live";
  const ended = !live;
  const headline = live ? l.currentBid : (l.finalPrice ?? l.currentBid);
  const outcome =
    l.status === "sold"
      ? `Sold for ${usd(l.finalPrice ?? l.currentBid)}`
      : l.status === "rnm"
        ? "Ended, reserve not met"
        : l.status === "withdrawn"
          ? "Withdrawn"
          : l.status === "ended"
            ? "Ended, result pending"
            : null;
  const delta = read?.valuation ? bidDelta(headline, read.valuation.marketValue) : null;
  const goHref = `/go/${l.id}`;
  const vinQuery = l.vin ? `?vin=${encodeURIComponent(l.vin)}` : "";
  const photos = showPhotos ? l.photoUrls : [];
  const carLine = [l.year, l.make, l.model, l.trim].filter(Boolean).join(" ");

  return (
    <article className="external-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link href="/listings">Listings</Link> /{" "}
            <Link href={`/listings?source=${l.source}`}>{platformName}</Link>
          </div>
          <h1
            className="display"
            style={{ fontSize: "clamp(28px,5vw,44px)", margin: "6px 0 0", lineHeight: 1 }}
          >
            {l.title}
          </h1>
          <p className="sub" style={{ marginTop: 8 }}>
            <SourceBadge source={l.source} sourceName={l.sourceName} status={l.status} size="lg" />
            {carLine ? <> · {carLine}</> : null}
            {l.miles != null ? <> · {mi(l.miles)} miles</> : null}
            {l.location ? <> · {l.location}</> : null}
          </p>
        </div>
        <div className="price-block">
          <div className="lab">{live ? "Current bid" : "Final bid"}</div>
          <div className="display num" style={{ fontSize: 36 }}>
            {headline ? usd(headline) : "No bids"}
          </div>
          {outcome ? (
            <div className={`pill ${l.status === "sold" ? "up" : ""}`}>{outcome}</div>
          ) : null}
          <div className="hint">
            {live && l.endsAt ? (
              <>
                Closes in <Countdown endsAt={l.endsAt.toISOString()} />
              </>
            ) : l.endsAt ? (
              `Ended ${fmtDate(l.endsAt)}`
            ) : (
              "End time not published"
            )}
            {live && l.bidCount != null ? ` · ${l.bidCount} bids` : ""}
            {live
              ? ` · ${l.reserveMet == null ? "Reserve status unknown" : l.reserveMet ? "Reserve met" : "Reserve not met"}`
              : ""}
          </div>
        </div>
      </div>

      <div className="grid-2 listing-body">
        <div>
          {photos.length ? (
            <div className="gallery">
              {photos.slice(0, 7).map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={u}
                  src={u}
                  alt={i === 0 ? l.title : ""}
                  className={i === 0 ? "big" : undefined}
                  loading={i === 0 ? "eager" : "lazy"}
                />
              ))}
            </div>
          ) : (
            <div className="external-placeholder" aria-hidden="true">
              <PlatformMark source={l.source} />
              <span className="hint">Photos are on {platformName}</span>
            </div>
          )}
          {l.description ? <p className="desc">{l.description}</p> : null}
          <h2 className="sec" style={{ marginTop: 20 }}>
            Specification
          </h2>
          <div className="tw">
            <table>
              <tbody>
                <Row k="Platform" v={platformName} />
                <Row k="Year" v={l.year ? String(l.year) : "Not listed"} />
                <Row
                  k="Make / model"
                  v={[l.make, l.model, l.trim].filter(Boolean).join(" ") || "Not listed"}
                />
                <Row k="Miles" v={l.miles != null ? mi(l.miles) : "Not listed"} />
                <Row k="Color" v={l.color ?? "Not listed"} />
                <Row
                  k="VIN"
                  v={maskVin(l.vin) ?? "Not published"}
                  mono
                  note={l.vin ? "Full VIN is on the platform listing" : undefined}
                />
                <Row k="Listing started" v={l.startedAt ? fmtDate(l.startedAt) : "Unknown"} mono />
                <Row k="Last checked" v={l.fetchedAt.toLocaleString("en-US")} mono />
              </tbody>
            </table>
          </div>
          <p className="note external-notice">
            Listing details are provided by the platform; InAuto is not the seller. Bid and buy on
            the platform.
          </p>
          {market}
        </div>

        <aside className="side">
          <div className="panel go-panel">
            <div className="lab">On {platformName}</div>
            <a
              href={goHref}
              target="_blank"
              rel="nofollow noopener noreferrer sponsored"
              className="btn primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            >
              View on {platformName} ↗
            </a>
            <p className="hint" style={{ marginTop: 8 }}>
              Opens the original listing in a new tab. Bidding happens there, not on InAuto.
            </p>
          </div>

          <div className="panel">
            <div className="lab">InAuto read</div>
            {read?.valuation ? (
              <>
                <h3 className="display" style={{ fontSize: 18, margin: "4px 0 6px" }}>
                  Our market value {usd(read.valuation.marketValue)}
                </h3>
                {delta ? (
                  <p className={`delta ${delta.direction}`}>{delta.text}.</p>
                ) : (
                  <p className="hint">No bids yet to compare against.</p>
                )}
                <dl className="kv">
                  <dt>Typical range</dt>
                  <dd className="num">
                    {usd(read.valuation.range.lo)} to {usd(read.valuation.range.hi)}
                  </dd>
                  <dt>Expected hammer</dt>
                  <dd className="num">{usd(read.valuation.auction.expectedHammer)}</dd>
                  <dt>Dealer offer</dt>
                  <dd className="num">{usd(read.valuation.dealer.offer)}</dd>
                </dl>
                <p className="hint">
                  Based on the {read.modelName} market report, assuming standard color, excellent
                  condition and a clean history.{" "}
                  <Link href={read.reportHref}>See the full report</Link>.{" "}
                  {read.valuation.disclaimer}
                </p>
              </>
            ) : read ? (
              <p className="hint">
                No InAuto market report yet for the {read.modelName}.{" "}
                <Link href={read.reportHref}>
                  {read.pending ? "Build one now" : "Open the model page"}
                </Link>
                .
              </p>
            ) : (
              <p className="hint">This listing is not matched to a model in our catalog yet.</p>
            )}
          </div>

          <div className="panel protect">
            <div className="lab">Buyer protection</div>
            <h3 className="display" style={{ fontSize: 18, margin: "4px 0 8px" }}>
              Know before you bid
            </h3>
            <div className="stack">
              <Link
                href={`/tools${vinQuery}${vinQuery ? "&" : "?"}kind=title_vetting`}
                className="btn"
              >
                Order title vetting{l.vin ? " for this VIN" : ""}
              </Link>
              <Link
                href={`/tools${vinQuery}${vinQuery ? "&" : "?"}kind=condition_report`}
                className="btn"
              >
                Order condition report
              </Link>
              <button type="button" className="btn" disabled>
                Escrow (coming soon)
              </button>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              {signedIn
                ? "Independent inspectors and a title history pull, arranged by InAuto."
                : "Sign in on the next step to place an order."}
              {ended
                ? " This auction has ended; orders still help if you are buying it privately."
                : ""}
            </p>
          </div>
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
