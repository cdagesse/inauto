import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate, mi, usd } from "@/components/account/money";
import { requireSignedIn } from "@/components/account/require-signin";
import { PurchaseResponse } from "@/components/listings/purchase-response";
import { evidenceHref } from "@/lib/purchase/evidence";
import { ADDONS, ONLINE_STEPS } from "@/lib/purchase/pricing";
import { cancelPurchaseForm } from "@/server/forms";
import { getPurchaseForViewer } from "@/server/queries/purchases";

export const metadata: Metadata = { title: "Purchase request", robots: { index: false } };

const STATUS_COPY: Record<string, string> = {
  submitted: "Waiting for the seller to accept.",
  accepted: "Accepted by the seller. Arrange payment and the handover using the steps below.",
  declined: "The seller declined this request.",
  cancelled: "You cancelled this request.",
  completed: "Completed. The listing is marked sold.",
};

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSignedIn(`/purchases/${id}`);
  const p = await getPurchaseForViewer(id, user.id);
  if (!p) notFound();
  const { purchase: pr, listing: l } = p;
  const open = pr.status === "submitted" || pr.status === "accepted";
  const sd = l.sellerDetails ?? {};
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link href={`/listings/${l.id}`}>{l.title}</Link> · Purchase request ·{" "}
            <span
              className={`pill ${pr.status === "accepted" || pr.status === "completed" ? "up" : pr.status === "submitted" ? "accent" : ""}`}
            >
              {pr.status}
            </span>
          </div>
          <h1 className="display" style={{ fontSize: 34, margin: "6px 0 0" }}>
            {p.role === "buyer"
              ? "Your purchase request"
              : `Purchase request from ${pr.buyer.legalName}`}
          </h1>
          <p className="sub">{STATUS_COPY[pr.status]}</p>
        </div>
        <div className="card-actions">
          <a
            href={`/api/purchases/${pr.id}/bill-of-sale`}
            className="btn primary"
            target="_blank"
            rel="noopener"
          >
            Bill of sale (PDF)
          </a>
          {p.role === "buyer" && open ? (
            <form action={cancelPurchaseForm}>
              <input type="hidden" name="id" value={pr.id} />
              <button type="submit" className="btn danger">
                Cancel request
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid-2">
        <div className="stack" style={{ gap: 14 }}>
          <section className="panel">
            <div className="lab">The deal</div>
            <dl className="kv">
              <dt>Vehicle</dt>
              <dd>
                {l.year} {l.make} {l.model}
                {l.trim ? ` ${l.trim}` : ""} · {mi(l.miles)} mi{l.vin ? ` · VIN ${l.vin}` : ""}
              </dd>
              <dt>Price</dt>
              <dd className="num">{usd(pr.price)}</dd>
              <dt>Buying</dt>
              <dd>{pr.mode === "in_person" ? "In person" : "Online"}</dd>
              <dt>Submitted</dt>
              <dd className="mono">{fmtDate(pr.createdAt)}</dd>
            </dl>
          </section>
          <section className="panel">
            <div className="lab">Parties</div>
            <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <b>Buyer</b>
                <div className="hint">
                  {pr.buyer.legalName}
                  <br />
                  {pr.buyer.address}
                  <br />
                  {pr.buyer.phone} · {pr.buyer.email}
                </div>
              </div>
              <div>
                <b>Seller</b>
                <div className="hint">
                  {sd.legalName ?? p.sellerName ?? "Seller"}
                  <br />
                  {sd.address ??
                    (p.role === "seller"
                      ? "Add your address on the listing's edit page for the bill of sale."
                      : "Address on the bill of sale once the seller adds it.")}
                  <br />
                  {sd.phone ?? ""} {p.sellerEmail ?? ""}
                </div>
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="lab">Cart</div>
            <dl className="kv cart-lines">
              {pr.cart.items.map((i) => (
                <div key={i.key} className="cart-line">
                  <dt>{i.label}</dt>
                  <dd className="num">{i.amount ? usd(i.amount) : "—"}</dd>
                </div>
              ))}
              <div className="cart-line total">
                <dt>Total</dt>
                <dd className="num">{usd(pr.cart.total)}</dd>
              </div>
            </dl>
            <ul className="hint" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {pr.options.titleVetting ? (
                <li>{ADDONS.titleVetting.label}: we start once the seller accepts.</li>
              ) : null}
              {pr.options.inspection ? (
                <li>{ADDONS.inspection.label}: we book an inspector near the car once accepted.</li>
              ) : null}
              {pr.options.escrow ? (
                <li>
                  {ADDONS.escrow.label}: we send both parties the escrow instructions once accepted.
                </li>
              ) : null}
              {pr.options.shipping ? (
                <li>
                  {ADDONS.shipping.label}: quotes go to {pr.options.shippingTo || pr.buyer.address}.
                </li>
              ) : null}
            </ul>
          </section>
          {pr.uploads.titleFront || pr.uploads.titleBack || pr.uploads.ownershipVideo ? (
            <section className="panel">
              <div className="lab">Proof on file</div>
              <div className="card-actions" style={{ marginTop: 8 }}>
                {pr.uploads.titleFront ? (
                  <a
                    className="btn sm"
                    href={evidenceHref(pr.id, "title-front")}
                    target="_blank"
                    rel="noopener"
                  >
                    Title, front
                  </a>
                ) : null}
                {pr.uploads.titleBack ? (
                  <a
                    className="btn sm"
                    href={evidenceHref(pr.id, "title-back")}
                    target="_blank"
                    rel="noopener"
                  >
                    Title, back
                  </a>
                ) : null}
                {pr.uploads.ownershipVideo ? (
                  <a
                    className="btn sm"
                    href={evidenceHref(pr.id, "ownership-video")}
                    target="_blank"
                    rel="noopener"
                  >
                    Ownership video
                  </a>
                ) : null}
              </div>
            </section>
          ) : null}
          {pr.note ? (
            <section className="panel">
              <div className="lab">Note from the buyer</div>
              <p style={{ margin: "6px 0 0" }}>{pr.note}</p>
            </section>
          ) : null}
          {pr.sellerNote ? (
            <section className="panel">
              <div className="lab">Note from the seller</div>
              <p style={{ margin: "6px 0 0" }}>{pr.sellerNote}</p>
            </section>
          ) : null}
        </div>
        <aside className="side">
          {p.role === "seller" && open ? <PurchaseResponse id={pr.id} status={pr.status} /> : null}
          {pr.mode === "online" ? (
            <div className="panel">
              <div className="lab">Online purchase safeguards</div>
              <ol className="steps-list">
                {ONLINE_STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="panel">
              <div className="lab">Meeting in person</div>
              <p className="hint" style={{ marginTop: 6 }}>
                Meet at a bank or DMV. Match the VIN on the dash and door jamb to the title. Pay
                only after the title is signed over, and both of you sign the bill of sale.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
