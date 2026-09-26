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

export interface ValuationInitial {
  generation?: string;
  year?: number;
  miles?: number;
}

/** Builds the /sell/list link that carries the car into the listing wizard. */
export function listHrefFor(
  snapshot: MarketSnapshot,
  inputs: { year: number; miles: number; generation: string; packages: string[] },
  extra: Record<string, string | undefined> = {},
) {
  const p = new URLSearchParams();
  p.set("make", snapshot.make.name);
  p.set("model", snapshot.model.name);
  p.set("year", String(inputs.year));
  p.set("miles", String(inputs.miles));
  const gen = snapshot.generations[inputs.generation];
  if (gen && snapshot.order.length > 1) p.set("trim", gen.name);
  if (inputs.packages.includes("weissach")) p.set("weissach", "1");
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return `/sell/list?${p.toString()}`;
}

export function ValuationTool({
  snapshot,
  initial,
  mode = "market",
}: {
  snapshot: MarketSnapshot;
  /** Pre-selected generation, year and mileage (from the sell picker). */
  initial?: ValuationInitial;
  /** "sell" adds a list-with-InAuto call to action to every channel. */
  mode?: "market" | "sell";
}) {
  const initialGen =
    initial?.generation && snapshot.order.includes(initial.generation)
      ? initial.generation
      : snapshot.order[0];
  const [gen, selectGen] = useGeneration(
    mode === "sell" ? `sell:${snapshot.model.slug}` : snapshot.model.slug,
    snapshot.order,
    initialGen,
  );
  const G = snapshot.generations[gen];
  const years = snapshot.years[gen] ?? [];
  const offersWeissach = G.packages.includes("weissach");

  const [form, setForm] = useState<FormState>(() => ({
    year: initial?.year && years.includes(initial.year) ? initial.year : years[0],
    miles: String(
      initial?.miles != null && initial.miles >= 0
        ? Math.round(initial.miles)
        : Math.round(G.medianMiles / 100) * 100,
    ),
    weissach: false,
    colorClass: "std",
    condition: "ex",
    history: "clean",
  }));

  // In sell mode the picker's choice wins over whatever this browser stored last time.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || mode !== "sell") return;
    seeded.current = true;
    if (initialGen !== gen) selectGen(initialGen);
  }, [mode, initialGen, gen, selectGen]);

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
  const sell = mode === "sell";
  const listHref = listHrefFor(snapshot, inputs, {
    colorClass: form.colorClass,
    condition: form.condition,
    history: form.history,
  });

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
            {sell ? (
              <a className="btn sm chan-cta" href={`${listHref}&type=auction`}>
                Run the auction on InAuto
              </a>
            ) : null}
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
            {sell ? (
              <a className="btn sm chan-cta" href={`${listHref}&type=classified`}>
                List it and let dealers bid
              </a>
            ) : null}
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
            {sell ? (
              <a className="btn sm primary chan-cta" href={`${listHref}&type=classified`}>
                List it on InAuto
              </a>
            ) : null}
          </div>
        </div>

        {sell ? (
          <div className="rec sell-pitch">
            <b>Whichever path you pick, list it on InAuto first.</b>
            <p>
              Listing is free. Your {short} is priced against the {v.basis} on this page, so buyers
              trust the number, and every buyer can order title vetting and an inspection before
              they commit. Run it as a classified or a 7 or 14 day auction, and keep the{" "}
              {usd(v.auction.listingFee)} platform fee.
            </p>
            <div className="pitch-ctas">
              <a className="btn primary" href={listHref}>
                List my {form.year} {short}
              </a>
              <a className="btn" href={`/${snapshot.make.slug}/${snapshot.model.slug}`}>
                Full {short} market report
              </a>
            </div>
          </div>
        ) : null}

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
