import Link from "next/link";
import { mi, usd } from "@/components/account/money";

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
}

export function timeLeft(endsAt: Date | null) {
  if (!endsAt) return null;
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export function ListingCard({ l }: { l: ListingCardData }) {
  const photo = l.photos[0];
  return (
    <Link href={`/listings/${l.id}`} className="panel car-card link-card listing-card">
      <div
        className="photo"
        style={photo ? { backgroundImage: `url("${photo}")` } : undefined}
        aria-hidden="true"
      >
        {!photo ? <span className="lab">No photo</span> : null}
      </div>
      <div className="lab">
        {l.type === "auction" ? "Auction" : l.type === "private" ? "Private network" : "Classified"}
        {l.type === "auction" && l.auctionEndsAt ? ` · ${timeLeft(l.auctionEndsAt)}` : ""}
        {l.titleVetted ? (
          <span className="pill up" style={{ marginLeft: 6 }}>
            Title vetted
          </span>
        ) : null}
      </div>
      <h3 className="display" style={{ fontSize: 18, margin: "2px 0 4px" }}>
        {l.title}
      </h3>
      <div className="hint">
        {l.year} {l.make} {l.model} · {mi(l.miles)} mi{l.location ? ` · ${l.location}` : ""}
      </div>
      <div className="num price">
        {l.type === "auction" ? (
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
