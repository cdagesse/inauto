import Link from "next/link";
import { mi, usd } from "@/components/account/money";
import { BrandLogo } from "@/components/site/brand-logo";
import { effectiveStatus, outcomeLabel, priceLabel } from "@/lib/sources/status";
import type { ExternalCardData } from "@/server/queries/external";
import { PlatformMark, SourceBadge } from "./source-badge";
import { Countdown } from "./countdown";

export function ExternalCard({ l, showPhotos }: { l: ExternalCardData; showPhotos: boolean }) {
  const photo = showPhotos ? l.photoUrls[0] : undefined;
  const status = effectiveStatus(l.status, l.endsAt);
  const live = status === "live";
  const price = live ? l.currentBid : (l.finalPrice ?? l.currentBid);
  return (
    <Link
      href={`/listings/ext/${l.source}/${encodeURIComponent(l.sourceId)}`}
      className="panel car-card link-card listing-card external-card"
    >
      <div
        className="photo"
        style={photo ? { backgroundImage: `url("${photo}")` } : undefined}
        aria-hidden="true"
      >
        {!photo ? <PlatformMark source={l.source} /> : null}
      </div>
      <div className="lab card-meta">
        <span className="meta-main">
          <SourceBadge source={l.source} sourceName={l.sourceName} status={status} compact />
        </span>
        <span className={`meta-side${status === "sold" ? " up" : status === "rnm" ? " down" : ""}`}>
          {live ? l.endsAt ? <Countdown endsAt={l.endsAt} /> : "Live" : outcomeLabel(status)}
        </span>
      </div>
      <h3 className="display" style={{ fontSize: 18, margin: "2px 0 4px" }}>
        {l.title}
      </h3>
      <div className="hint with-logo sm">
        {l.make ? <BrandLogo make={l.make} px={18} /> : null}
        <span>
          {[l.year, l.make, l.model].filter(Boolean).join(" ")}
          {l.miles != null ? ` · ${mi(l.miles)} mi` : ""}
          {l.location ? ` · ${l.location}` : ""}
        </span>
      </div>
      <div className="num price">
        {price ? (
          <>
            {usd(price)}{" "}
            <span className="hint">
              {priceLabel(status, true)}
              {l.bidCount ? ` · ${l.bidCount} bids` : ""}
            </span>
          </>
        ) : (
          <span className="hint">{priceLabel(status, false)}</span>
        )}
      </div>
    </Link>
  );
}
