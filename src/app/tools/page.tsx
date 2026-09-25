import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { fmtDate } from "@/components/account/money";
import { ServiceOrderForm } from "@/components/listings/service-order-form";
import { listMyServiceOrders } from "@/server/queries/services";

export const metadata: Metadata = {
  title: "Buyer tools",
  description:
    "Title vetting, condition reports, escrow and pricing data so you can buy a collector car without getting burned.",
};

const KIND_LABEL = {
  title_vetting: "Title vetting",
  condition_report: "Condition report",
  escrow: "Escrow",
} as const;

export default async function ToolsPage() {
  const session = await auth();
  const orders = session?.user?.id ? await listMyServiceOrders(session.user.id) : [];
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Buyer protection</div>
          <h1 className="display" style={{ fontSize: 40, margin: "6px 0 0" }}>
            Buy with your eyes open
          </h1>
          <p className="sub">
            Most collector-car fraud is boring: a branded title, undisclosed accident history, a car
            that is not what the photos say. These tools close those gaps before you send money.
          </p>
        </div>
      </div>

      <div className="tool-grid">
        <section className="panel tool">
          <div className="lab">Step 1</div>
          <h2 className="sec">Title vetting</h2>
          <p>
            We pull the title history, lien status, brand flags (salvage, flood, lemon), odometer
            records and theft checks for the VIN, then hand you a plain-English report.
          </p>
          <ul className="checks">
            <li>Title brands and washing across states</li>
            <li>Open liens and lender payoff status</li>
            <li>Odometer rollback signals</li>
            <li>Stolen-vehicle databases</li>
          </ul>
          <a href="#vin" className="btn primary">
            Vet a VIN
          </a>
        </section>
        <section className="panel tool">
          <div className="lab">Step 2</div>
          <h2 className="sec">Condition report</h2>
          <p>
            An independent, marque-experienced inspector documents paint depth, panel gaps,
            underbody, fluids, codes and a road test, with 100+ photos. The seller never picks the
            inspector.
          </p>
          <ul className="checks">
            <li>Paint meter readings on every panel</li>
            <li>Over-rev and fault-code pull where supported</li>
            <li>Matching-numbers and option verification</li>
          </ul>
          <Link href="/listings" className="btn">
            Order from a listing
          </Link>
        </section>
        <section className="panel tool">
          <div className="lab">Step 3</div>
          <h2 className="sec">
            Escrow <span className="pill">Coming soon</span>
          </h2>
          <p>
            Funds sit with a licensed escrow agent until the title transfers and the car is
            delivered as described. Neither side can be ghosted.
          </p>
          <button type="button" className="btn" disabled>
            Not yet available
          </button>
        </section>
        <section className="panel tool">
          <div className="lab">Anytime</div>
          <h2 className="sec">Pricing tool</h2>
          <p>
            Every market report fits a price-vs-mileage curve to real dealer sales and auction
            hammer prices, so you know what a car is worth before you negotiate, and whether an
            asking price is high or low.
          </p>
          <Link href="/markets" className="btn">
            Browse market reports
          </Link>
        </section>
      </div>

      <section className="shelf" id="vin">
        <h2 className="sec">Vet a VIN</h2>
        <p className="sub">
          Enter the 17-character VIN from the listing or the door jamb. We will email you when the
          report is ready.
        </p>
        {session?.user ? (
          <ServiceOrderForm kind="title_vetting" showVin />
        ) : (
          <p className="note">
            <Link href={`/signin?callbackUrl=${encodeURIComponent("/tools#vin")}`}>Sign in</Link> to
            order a title check.
          </p>
        )}
      </section>

      {session?.user ? (
        <section className="shelf">
          <h2 className="sec">Your orders</h2>
          {orders.length === 0 ? (
            <p className="note">No orders yet.</p>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>VIN / listing</th>
                    <th>Status</th>
                    <th>Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>{KIND_LABEL[o.kind]}</td>
                      <td className="mono">
                        {o.vin ??
                          (o.listingId ? (
                            <Link href={`/listings/${o.listingId}`}>listing</Link>
                          ) : (
                            ""
                          ))}
                      </td>
                      <td>
                        <span className={`pill ${o.status === "complete" ? "up" : ""}`}>
                          {o.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="mono">{fmtDate(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
