import Link from "next/link";
import { signInHref } from "@/components/account/require-signin";

/** Purchase and Inquire buttons under the market data, for buyers of an active listing. */
export function PurchaseCta({
  id,
  type,
  status,
  signedIn,
  askingPrice,
}: {
  id: string;
  type: "classified" | "auction" | "private";
  status: string;
  signedIn: boolean;
  askingPrice: number | null;
}) {
  if (status !== "active") return null;
  const purchaseHref = signedIn
    ? `/listings/${id}/purchase`
    : signInHref(`/listings/${id}/purchase`);
  const inquireHref = signedIn ? `/listings/${id}/inquire` : signInHref(`/listings/${id}/inquire`);
  const canPurchase = type !== "auction" && askingPrice != null && askingPrice > 0;
  return (
    <div className="panel purchase-cta">
      <div className="lab">Interested?</div>
      <div className="card-actions" style={{ marginTop: 8 }}>
        {canPurchase ? (
          <Link href={purchaseHref} className="btn primary">
            Purchase
          </Link>
        ) : null}
        <Link href={inquireHref} className="btn">
          Inquire
        </Link>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        {canPurchase
          ? "Purchase walks you through buying in person or online, with title checks, inspection, escrow and shipping, and generates the bill of sale."
          : "Auctions are bought by bidding. Ask the seller anything first."}
      </p>
    </div>
  );
}
