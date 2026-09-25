"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { mi, usd } from "@/components/account/money";
import type { PriceGuidance } from "@/lib/valuation/types";
import { createListing } from "@/server/listings";
import { getPriceGuidance } from "@/server/pricing";
import { PhotoUpload } from "./photo-upload";
import { verdictClass, verdictLabel } from "./verdict";

type Net = { id: string; name: string };
type Car = {
  make: string;
  model: string;
  year: string;
  trim: string;
  miles: string;
  vin: string;
  color: string;
  colorClass: "std" | "spec" | "pts";
  condition: "ex" | "good" | "fair";
  history: "clean" | "acc";
  weissach: boolean;
};
type Sale = {
  type: "classified" | "auction" | "private";
  networkId: string;
  auctionDays: 7 | 14;
  reserve: string;
  asking: string;
};

const STEPS = ["The car", "How to sell", "Price", "Listing"];

export function SellWizard({ networks }: { networks: Net[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [car, setCar] = useState<Car>({
    make: "Porsche",
    model: "911 GT3 RS",
    year: "2025",
    trim: "",
    miles: "",
    vin: "",
    color: "",
    colorClass: "std",
    condition: "ex",
    history: "clean",
    weissach: false,
  });
  const [sale, setSale] = useState<Sale>({
    type: "classified",
    networkId: networks[0]?.id ?? "",
    auctionDays: 7,
    reserve: "",
    asking: "",
  });
  const [listing, setListing] = useState({ title: "", description: "", location: "" });
  const [photos, setPhotos] = useState<string[]>([]);
  const [guidance, setGuidance] = useState<PriceGuidance | null>(null);
  const [guidanceState, setGuidanceState] = useState<"idle" | "loading" | "none" | "ready">("idle");
  const [marketHref, setMarketHref] = useState<string | null>(null);
  const [generation, setGeneration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const year = Number(car.year);
  const miles = Number(car.miles);
  const carValid =
    car.make.trim() &&
    car.model.trim() &&
    year >= 1900 &&
    year <= 2100 &&
    Number.isFinite(miles) &&
    car.miles !== "";
  const priceField = sale.type === "auction" ? sale.reserve : sale.asking;
  const price = Number(priceField);
  const weissachOffered = useMemo(
    () => /gt3 rs/i.test(car.model) && (year >= 2019 || year === 2019),
    [car.model, year],
  );

  // Debounced guidance whenever inputs that affect it change.
  useEffect(() => {
    if (step !== 2 || !carValid) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setGuidanceState("loading");
      getPriceGuidance({
        make: car.make,
        model: car.model,
        year,
        miles,
        packages: car.weissach ? ["weissach"] : [],
        colorClass: car.colorClass,
        condition: car.condition,
        history: car.history,
        askingPrice: Number.isFinite(price) && price > 0 ? Math.round(price) : 0,
      }).then((r) => {
        if (!r.ok) {
          setGuidanceState("none");
          return;
        }
        setMarketHref(r.data.marketHref);
        setGeneration(r.data.generation);
        if (!r.data.guidance) {
          setGuidance(null);
          setGuidanceState("none");
        } else {
          setGuidance(r.data.guidance);
          setGuidanceState("ready");
        }
      });
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [
    step,
    carValid,
    car.make,
    car.model,
    year,
    miles,
    car.weissach,
    car.colorClass,
    car.condition,
    car.history,
    price,
  ]);

  function submit(publish: boolean) {
    setError(null);
    start(async () => {
      const r = await createListing({
        type: sale.type,
        networkId: sale.type === "private" ? sale.networkId || null : null,
        make: car.make.trim(),
        model: car.model.trim(),
        year,
        trim: car.trim.trim() || null,
        vin: car.vin.trim().toUpperCase() || "",
        miles,
        color: car.color.trim() || null,
        colorClass: car.colorClass,
        condition: car.condition,
        history: car.history,
        packages: car.weissach ? ["weissach"] : [],
        title:
          listing.title.trim() ||
          `${year} ${car.make} ${car.model}${car.trim ? ` ${car.trim}` : ""}`,
        description: listing.description.trim() || null,
        photos,
        location: listing.location.trim() || null,
        askingPrice: sale.type === "auction" ? null : Math.round(Number(sale.asking)) || null,
        reservePrice: sale.type === "auction" ? Math.round(Number(sale.reserve)) || null : null,
        auctionDays: sale.type === "auction" ? sale.auctionDays : undefined,
        priceGuidance: guidance ?? undefined,
        publish,
      });
      if (!r.ok) return setError(r.error);
      router.push(`/listings/${r.data.id}`);
    });
  }

  const seg = <K extends keyof Car>(k: K, opts: [Car[K] & string, string][]) => (
    <div className="seg" role="group">
      {opts.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={car[k] === v}
          onClick={() => setCar({ ...car, [k]: v })}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="wizard">
      <ol className="steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={i < step ? "done" : ""}
          >
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}>
              <span className="mono">{i + 1}</span> {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="form">
          <div className="grid-3">
            <div className="fld">
              <label htmlFor="s-make">Make</label>
              <input
                id="s-make"
                value={car.make}
                onChange={(e) => setCar({ ...car, make: e.target.value })}
                maxLength={60}
                required
              />
            </div>
            <div className="fld">
              <label htmlFor="s-model">Model</label>
              <input
                id="s-model"
                value={car.model}
                onChange={(e) => setCar({ ...car, model: e.target.value })}
                maxLength={80}
                required
              />
            </div>
            <div className="fld">
              <label htmlFor="s-year">Model year</label>
              <input
                id="s-year"
                type="number"
                min={1900}
                max={2100}
                value={car.year}
                onChange={(e) => setCar({ ...car, year: e.target.value })}
                required
              />
            </div>
            <div className="fld">
              <label htmlFor="s-trim">Trim</label>
              <input
                id="s-trim"
                value={car.trim}
                onChange={(e) => setCar({ ...car, trim: e.target.value })}
                maxLength={80}
              />
            </div>
            <div className="fld">
              <label htmlFor="s-miles">Mileage</label>
              <input
                id="s-miles"
                type="number"
                min={0}
                step={100}
                inputMode="numeric"
                value={car.miles}
                onChange={(e) => setCar({ ...car, miles: e.target.value })}
                required
              />
            </div>
            <div className="fld">
              <label htmlFor="s-vin">VIN (optional, shown in full only after title vetting)</label>
              <input
                id="s-vin"
                className="mono"
                value={car.vin}
                onChange={(e) => setCar({ ...car, vin: e.target.value })}
                maxLength={17}
                autoComplete="off"
              />
            </div>
            <div className="fld">
              <label htmlFor="s-color">Exterior color</label>
              <input
                id="s-color"
                value={car.color}
                onChange={(e) => setCar({ ...car, color: e.target.value })}
                maxLength={60}
              />
            </div>
          </div>
          <div className="fld">
            <span className="lab">Color class</span>
            {seg("colorClass", [
              ["std", "Standard"],
              ["spec", "Special color"],
              ["pts", "Paint to Sample"],
            ])}
            <span className="hint">
              Special: Shark Blue, Lizard Green, Python Green, Voodoo Blue and similar.
            </span>
          </div>
          <div className="fld">
            <span className="lab">Condition</span>
            {seg("condition", [
              ["ex", "Excellent"],
              ["good", "Good"],
              ["fair", "Needs work"],
            ])}
          </div>
          <div className="fld">
            <span className="lab">History report</span>
            {seg("history", [
              ["clean", "Clean"],
              ["acc", "Accident reported"],
            ])}
          </div>
          {weissachOffered ? (
            <label className="check">
              <input
                type="checkbox"
                checked={car.weissach}
                onChange={(e) => setCar({ ...car, weissach: e.target.checked })}
              />{" "}
              Weissach package
            </label>
          ) : null}
          <div>
            <button
              type="button"
              className="btn primary"
              disabled={!carValid}
              onClick={() => setStep(1)}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="form">
          <div className="lab">How do you want to sell?</div>
          <div className="choice-grid">
            {(
              [
                ["classified", "Classified", "Set a price, field offers, close on your terms."],
                ["auction", "Online auction", "7 or 14 days of bidding with an optional reserve."],
                [
                  "private",
                  "Private network",
                  "Only members of a network you belong to can see it.",
                ],
              ] as const
            ).map(([v, title, blurb]) => (
              <button
                key={v}
                type="button"
                className={`choice ${sale.type === v ? "on" : ""}`}
                aria-pressed={sale.type === v}
                onClick={() => setSale({ ...sale, type: v })}
              >
                <b className="display">{title}</b>
                <span className="hint">{blurb}</span>
              </button>
            ))}
          </div>
          {sale.type === "auction" ? (
            <div className="fld">
              <span className="lab">Auction length</span>
              <div className="seg" role="group">
                {([7, 14] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={sale.auctionDays === d}
                    onClick={() => setSale({ ...sale, auctionDays: d })}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {sale.type === "private" ? (
            networks.length === 0 ? (
              <p className="err">
                You are not in any private network yet. Create one on the Networks page first.
              </p>
            ) : (
              <div className="fld">
                <label htmlFor="s-net">Network</label>
                <select
                  id="s-net"
                  value={sale.networkId}
                  onChange={(e) => setSale({ ...sale, networkId: e.target.value })}
                >
                  {networks.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
            )
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={() => setStep(0)}>
              Back
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={sale.type === "private" && !sale.networkId}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="val">
          <div className="form">
            <div className="fld">
              <label htmlFor="s-price">
                {sale.type === "auction"
                  ? "Reserve price (leave blank for no reserve)"
                  : "Asking price"}
              </label>
              <input
                id="s-price"
                type="number"
                min={0}
                step={500}
                inputMode="numeric"
                value={priceField}
                onChange={(e) =>
                  setSale(
                    sale.type === "auction"
                      ? { ...sale, reserve: e.target.value }
                      : { ...sale, asking: e.target.value },
                  )
                }
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={sale.type !== "auction" && !(price > 0)}
                onClick={() => setStep(3)}
              >
                Continue
              </button>
            </div>
          </div>
          <div>
            {guidanceState === "none" || (guidanceState === "idle" && !carValid) ? (
              <div className="panel">
                <div className="lab">Pricing guidance</div>
                <p className="sub" style={{ marginTop: 6 }}>
                  We do not have a market report for the {car.make} {car.model} yet, so we cannot
                  check this price. Reports are added as data comes online.
                </p>
              </div>
            ) : guidance ? (
              <GuidancePanel
                g={guidance}
                marketHref={marketHref}
                generation={generation}
                isReserve={sale.type === "auction"}
                loading={guidanceState === "loading"}
              />
            ) : (
              <div className="panel">
                <div className="lab">Pricing guidance</div>
                <p className="note">Checking the market…</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="form">
          <div className="fld">
            <label htmlFor="s-title">Listing title</label>
            <input
              id="s-title"
              value={listing.title}
              onChange={(e) => setListing({ ...listing, title: e.target.value })}
              maxLength={120}
              placeholder={`${car.year} ${car.make} ${car.model}${car.trim ? ` ${car.trim}` : ""}`}
            />
          </div>
          <div className="fld">
            <label htmlFor="s-desc">Description</label>
            <textarea
              id="s-desc"
              rows={6}
              maxLength={8000}
              value={listing.description}
              onChange={(e) => setListing({ ...listing, description: e.target.value })}
              placeholder="Ownership history, service, options, known issues. Buyers reward candor."
            />
          </div>
          <div className="fld">
            <span className="lab">Photos</span>
            <PhotoUpload value={photos} onChange={setPhotos} />
          </div>
          <div className="fld">
            <label htmlFor="s-loc">Location</label>
            <input
              id="s-loc"
              value={listing.location}
              onChange={(e) => setListing({ ...listing, location: e.target.value })}
              maxLength={100}
              placeholder="Boston, MA"
            />
          </div>
          {error ? <p className="err">{error}</p> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => submit(false)}>
              Save draft
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={pending}
              onClick={() => submit(true)}
            >
              {pending ? "Publishing…" : "Publish listing"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GuidancePanel({
  g,
  marketHref,
  generation,
  isReserve,
  loading,
}: {
  g: PriceGuidance;
  marketHref: string | null;
  generation: string | null;
  isReserve: boolean;
  loading: boolean;
}) {
  const lo = Math.min(g.range.lo, g.askingPrice || g.range.lo) * 0.9;
  const hi = Math.max(g.range.hi, g.askingPrice || g.range.hi) * 1.1;
  const pct = (v: number) =>
    `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)).toFixed(1)}%`;
  const hasAsk = g.askingPrice > 0;
  return (
    <div className="panel" style={{ opacity: loading ? 0.6 : 1 }}>
      <div className="lab">
        Pricing guidance{generation ? ` · ${generation}` : ""}
        {g.thin ? (
          <span className="pill" style={{ marginLeft: 6 }}>
            Thin sample
          </span>
        ) : null}
      </div>
      <div className="display num" style={{ fontSize: 34, marginTop: 4 }}>
        {usd(g.marketValue)}
      </div>
      <div className="hint">
        Market value at these miles and spec. Typical range {usd(g.range.lo)} to {usd(g.range.hi)}.
      </div>
      <div className="meter" aria-hidden="true">
        <div
          className="band"
          style={{ left: pct(g.range.lo), width: `calc(${pct(g.range.hi)} - ${pct(g.range.lo)})` }}
        />
        <div className="mark mv" style={{ left: pct(g.marketValue) }} title="Market value" />
        {hasAsk ? (
          <div
            className={`mark ask ${verdictClass(g.verdict)}`}
            style={{ left: pct(g.askingPrice) }}
            title="Your price"
          />
        ) : null}
      </div>
      {hasAsk ? (
        <div className="verdict">
          <span className={`pill ${verdictClass(g.verdict)}`}>{verdictLabel(g.verdict)}</span>{" "}
          <span className="num">
            {g.deltaPct >= 0 ? "+" : ""}
            {(g.deltaPct * 100).toFixed(1)}% vs market
          </span>
          <p className="sub" style={{ marginTop: 6 }}>
            {g.message}
          </p>
        </div>
      ) : (
        <p className="sub" style={{ marginTop: 10 }}>
          {isReserve
            ? "Enter a reserve to see whether it is realistic. "
            : "Enter a price to see how it compares. "}
          We suggest asking about {usd(g.suggestedAsking)}.
        </p>
      )}
      <dl className="kv">
        <dt>Dealers asking now</dt>
        <dd className="num">{usd(g.dealerAskingMedian)}</dd>
        <dt>Recent auction median</dt>
        <dd className="num">{g.auctionMedian ? usd(g.auctionMedian) : "too few sales"}</dd>
        <dt>Suggested asking</dt>
        <dd className="num">{usd(g.suggestedAsking)}</dd>
      </dl>
      {g.comps.length ? (
        <div className="tw" style={{ marginTop: 10 }}>
          <table>
            <caption className="lab" style={{ textAlign: "left", padding: "0 0 6px" }}>
              Closest comparable sales
            </caption>
            <thead>
              <tr>
                <th>Source</th>
                <th className="n">Miles</th>
                <th className="n">Price</th>
              </tr>
            </thead>
            <tbody>
              {g.comps.map((c, i) => (
                <tr key={i}>
                  <td>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer">
                        {c.year ? `${c.year}, ` : ""}
                        {c.source}
                      </a>
                    ) : (
                      c.source
                    )}
                  </td>
                  <td className="n">{mi(c.miles)}</td>
                  <td className="n">
                    {usd(c.price)}
                    {c.rnm ? <span className="rnm"> High bid, no sale</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="hint" style={{ marginTop: 8 }}>
        {marketHref ? (
          <>
            See the full <a href={marketHref}>market report</a>.{" "}
          </>
        ) : null}
        This is an estimate, not an offer.
      </p>
    </div>
  );
}
