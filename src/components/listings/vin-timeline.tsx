import { mi, usd } from "@/components/account/money";
import type { VinEvent } from "@/lib/vin/timeline";

const TONE: Record<VinEvent["kind"], string> = {
  dealer_listed: "",
  dealer_sold: "up",
  auction_sold: "up",
  auction_rnm: "down",
  auction_withdrawn: "down",
  auction_live: "accent",
  auction_ended: "",
  inauto_listed: "accent",
  inauto_sold: "up",
  inauto_ended: "down",
};

/** The car's history by VIN: every dealer listing, auction and UrCar listing we have seen. */
export function VinTimeline({ events, vinShown }: { events: VinEvent[]; vinShown: string | null }) {
  if (events.length === 0) return null;
  const sales = events.filter((e) => e.kind.endsWith("_sold") && e.price);
  const first = events.reduce((acc, e) => {
    const start = e.from ?? e.date;
    return start < acc ? start : acc;
  }, events[0]!.from ?? events[0]!.date);
  const last = sales[0];
  return (
    <section className="vin-timeline" aria-labelledby="vin-h">
      <div className="ms-head">
        <div>
          <div className="eyebrow">History by VIN{vinShown ? ` · ${vinShown}` : ""}</div>
          <h2 id="vin-h" className="sec">
            This car has been on the market{" "}
            {events.length === 1 ? "once" : `${events.length} times`}
          </h2>
          <p className="sub" style={{ margin: "4px 0 0" }}>
            First seen {first}
            {last ? `, last sold for ${usd(last.price)} on ${last.date}` : ""}. Prices below are
            asking prices for dealer listings and hammer prices for auctions.
          </p>
        </div>
      </div>
      <ol className="timeline">
        {events.map((e, i) => (
          <li key={i} className={`tl-item ${TONE[e.kind]}${e.current ? " current" : ""}`}>
            <span className="tl-dot" aria-hidden="true" />
            <div className="tl-date mono">
              {e.from && e.from !== e.date ? (
                <>
                  {e.from}
                  <br />
                  to {e.date}
                </>
              ) : (
                e.date
              )}
            </div>
            <div className="tl-body">
              <div className="tl-title">
                {e.href ? <a href={e.href}>{e.title}</a> : e.title}
                {e.current ? <span className="pill accent">This listing</span> : null}
              </div>
              <div className="hint">
                {e.price != null ? usd(e.price) : "No price"}
                {e.miles != null ? ` · ${mi(e.miles)} mi` : ""}
                {e.detail ? ` · ${e.detail}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
