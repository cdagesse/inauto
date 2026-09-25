import Link from "next/link";
import { mi, usd } from "@/components/account/money";
import type { ExternalCardData } from "@/server/queries/external";
import { PlatformMark, SourceBadge } from "./source-badge";
import { timeLeft } from "./listing-card";

export function ExternalCard({ l, showPhotos }: { l: ExternalCardData; showPhotos: boolean }) {
  const photo = showPhotos ? l.photoUrls[0] : undefined;
  const live = l.status === "live";
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
      <div className="lab">
        <SourceBadge source={l.source} sourceName={l.sourceName} status={l.status} />
        {live && l.endsAt ? ` · ${timeLeft(l.endsAt)}` : ""}
      </div>
      <h3 className="display" style={{ fontSize: 18, margin: "2px 0 4px" }}>
        {l.title}
      </h3>
      <div className="hint">
        {[l.year, l.make, l.model].filter(Boolean).join(" ")}
        {l.miles != null ? ` · ${mi(l.miles)} mi` : ""}
        {l.location ? ` · ${l.location}` : ""}
      </div>
      <div className="num price">
        {price ? (
          <>
            {usd(price)}{" "}
            <span className="hint">
              {live
                ? "current bid"
                : l.status === "sold"
                  ? "sold"
                  : l.status === "rnm"
                    ? "high bid, no sale"
                    : "final bid"}
              {live && l.bidCount ? ` · ${l.bidCount} bids` : ""}
            </span>
          </>
        ) : (
          <span className="hint">{live ? "No bids yet" : "No result"}</span>
        )}
      </div>
    </Link>
  );
}
