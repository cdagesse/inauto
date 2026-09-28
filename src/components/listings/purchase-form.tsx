"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { mi, usd } from "@/lib/format/money";
import { ADDONS, buildCart, ONLINE_STEPS, type PurchaseOptions } from "@/lib/purchase/pricing";
import { createPurchase } from "@/server/purchases";
import { DocUpload } from "./doc-upload";

export interface PurchaseListing {
  id: string;
  title: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  miles: number;
  vin: string | null;
  location: string | null;
  askingPrice: number;
  photo: string | null;
  sellerName: string | null;
  sellerHasDetails: boolean;
}

export function PurchaseForm({
  listing,
  buyer,
}: {
  listing: PurchaseListing;
  buyer: { name: string | null; email: string | null };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"in_person" | "online" | null>(null);
  const [info, setInfo] = useState({
    legalName: buyer.name ?? "",
    email: buyer.email ?? "",
    phone: "",
    address: "",
  });
  const [opts, setOpts] = useState<PurchaseOptions & { shippingTo: string }>({
    inspection: false,
    titleVetting: false,
    escrow: false,
    shipping: false,
    shippingTo: "",
  });
  const [uploads, setUploads] = useState<{
    titleFront?: string;
    titleBack?: string;
    ownershipVideo?: string;
  }>({});
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const cart = useMemo(() => buildCart(listing.askingPrice, opts), [listing.askingPrice, opts]);

  function choose(m: "in_person" | "online") {
    setMode(m);
    // Online buyers get the safeguards switched on; they can switch them off knowingly.
    if (m === "online")
      setOpts((o) => ({ ...o, escrow: true, titleVetting: true, inspection: true }));
  }

  function submit() {
    setError(null);
    if (!mode) return setError("Choose how you are buying.");
    start(async () => {
      const r = await createPurchase({
        listingId: listing.id,
        mode,
        buyer: info,
        options: { ...opts, shippingTo: opts.shipping ? opts.shippingTo : undefined },
        uploads,
        note: note || null,
        acknowledged: ack,
      });
      if (!r.ok) return setError(r.error);
      router.push(`/purchases/${r.data.id}`);
    });
  }

  const toggle = (k: keyof PurchaseOptions) => (
    <label className="check addon">
      <input
        type="checkbox"
        checked={opts[k]}
        onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))}
      />
      <span>
        <b>{ADDONS[k].label}</b>
        <span className="hint">{ADDONS[k].blurb}</span>
      </span>
      <span className="num addon-price">
        {k === "escrow" ? `1%, min $250` : ADDONS[k].price === 0 ? "Quote" : usd(ADDONS[k].price)}
      </span>
    </label>
  );

  return (
    <div className="purchase">
      <div className="purchase-main">
        <section className="panel">
          <div className="lab">1 · How are you buying?</div>
          <div className="choice-grid" style={{ marginTop: 8 }}>
            <button
              type="button"
              className={`choice ${mode === "in_person" ? "on" : ""}`}
              aria-pressed={mode === "in_person"}
              onClick={() => choose("in_person")}
            >
              <b className="display">In person</b>
              <span className="hint">
                You will meet the seller, see the car and the title, and pay face to face.
              </span>
            </button>
            <button
              type="button"
              className={`choice ${mode === "online" ? "on" : ""}`}
              aria-pressed={mode === "online"}
              onClick={() => choose("online")}
            >
              <b className="display">Online, sight unseen</b>
              <span className="hint">
                You will not meet the seller before money moves. We will walk you through protecting
                yourself.
              </span>
            </button>
          </div>
          {mode === "online" ? (
            <div className="rec" style={{ marginTop: 14 }}>
              <b>Buying online: five steps that keep you safe</b>
              <ol className="steps-list">
                {ONLINE_STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <label className="check" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I
                have read these and understand that UrCar is not the seller.
              </label>
            </div>
          ) : null}
          {mode === "in_person" ? (
            <p className="hint" style={{ marginTop: 10 }}>
              Meet at a bank or the DMV, verify the VIN on the car against the title, and never hand
              over money before the title is signed to you.
            </p>
          ) : null}
        </section>

        <section className="panel">
          <div className="lab">2 · Your details (for the bill of sale)</div>
          <div className="grid-3" style={{ marginTop: 8 }}>
            <div className="fld">
              <label htmlFor="b-name">Legal name</label>
              <input
                id="b-name"
                value={info.legalName}
                onChange={(e) => setInfo({ ...info, legalName: e.target.value })}
                maxLength={120}
                required
              />
            </div>
            <div className="fld">
              <label htmlFor="b-email">Email</label>
              <input
                id="b-email"
                type="email"
                value={info.email}
                onChange={(e) => setInfo({ ...info, email: e.target.value })}
                required
              />
            </div>
            <div className="fld">
              <label htmlFor="b-phone">Phone</label>
              <input
                id="b-phone"
                type="tel"
                value={info.phone}
                onChange={(e) => setInfo({ ...info, phone: e.target.value })}
                maxLength={40}
                required
              />
            </div>
          </div>
          <div className="fld">
            <label htmlFor="b-addr">Address</label>
            <input
              id="b-addr"
              value={info.address}
              onChange={(e) => setInfo({ ...info, address: e.target.value })}
              maxLength={300}
              placeholder="Street, city, state, ZIP"
              required
            />
          </div>
          <p className="hint">
            The seller&apos;s side of the bill of sale comes from{" "}
            {listing.sellerName ?? "the seller"}
            {listing.sellerHasDetails
              ? "'s listing details."
              : ", who has not added their legal details yet; those lines stay blank until they do."}
          </p>
        </section>

        <section className="panel">
          <div className="lab">3 · Safety options</div>
          <div className="addons" style={{ marginTop: 8 }}>
            {toggle("titleVetting")}
            {toggle("inspection")}
            {toggle("escrow")}
            {toggle("shipping")}
            {opts.shipping ? (
              <div className="fld">
                <label htmlFor="b-ship">Ship to</label>
                <input
                  id="b-ship"
                  value={opts.shippingTo}
                  onChange={(e) => setOpts((o) => ({ ...o, shippingTo: e.target.value }))}
                  maxLength={300}
                  placeholder="Delivery address, if different"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="lab">4 · Ask the seller for proof</div>
          <p className="hint" style={{ margin: "6px 0 10px" }}>
            Attach what the seller sends you, so it is on file with this purchase. Photos of the
            title front and back, and a short video of the seller with the car showing the VIN
            plate.
          </p>
          <div className="grid-3">
            <DocUpload
              slot="title-front"
              label="Title, front"
              accept="image/*,application/pdf"
              value={uploads.titleFront}
              onChange={(u) => setUploads((x) => ({ ...x, titleFront: u }))}
            />
            <DocUpload
              slot="title-back"
              label="Title, back"
              accept="image/*,application/pdf"
              value={uploads.titleBack}
              onChange={(u) => setUploads((x) => ({ ...x, titleBack: u }))}
            />
            <DocUpload
              slot="ownership"
              label="Video proof of ownership"
              accept="video/*"
              hint="Up to 200 MB"
              value={uploads.ownershipVideo}
              onChange={(u) => setUploads((x) => ({ ...x, ownershipVideo: u }))}
            />
          </div>
          <div className="fld">
            <label htmlFor="b-note">Note to the seller (optional)</label>
            <textarea
              id="b-note"
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </section>
      </div>

      <aside className="purchase-cart panel">
        <div className="lab">Your cart</div>
        <div className="cart-car">
          {listing.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.photo} alt="" />
          ) : null}
          <div>
            <b className="display">{listing.title}</b>
            <div className="hint">
              {listing.year} {listing.make} {listing.model} · {mi(listing.miles)} mi
              {listing.location ? ` · ${listing.location}` : ""}
            </div>
          </div>
        </div>
        <dl className="kv cart-lines">
          {cart.items.map((i) => (
            <div key={i.key} className="cart-line">
              <dt>{i.label}</dt>
              <dd className="num">{i.amount === 0 ? "—" : usd(i.amount)}</dd>
            </div>
          ))}
          <div className="cart-line total">
            <dt>Total</dt>
            <dd className="num">{usd(cart.total)}</dd>
          </div>
          <div className="cart-line">
            <dt>Due to UrCar now</dt>
            <dd className="num">{usd(cart.dueNow)}</dd>
          </div>
          <div className="cart-line">
            <dt>{opts.escrow ? "Into escrow" : "To the seller"}</dt>
            <dd className="num">{usd(listing.askingPrice)}</dd>
          </div>
        </dl>
        {error ? <p className="err">{error}</p> : null}
        <button
          type="button"
          className="btn primary"
          style={{ width: "100%", justifyContent: "center" }}
          disabled={pending}
          onClick={submit}
        >
          {pending ? "Sending…" : "Send purchase request"}
        </button>
        <p className="hint" style={{ marginTop: 8 }}>
          Nothing is charged yet. The seller reviews your request; once accepted you both get the
          bill of sale and the next steps for payment{opts.escrow ? " through escrow" : ""}.
        </p>
        <Link href={`/listings/${listing.id}`} className="hint">
          Back to the listing
        </Link>
      </aside>
    </div>
  );
}
