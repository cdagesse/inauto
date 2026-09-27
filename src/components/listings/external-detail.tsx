import Link from "next/link";
import { fmtDate, isUsd, mi, money, usd } from "@/components/account/money";
import { countryName, flag, normalizeCountry } from "@/lib/geo";
import { bidDelta, maskVin } from "@/lib/sources/live";
import { effectiveStatus } from "@/lib/sources/status";
import { PLATFORMS } from "@/lib/sources/platforms";
import type { ValuationResult } from "@/lib/valuation/types";
import type { ExternalDetail as ExternalDetailData } from "@/server/queries/external";
import { Countdown } from "./countdown";
import { ExpandToggle } from "./expandable";
import { PlatformMark, SourceBadge } from "./source-badge";
import { StickyHead } from "./sticky-head";
import { RecordView } from "@/components/home/recent-views";

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
  expandId,
}: {
  l: ExternalDetailData;
  read: InAutoRead | null;
  showPhotos: boolean;
  signedIn: boolean;
  /** Full market data section (KPIs, charts, comps), rendered under the listing details. */
  market?: React.ReactNode;
  /** Expand/collapse key shared with the market region. */
  expandId?: string;
}) {
  const p = PLATFORMS[l.source] ?? PLATFORMS.other;
  const platformName = l.source === "other" ? l.sourceName : p.name;
  const status = effectiveStatus(l.status, l.endsAt);
  const live = status === "live";
  const ended = !live;
  const headline = live ? l.currentBid : (l.finalPrice ?? l.currentBid);
  const outcome =
    l.status === "sold"
      ? `Sold for ${money(l.finalPrice ?? l.currentBid, l.currency)}`
      : l.status === "rnm"
        ? "Ended, reserve not met"
        : l.status === "withdrawn"
          ? "Withdrawn"
          : status === "ended"
            ? "Ended, result pending"
            : null;
  const foreign = !isUsd(l.currency);
  const country = normalizeCountry(l.country);
  // Our market value is in US dollars; a bid in another currency is not compared to it.
  const delta = read?.valuation && !foreign ? bidDelta(headline, read.valuation.marketValue) : null;
  const extras = listingExtras(l.raw);
  const goHref = `/go/${l.id}`;
  const vinQuery = l.vin ? `?vin=${encodeURIComponent(l.vin)}` : "";
  const photos = showPhotos ? l.photoUrls : [];
  const carLine = [l.year, l.make, l.model, l.trim].filter(Boolean).join(" ");

  return (
    <article className="external-page">
      <RecordView
        item={{
          key: `external:${l.id}`,
          href: `/listings/ext/${l.source}/${encodeURIComponent(l.sourceId)}`,
          title: l.title,
          sub: [carLine, l.miles != null ? `${mi(l.miles)} miles` : null]
            .filter(Boolean)
            .join(" · "),
          price: headline ?? null,
          currency: l.currency,
          priceLabel: live ? "Current bid" : "Final bid",
          photo: photos[0] ?? null,
          badge: live ? `Live on ${platformName}` : platformName,
        }}
      />
      <StickyHead photo={photos[0] ?? null}>
        <div className="head-main">
          <div className="eyebrow">
            <Link href="/listings">Listings</Link> /{" "}
            <Link href={`/listings?source=${l.source}`}>{platformName}</Link>
          </div>
          <h1 className="display head-title">{l.title}</h1>
          <p className="sub head-sub">
            <SourceBadge source={l.source} sourceName={l.sourceName} status={status} size="lg" />
            {carLine ? <> · {carLine}</> : null}
            {l.miles != null ? <> · {mi(l.miles)} miles</> : null}
            {l.location ? <> · {l.location}</> : null}
            {country && country !== "US" ? (
              <>
                {" "}
                · {flag(country)} {countryName(country)}
              </>
            ) : null}
          </p>
        </div>
        <div className="price-block">
          <div className="lab">
            {live ? "Current bid" : "Final bid"}
            {foreign ? ` · in ${l.currency}` : ""}
          </div>
          <div className="display num head-price">
            {headline ? money(headline, l.currency) : "No bids"}
            {foreign && headline ? (
              <span className="cur-tag" title="Not US dollars">
                {l.currency}
              </span>
            ) : null}
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
      </StickyHead>

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
                {country ? (
                  <Row k="Country" v={`${flag(country)} ${countryName(country)}`} />
                ) : null}
                {foreign ? (
                  <Row
                    k="Currency"
                    v={`${l.currency} — prices on this listing are not US dollars`}
                  />
                ) : null}
                {extras.spec.map((e) => (
                  <Row key={e.k} k={e.k} v={e.v} />
                ))}
                <Row k="Listing started" v={l.startedAt ? fmtDate(l.startedAt) : "Unknown"} mono />
                <Row k="Last checked" v={l.fetchedAt.toLocaleString("en-US")} mono />
              </tbody>
            </table>
          </div>
          {extras.sections.length ? (
            <>
              <h2 className="sec" style={{ marginTop: 20 }}>
                From the listing
              </h2>
              {extras.sections.map((s) => (
                <div key={s.k} className="listing-extra">
                  <div className="lab">{s.k}</div>
                  <p className="desc" style={{ marginTop: 4 }}>
                    {s.v}
                  </p>
                </div>
              ))}
            </>
          ) : null}
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
                {expandId ? (
                  <div className="card-actions" style={{ marginTop: 8 }}>
                    <ExpandToggle
                      id={expandId}
                      labelOpen="Hide full market data"
                      labelClosed="Show full market data"
                      className="btn sm primary"
                    />
                  </div>
                ) : null}
              </>
            ) : read ? (
              <>
                <p className="hint">
                  No InAuto market report yet for the {read.modelName}.{" "}
                  <Link href={read.reportHref}>
                    {read.pending ? "Build one now" : "Open the model page"}
                  </Link>
                  .
                </p>
                {expandId ? (
                  <div className="card-actions" style={{ marginTop: 8 }}>
                    <ExpandToggle
                      id={expandId}
                      labelOpen="Hide report progress"
                      labelClosed="Show report progress"
                    />
                  </div>
                ) : null}
              </>
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

/** Extra fields Old Cars Data passes through from the platform listing. */
export function listingExtras(raw: Record<string, unknown> | null | undefined): {
  spec: { k: string; v: string }[];
  sections: { k: string; v: string }[];
} {
  const str = (k: string) => {
    const v = raw?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v)) return v.map(String).filter(Boolean).join(", ") || null;
    return null;
  };
  const rows = (pairs: readonly (readonly [string, string])[]) =>
    pairs
      .map(([k, key]) => ({ k, v: str(key) }))
      .filter((e): e is { k: string; v: string } => !!e.v);
  return {
    spec: rows([
      ["Engine", "engine"],
      ["Transmission", "transmission"],
      ["Drivetrain", "drivetrain"],
      ["Body style", "body_style"],
      ["Exterior", "exterior_color"],
      ["Interior", "interior_color"],
      ["Title status", "title_status"],
      ["Seller", "seller_type"],
    ]),
    sections: rows([
      ["Listing details", "listing_details"],
      ["Known flaws", "known_flaws"],
      ["Modifications", "modifications"],
      ["Recent service history", "recent_service_history"],
      ["Ownership history", "ownership_history"],
    ]),
  };
}
