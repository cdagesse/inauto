import Link from "next/link";
import { RecordView } from "@/components/home/recent-views";
import { BrandLogo } from "@/components/site/brand-logo";
import { longDate } from "@/components/market/format";
import { fmtDate, fmtDateTime, mi, usd } from "@/lib/format/money";
import { dealerTitle } from "@/lib/listings/dealer-cursor";
import { maskVin } from "@/lib/sources/live";
import type { DealerDetail as DealerDetailData } from "@/server/queries/dealers";
import { DealerBadge, DealerMark, dealerPlace } from "./dealer-card";
import type { UrCarRead } from "./external-detail";
import { ExpandToggle } from "./expandable";
import { ExternalGallery } from "./external-gallery";
import { StickyHead } from "./sticky-head";

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <tr>
      <th style={{ width: "38%" }}>{k}</th>
      <td className={mono ? "mono" : undefined}>{v}</td>
    </tr>
  );
}

/** "Asking price is 8% over our market value" style copy. */
function askDelta(price: number | null, marketValue: number | null | undefined) {
  if (price == null || price <= 0 || marketValue == null || marketValue <= 0) return null;
  const pct = (price - marketValue) / marketValue;
  const abs = Math.abs(Math.round(pct * 100));
  const direction = pct < -0.005 ? "under" : pct > 0.005 ? "over" : "at";
  return {
    direction,
    text:
      direction === "at"
        ? "Asking price is at our market value"
        : `Asking price is ${abs}% ${direction} our market value`,
  };
}

/**
 * A dealer inventory listing from Visor: photos, the car, the dealer and a link to the
 * dealer's own page, with the UrCar read and the market block underneath.
 */
export function DealerDetail({
  l,
  read,
  market,
  expandId,
}: {
  l: DealerDetailData;
  read: UrCarRead | null;
  market?: React.ReactNode;
  expandId?: string;
}) {
  const title = dealerTitle(l);
  const place = dealerPlace(l);
  const carLine = dealerTitle({ ...l, year: null });
  const delta = read?.valuation ? askDelta(l.price, read.valuation.marketValue) : null;
  const dealer = l.dealerName ?? "the dealer";
  return (
    <article className="external-page dealer-page">
      <RecordView
        item={{
          key: `dealer:${l.id}`,
          href: `/listings/dealer/${l.id}`,
          title,
          sub: [carLine, l.miles != null ? `${mi(l.miles)} miles` : null]
            .filter(Boolean)
            .join(" · "),
          price: l.price,
          currency: "USD",
          priceLabel: "Asking",
          photo: l.photos[0] ?? null,
          badge: l.dealerName ? `At ${l.dealerName}` : "At a dealer",
        }}
      />
      <StickyHead photo={l.photos[0] ?? null}>
        <div className="head-main">
          <div className="eyebrow">
            <Link href="/listings">Listings</Link> /{" "}
            <Link href="/listings?source=dealer">Dealers</Link>
          </div>
          <h1 className="display head-title">{title}</h1>
          <p className="sub head-sub">
            <DealerBadge size="lg" live={l.current} />
            {l.dealerName ? <> · {l.dealerName}</> : null}
            {place ? <> · {place}</> : null}
            {l.miles != null ? <> · {mi(l.miles)} miles</> : null}
          </p>
        </div>
        <div className="price-block">
          <div className="lab">Asking price</div>
          <div className="display num head-price">{l.price ? usd(l.price) : "On request"}</div>
          {!l.current ? (
            <div className="pill">No longer in the dealer&apos;s latest inventory</div>
          ) : null}
          <div className="hint">
            {l.daysOnMarket == null
              ? "Days on market unknown"
              : l.daysOnMarket <= 0
                ? "Listed today"
                : `${l.daysOnMarket} day${l.daysOnMarket === 1 ? "" : "s"} on the market`}
            {l.listedAt ? ` · listed ${fmtDate(l.listedAt)}` : ""}
          </div>
        </div>
      </StickyHead>

      <div className="grid-2 listing-body">
        <div>
          <ExternalGallery
            photos={l.photos}
            title={title}
            placeholder={
              <div className="external-placeholder" aria-hidden="true">
                <DealerMark />
                <span className="hint">Photos are on the dealer&apos;s page</span>
              </div>
            }
          />
          <h2 className="sec" style={{ marginTop: 20 }}>
            Specification
          </h2>
          <div className="tw">
            <table>
              <tbody>
                <Row
                  k="Dealer"
                  v={[l.dealerName, place].filter(Boolean).join(", ") || "Not listed"}
                />
                <Row k="Year" v={l.year ? String(l.year) : "Not listed"} />
                <Row k="Make / model" v={carLine || "Not listed"} />
                <Row k="Miles" v={l.miles != null ? mi(l.miles) : "Not listed"} />
                <Row k="Color" v={l.color ?? "Not listed"} />
                {l.packages.length ? <Row k="Packages" v={l.packages.join(", ")} /> : null}
                <Row k="VIN" v={maskVin(l.vin) ?? "Not published"} mono />
                {l.stockNumber ? <Row k="Stock number" v={l.stockNumber} mono /> : null}
                <Row k="Listed" v={l.listedAt ? fmtDate(l.listedAt) : "Unknown"} mono />
                <Row k="Inventory snapshot" v={longDate(l.snapshotDate)} mono />
                <Row k="Last checked" v={fmtDateTime(l.fetchedAt)} mono />
              </tbody>
            </table>
          </div>
          <p className="note external-notice">
            Listing details come from the dealer through Visor; UrCar is not the seller. Confirm
            availability and price with {dealer}.
          </p>
          {market}
        </div>
        <aside className="side">
          <div className="panel go-panel">
            <div className="lab with-logo">
              <BrandLogo make={l.makeSlug} px={18} /> <span>At {dealer}</span>
            </div>
            {l.url ? (
              <a
                href={l.url}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="btn primary"
                style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
              >
                View at {l.dealerName ? "the dealer" : "dealer"} ↗
              </a>
            ) : (
              <p className="hint" style={{ marginTop: 8 }}>
                The dealer&apos;s page was not published for this car.
              </p>
            )}
            <p className="hint" style={{ marginTop: 8 }}>
              Opens the dealer&apos;s own listing in a new tab. Buying happens with the dealer, not
              on UrCar.
            </p>
          </div>
          <div className="panel">
            <div className="lab">UrCar read</div>
            {read?.valuation ? (
              <>
                <h3 className="display" style={{ fontSize: 18, margin: "4px 0 6px" }}>
                  Our market value {usd(read.valuation.marketValue)}
                </h3>
                {delta ? (
                  <p className={`delta ${delta.direction}`}>{delta.text}.</p>
                ) : (
                  <p className="hint">No asking price to compare against.</p>
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
              <p className="hint">
                No UrCar market report yet for the {read.modelName}.{" "}
                <Link href={read.reportHref}>
                  {read.pending ? "Build one now" : "Open the model page"}
                </Link>
                .
              </p>
            ) : (
              <p className="hint">This listing is not matched to a model in our catalog yet.</p>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}
