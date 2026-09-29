import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { signInHref } from "@/components/account/require-signin";
import { ConsignmentForm, type ConsignmentPrefill } from "@/components/listings/consignment-form";
import { CONSIGNMENT_SERVICES } from "@/lib/sell/consignment";
import { usd } from "@/lib/format/money";

export const metadata: Metadata = {
  title: "Virtual consignment",
  description:
    "Hand your car to UrCar: condition report, professional photos, logistics and the listing, priced from real market data, for one fee on the sale. We can even keep the car at our facility.",
};

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ConsignPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const session = await auth();
  const value = Number(one(sp.value));
  const keep = Number(one(sp.keep));
  const prefill: ConsignmentPrefill = {
    year: one(sp.year),
    make: one(sp.make),
    model: one(sp.model),
    trim: one(sp.trim),
    miles: one(sp.miles),
    vin: one(sp.vin),
    // A hand-edited link must not break the form: only a clean number rides along.
    estimate: Number.isFinite(value) && value > 0 ? String(Math.round(value)) : "",
  };
  const car = [prefill.year, prefill.make, prefill.model].filter(Boolean).join(" ");
  const qs = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
  ).toString();

  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">Sell · Virtual consignment</div>
          <h1 className="hero-title">
            <span>Hand it to us</span>
            {car || "Virtual consignment"}
          </h1>
          <p className="sub" style={{ maxWidth: "62ch" }}>
            We prepare the car with a condition report and professional photos, handle pickup and
            transport, list it on UrCar priced from real dealer sales and auction results, and can
            keep it at our facility until it sells. One fee on the sale, nothing out of pocket.
          </p>
        </div>
        {value > 0 ? (
          <div className="asof">
            Our market value {usd(value)}
            {keep > 0 ? (
              <>
                <br />
                You keep about {usd(keep)}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <section className="props">
        {CONSIGNMENT_SERVICES.map((s, i) => (
          <div key={s.key} className="panel prop">
            <div className="eyebrow">{i + 1}</div>
            <h3>{s.label}</h3>
            <p>{s.blurb}</p>
          </div>
        ))}
      </section>

      <section className="shelf" id="request">
        <h2 className="sec">Tell us about the car</h2>
        <p className="sub">
          Tick what you would like us to handle. We reply within one business day with the plan, the
          fee, and pickup or drop-off options.
        </p>
        {session?.user ? (
          <ConsignmentForm prefill={prefill} />
        ) : (
          <p className="note">
            <Link href={signInHref(`/sell/consign${qs ? `?${qs}` : ""}`)}>Sign in</Link> to request
            virtual consignment. Prefer to list it yourself?{" "}
            <Link href={`/sell/list${qs ? `?${qs}` : ""}`}>Go to the listing form.</Link>
          </p>
        )}
      </section>
    </>
  );
}
