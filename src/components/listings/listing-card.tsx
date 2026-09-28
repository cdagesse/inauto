import Link from "next/link";
import { mi, usd } from "@/lib/format/money";
import { BrandLogo } from "@/components/site/brand-logo";
import { Countdown } from "./countdown";

export interface ListingCardData {
  id: string;
  type: "classified" | "auction" | "private";
  title: string;
  year: number;
  make: string;
  model: string;
  miles: number;
  askingPrice: number | null;
  photos: string[];
  location: string | null;
  auctionEndsAt: Date | null;
  highBid: number | null;
  titleVetted: boolean;
  /** Present for past listings; active listings may omit it. */
  status?: "draft" | "active" | "ended" | "sold" | "withdrawn";
  soldPrice?: number | null;
}

/**
 * "2d 4h left" beyond a day, "3h 12m left" beyond an hour, "4m 09s left"
 * inside the hour, "42s left" inside the minute, "Ended" at zero.
 */
export function timeLeft(endsAt: Date | null, now: number = Date.now()) {
  if (!endsAt) return null;
  const ms = endsAt.getTime() - now;
  if (ms <= 0) return "Ended";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s left`;
  return `${s}s left`;
}

export function ListingCard({ l, highlight = false }: { l: ListingCardData; highlight?: boolean }) {
  const photo = l.photos[0];
  const past = l.status === "sold" || l.status === "ended" || l.status === "withdrawn";
  return (
    <Link
      href={`/listings/${l.id}`}
      className={`panel car-card link-card listing-card${highlight ? " inauto-card" : ""}`}
    >
      <div
        className="photo"
        style={photo ? { backgroundImage: `url("${photo}")` } : undefined}
        aria-hidden="true"
      >
        {!photo ? <span className="lab">No photo</span> : null}
      </div>
      <div className="lab card-meta">
        <span className="meta-main">
          {highlight ? <span className="pill accent inauto-pill">On UrCar</span> : null}
          {l.type === "auction"
            ? "Auction"
            : l.type === "private"
              ? "Private network"
              : "Classified"}
          {l.titleVetted ? (
            <span className="pill up" style={{ marginLeft: 6 }}>
              Title vetted
            </span>
          ) : null}
        </span>
        <span className="meta-side">
          {l.status === "sold" ? (
            <span className="up">Sold</span>
          ) : l.status === "ended" ? (
            <span className="down">Not sold</span>
          ) : l.status === "withdrawn" ? (
            "Withdrawn"
          ) : l.type === "auction" && l.auctionEndsAt ? (
            <Countdown endsAt={l.auctionEndsAt} />
          ) : null}
        </span>
      </div>
      <h3 className="display" style={{ fontSize: 18, margin: "2px 0 4px" }}>
        {l.title}
      </h3>
      <div className="hint with-logo sm">
        <BrandLogo make={l.make} px={18} />
        <span>
          {l.year} {l.make} {l.model} · {mi(l.miles)} mi{l.location ? ` · ${l.location}` : ""}
        </span>
      </div>
      <div className="num price">
        {l.status === "sold" ? (
          <>
            {usd(l.soldPrice ?? l.highBid ?? l.askingPrice)} <span className="hint">sold for</span>
          </>
        ) : past ? (
          (l.highBid ?? l.askingPrice) ? (
            <>
              {usd(l.highBid ?? l.askingPrice)}{" "}
              <span className="hint">{l.type === "auction" ? "high bid" : "asking"}</span>
            </>
          ) : (
            <span className="hint">No result</span>
          )
        ) : l.type === "auction" ? (
          l.highBid ? (
            <>
              {usd(l.highBid)} <span className="hint">high bid</span>
            </>
          ) : (
            <span className="hint">No bids yet</span>
          )
        ) : (
          usd(l.askingPrice)
        )}
      </div>
    </Link>
  );
}
