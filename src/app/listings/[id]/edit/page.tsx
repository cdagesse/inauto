import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSignedIn } from "@/components/account/require-signin";
import { EditListingForm } from "@/components/listings/edit-listing-form";
import { deleteDraftListingForm, withdrawListingForm } from "@/server/forms";
import { getListingForViewer } from "@/server/queries/listings";
import { env } from "@/env/server";

export const metadata: Metadata = { title: "Edit listing", robots: { index: false } };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSignedIn(`/listings/${id}/edit`);
  const l = await getListingForViewer(id, user.id);
  if (!l || !l.isOwner) notFound();
  if (l.status === "sold" || l.status === "withdrawn") redirect(`/listings/${l.id}`);
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link href={`/listings/${l.id}`}>Back to listing</Link> · {l.status}
          </div>
          <h1 className="display" style={{ fontSize: 36, margin: "6px 0 0" }}>
            Edit {l.title}
          </h1>
          <p className="sub">
            Change the details, photos and price.{" "}
            {l.type === "auction" ? "The auction length and " : ""}
            The sale type cannot change after creation.
          </p>
        </div>
        <div className="card-actions">
          {l.status === "draft" ? (
            <form action={deleteDraftListingForm}>
              <input type="hidden" name="id" value={l.id} />
              <button type="submit" className="btn sm danger">
                Delete draft
              </button>
            </form>
          ) : (
            <form action={withdrawListingForm}>
              <input type="hidden" name="id" value={l.id} />
              <button type="submit" className="btn sm danger">
                Take down listing
              </button>
            </form>
          )}
        </div>
      </div>
      <EditListingForm
        assistantEnabled={!!env.ANTHROPIC_API_KEY}
        listing={{
          id: l.id,
          type: l.type,
          status: l.status,
          make: l.make,
          model: l.model,
          year: l.year,
          trim: l.trim,
          vin: l.historyVin,
          miles: l.miles,
          color: l.color,
          colorClass: l.colorClass as "std" | "spec" | "pts",
          condition: l.condition as "ex" | "good" | "fair",
          history: l.history as "clean" | "acc",
          packages: l.packages,
          title: l.title,
          description: l.description,
          photos: l.photos,
          location: l.location,
          askingPrice: l.askingPrice,
          reservePrice: l.reservePrice,
          hasBids: l.bids.length > 0,
          sellerDetails: l.sellerDetails ?? null,
        }}
      />
    </div>
  );
}
