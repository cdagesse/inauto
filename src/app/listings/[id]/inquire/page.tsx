import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSignedIn } from "@/components/account/require-signin";
import { InquireForm } from "@/components/listings/inquire-form";
import { getListingForViewer } from "@/server/queries/listings";

export const metadata: Metadata = { title: "Inquire", robots: { index: false } };

export default async function InquirePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSignedIn(`/listings/${id}/inquire`);
  const l = await getListingForViewer(id, user.id);
  if (!l) notFound();
  if (l.isOwner || l.status !== "active") redirect(`/listings/${id}`);
  return (
    <div style={{ maxWidth: 680 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link href={`/listings/${l.id}`}>Back to listing</Link> · Inquire
          </div>
          <h1 className="display" style={{ fontSize: 36, margin: "6px 0 0" }}>
            Ask about the {l.title}
          </h1>
          <p className="sub">Your question goes to the seller with your contact details.</p>
        </div>
      </div>
      <InquireForm listingId={l.id} title={l.title} />
    </div>
  );
}
