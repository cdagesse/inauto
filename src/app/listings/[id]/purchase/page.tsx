import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSignedIn } from "@/components/account/require-signin";
import { PurchaseForm } from "@/components/listings/purchase-form";
import { getListingForViewer } from "@/server/queries/listings";

export const metadata: Metadata = { title: "Purchase", robots: { index: false } };

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSignedIn(`/listings/${id}/purchase`);
  const l = await getListingForViewer(id, user.id);
  if (!l) notFound();
  if (l.isOwner) redirect(`/listings/${id}`);
  if (l.status !== "active" || l.type === "auction" || !l.askingPrice) redirect(`/listings/${id}`);
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link href={`/listings/${l.id}`}>Back to listing</Link> · Purchase
          </div>
          <h1 className="display" style={{ fontSize: 36, margin: "6px 0 0" }}>
            Buy the {l.title}
          </h1>
          <p className="sub">
            Tell us how you are buying, add the protections you want, and we generate the bill of
            sale. Nothing is charged until the seller accepts.
          </p>
        </div>
      </div>
      <PurchaseForm
        listing={{
          id: l.id,
          title: l.title,
          year: l.year,
          make: l.make,
          model: l.model,
          trim: l.trim,
          miles: l.miles,
          vin: l.vin,
          location: l.location,
          askingPrice: l.askingPrice,
          photo: l.photos[0] ?? null,
          sellerName: l.sellerName,
          sellerHasDetails: !!l.sellerDetails?.legalName,
        }}
        buyer={{ name: user.name, email: user.email }}
      />
    </div>
  );
}
