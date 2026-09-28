import Link from "next/link";
import { BrandLogo } from "@/components/site/brand-logo";
import { dealerTitle } from "@/lib/listings/dealer-cursor";
import { mi, usd } from "@/lib/format/money";
import type { DealerCardData } from "@/server/queries/dealers";
import { CardPhoto } from "./card-photo";

/** Small "Dealer" badge in the card meta row, in the dealer colour. */
export function DealerBadge({ size = "sm", live = true }: { size?: "sm" | "lg"; live?: boolean }) {
  return (
    <span
      className={`source-badge ${size}${live ? " is-live" : ""}`}
      style={{ ["--badge" as string]: "var(--s3)" }}
    >
      <i aria-hidden="true" />
      {size === "lg" ? "At a dealer" : "Dealer"}
    </span>
  );
}

export function DealerMark() {
  return (
    <span
      className="platform-mark"
      style={{ ["--badge" as string]: "var(--s3)" }}
      aria-hidden="true"
    >
      D
    </span>
  );
}

export function dealerPlace(l: { city: string | null; state: string | null }): string | null {
  const parts = [l.city?.trim(), l.state?.trim()].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function DealerCard({ l }: { l: DealerCardData }) {
  const title = dealerTitle(l);
  const place = dealerPlace(l);
  return (
    <Link
      href={`/listings/dealer/${l.id}`}
      className="panel car-card link-card listing-card external-card dealer-card"
    >
      <CardPhoto src={l.photo ?? undefined}>
        <DealerMark />
      </CardPhoto>
      <div className="lab card-meta">
        <span className="meta-main">
          <DealerBadge />
        </span>
        <span className="meta-side">
          {l.daysOnMarket != null
            ? l.daysOnMarket <= 1
              ? "Just listed"
              : `${l.daysOnMarket} days listed`
            : ""}
        </span>
      </div>
      <h3 className="display" style={{ fontSize: 18, margin: "2px 0 4px" }}>
        {title}
      </h3>
      <div className="hint with-logo sm">
        <BrandLogo make={l.makeSlug} px={18} />
        <span>
          {l.dealerName ?? "Dealer"}
          {place ? ` · ${place}` : ""}
          {l.miles != null ? ` · ${mi(l.miles)} mi` : ""}
        </span>
      </div>
      <div className="num price">
        {l.price ? (
          <>
            {usd(l.price)} <span className="hint">asking</span>
          </>
        ) : (
          <span className="hint">Price on request</span>
        )}
      </div>
    </Link>
  );
}
