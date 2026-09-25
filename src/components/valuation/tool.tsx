"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketSnapshot } from "@/lib/market/types";
import { useGeneration } from "@/components/market/use-generation";
import { yearOverride } from "@/lib/valuation/config";
import { fmtMiles, usd, usdK, valuate } from "@/lib/valuation/engine";
import type { ColorClass, Condition, History, ValuationInputs } from "@/lib/valuation/types";

interface FormState {
  year: number;
  miles: string;
  weissach: boolean;
  colorClass: ColorClass;
  condition: Condition;
  history: History;
}

function Seg<T extends string>({
  label,
  id,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  id: string;
  value: T;
  options: { v: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <div className="fld">
      <span className="lab" id={id}>
        {label}
      </span>
      <div className="seg" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-pressed={o.v === value}
            disabled={o.disabled}
            onClick={() => onChange(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function ValuationTool({ snapshot }: { snapshot: MarketSnapshot }) {
  const [gen, selectGen] = useGeneration(snapshot.model.slug, snapshot.order, snapshot.order[0]);
  const G = snapshot.generations[gen];
  const years = snapshot.years[gen] ?? [];
  const offersWeissach = G.packages.includes("weissach");

  const [form, setForm] = useState<FormState>(() => ({
    year: years[0],
    miles: String(Math.round(G.medianMiles / 100) * 100),
    weissach: false,
    colorClass: "std",
    condition: "ex",
    history: "clean",
  }));

  // When the generation changes (from the pills or the select), reset year, miles and package.
  const lastGen = useRef(gen);
  useEffect(() => {
    if (lastGen.current === gen) return;
    lastGen.current = gen;
    setForm((f) => ({
      ...f,
      year: (snapshot.years[gen] ?? [])[0],
      miles: String(Math.round(snapshot.generations[gen].medianMiles / 100) * 100),
      weissach: snapshot.generations[gen].packages.includes("weissach") ? f.weissach : false,
    }));
  }, [gen, snapshot]);

  const inputs: ValuationInputs = useMemo(
    () => ({
      generation: gen,
      year: form.year,
      miles: Math.max(0, Number(form.miles) || 0),
      packages: form.weissach && offersWeissach ? ["weissach"] : [],
      colorClass: form.colorClass,
      condition: form.condition,
      history: form.history,
    }),
    [gen, form, offersWeissach],
  );

  const v = useMemo(() => valuate(snapshot, inputs), [snapshot, inputs]);

  // Log the request (debounced, fire-and-forget) so we can tune the model later.
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ make: snapshot.make.slug, model: snapshot.model.slug, inputs }),
        keepalive: true,
      }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [inputs, snapshot.make.slug, snapshot.model.slug]);

  const override = yearOverride(gen, form.year);
  const best = v.recommendation.channel;
  const gapTxt = v.auction.gapEstimated
    ? `no recent ${G.name} auctions to measure against, so we assume ${Math.round(-v.auction.gap * 100)}% under dealer`
    : `${G.name} auctions have run ${Math.abs(Math.round(v.auction.gap * 100))}% ${v.auction.gap < 0 ? "under" : "over"} dealer prices (${v.auction.gapSampleSize} sales)`;
  const conf = v.thin
    ? `Only a handful of recent ${G.name} sales, so treat this as a starting point and get an appraisal.`
    : `Half of comparable sales at this spec land between ${usd(v.range.lo)} and ${usd(v.range.hi)}.`;
  const adjTxt = v.adjustments
    .map((a) => `${a.label} ${a.pct > 0 ? "+" : ""}${Math.round(a.pct * 100)}%`)
    .join(", ");
  const short = snapshot.model.shortName;

  return (
    <div className="val">
      <form className="form" onSubmit={(e) => e.preventDefault()}>
        <div className="fld">
          <label htmlFor="vGen">Generation</label>
          <select id="vGen" value={gen} onChange={(e) => selectGen(e.target.value)}>
            {snapshot.order.map((k) => (
              <option key={k} value={k}>
                {snapshot.generations[k].name} ({snapshot.generations[k].years})
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="vYear">Model year</label>
          <select
            id="vYear"
            value={form.year}
            onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="vMiles">Mileage</label>
          <input
            id="vMiles"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={form.miles}
            onChange={(e) => setForm((f) => ({ ...f, miles: e.target.value }))}
          />
          <span className="hint">
            Typical {G.name} sells with {fmtMiles(G.medianMiles)} miles.
            {override ? ` ${override.note}` : ""}
          </span>
        </div>
        <Seg
          id="lWei"
          label={offersWeissach ? "Weissach package" : "Weissach package (992 and 991.2 only)"}
          value={form.weissach ? "1" : "0"}
          options={[
            { v: "0", label: "No" },
            { v: "1", label: "Yes", disabled: !offersWeissach },
          ]}
          onChange={(x) => setForm((f) => ({ ...f, weissach: x === "1" }))}
        />
        <Seg<ColorClass>
          id="lCol"
          label="Color"
          value={form.colorClass}
          options={[
            { v: "std", label: "Standard" },
            { v: "spec", label: "Special color" },
            { v: "pts", label: "Paint to Sample" },
          ]}
          onChange={(colorClass) => setForm((f) => ({ ...f, colorClass }))}
          hint="Special: Shark Blue, Lizard Green, Python Green, Voodoo Blue and similar."
        />
        <Seg<Condition>
          id="lCon"
          label="Condition"
          value={form.condition}
          options={[
            { v: "ex", label: "Excellent" },
            { v: "good", label: "Good" },
            { v: "fair", label: "Needs work" },
          ]}
          onChange={(condition) => setForm((f) => ({ ...f, condition }))}
        />
        <Seg<History>
          id="lHist"
          label="History report"
          value={form.history}
          options={[
            { v: "clean", label: "Clean" },
            { v: "acc", label: "Accident reported" },
          ]}
          onChange={(history) => setForm((f) => ({ ...f, history }))}
        />
      </form>

      <div>
        <div className="est" aria-live="polite">
          <div className="l">
            Estimated market value · {form.year} {short}
            {inputs.packages.includes("weissach") ? " Weissach" : ""}
            {v.thin ? (
              <>
                {" "}
                <span className="pill">Thin sample</span>
              </>
            ) : null}
          </div>
          <div className="v">{usd(v.marketValue)}</div>
          <div className="s">{conf}</div>
        </div>

        <div className="rec">
          <b>Our recommendation: {v.recommendation.title}</b>
          <p>{v.recommendation.reason}</p>
        </div>

        <div className="chans">
          <div className={`chan${best === "auction" ? " best" : ""}`}>
            <h3>
              Online auction
              {best === "auction" ? <span className="pill">Best net</span> : null}
            </h3>
            <div className="cap">Expected hammer price</div>
            <div className="big">{usd(v.auction.expectedHammer)}</div>
            <div className="cap">
              Likely range {usdK(v.auction.range.lo)} to {usdK(v.auction.range.hi)}. Suggested
              reserve {usd(v.auction.suggestedReserve)}.
            </div>
            <dl>
              <dt>Hammer price</dt>
              <dd>{usd(v.auction.expectedHammer)}</dd>
              <dt>Listing fee (BaT Plus)</dt>
              <dd>−{usd(v.auction.listingFee)}</dd>
              <dt>Detail, photos, inspection</dt>
              <dd>−{usd(v.auction.prep)}</dd>
              <span className="rule" />
              <dt className="tot">You keep</dt>
              <dd className="tot">{usd(v.auction.net)}</dd>
            </dl>
            <div className="cap">
              Buyer also pays a {usd(v.auction.buyerFee)} fee on top. About 3 to 6 weeks from
              submission to payment. {gapTxt}.
            </div>
          </div>

          <div className={`chan${best === "dealer" ? " best" : ""}`}>
            <h3>
              Sell to a dealer
              {best === "dealer" ? <span className="pill">Recommended</span> : null}
            </h3>
            <div className="cap">Expected offer</div>
            <div className="big">{usd(v.dealer.offer)}</div>
            <div className="cap">
              Typical offers {usdK(v.dealer.range.lo)} to {usdK(v.dealer.range.hi)}.
            </div>
            <dl>
              <dt>Market value</dt>
              <dd>{usd(v.marketValue)}</dd>
              <dt>Dealer margin, recon, holding</dt>
              <dd>−{Math.round(v.dealer.margin * 100)}%</dd>
              <span className="rule" />
              <dt className="tot">You keep</dt>
              <dd className="tot">{usd(v.dealer.net)}</dd>
            </dl>
            <div className="cap">
              Paid in a day or two, no fees. Dealers are sharpest when a generation turns fast;{" "}
              {G.name} cars sell in a median {G.daysToSell} days.
            </div>
          </div>

          <div className="chan">
            <h3>List it yourself</h3>
            <div className="cap">Suggested asking price</div>
            <div className="big">{usd(v.privateSale.asking)}</div>
            <div className="cap">Expect to settle near {usd(v.privateSale.likelySale)}.</div>
            <dl>
              <dt>Likely sale price</dt>
              <dd>{usd(v.privateSale.likelySale)}</dd>
              <dt>Ads, detail, inspection</dt>
              <dd>−{usd(v.privateSale.cost)}</dd>
              <span className="rule" />
              <dt className="tot">You keep</dt>
              <dd className="tot">{usd(v.privateSale.net)}</dd>
            </dl>
            <div className="cap">
              Most money on paper, but plan on {v.privateSale.minDays} or more days, strangers at
              your house, and handling payment and title yourself.
            </div>
          </div>
        </div>

        <div className="adj">
          <div className="tw">
            <table>
              <caption style={{ textAlign: "left", padding: "0 0 6px" }}>
                <span className="lab">Closest comparable sales by mileage</span>
              </caption>
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="n">Miles</th>
                  <th className="n">Price</th>
                </tr>
              </thead>
              <tbody>
                {v.comps.map((c, i) => (
                  <tr key={i}>
                    <td>
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noopener noreferrer">
                          {c.year}
                          {c.packages?.includes("weissach") ? " Weissach" : ""}, {c.source}
                        </a>
                      ) : (
                        c.source
                      )}
                    </td>
                    <td className="n">{fmtMiles(c.miles)}</td>
                    <td className="n">
                      {usd(c.price)}
                      {c.rnm ? (
                        <>
                          {" "}
                          <span className="rnm">High bid, no sale</span>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            How this is built: a price-vs-mileage curve fit to {v.basis}
            {adjTxt ? `, then adjusted for ${adjTxt}` : ""}. Weissach, color, condition and history
            adjustments are starting assumptions until we have enough tagged sales to measure them.
            Auction fees are Bring a Trailer&apos;s current schedule (buyer pays 5%, capped at
            $7,500). {v.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
}
