"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { BrandLogo } from "@/components/site/brand-logo";
import type { SellMake, SellModel } from "@/server/queries/sell-catalog";
import { getSellModels } from "@/server/sell-catalog";
import { sellHref, trimsFor, yearsFor } from "@/lib/sell/picker-lib";

export function SellPicker({ makes }: { makes: SellMake[] }) {
  const router = useRouter();
  const [makeSlug, setMakeSlug] = useState("");
  const [models, setModels] = useState<SellModel[]>([]);
  const [modelSlug, setModelSlug] = useState("");
  const [year, setYear] = useState("");
  const [gen, setGen] = useState("");
  const [trim, setTrim] = useState("");
  const [miles, setMiles] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const make = makes.find((m) => m.slug === makeSlug) ?? null;
  const model = models.find((m) => m.slug === modelSlug) ?? null;
  const years = useMemo(() => yearsFor(model), [model]);
  const yearNum = year ? Number(year) : null;
  const trims = useMemo(() => trimsFor(model, yearNum), [model, yearNum]);
  const hasGens = (model?.generations.length ?? 0) > 0;
  // A single matching generation is selected automatically; a stale choice is dropped.
  const effectiveGen = trims.some((t) => t.code === gen)
    ? gen
    : trims.length === 1
      ? trims[0]!.code
      : "";

  // Load the make's models when the make changes (state updates happen in the callback).
  useEffect(() => {
    if (!makeSlug) return;
    let cancelled = false;
    getSellModels({ makeSlug }).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        setError(r.error);
        setModels([]);
        return;
      }
      setModels(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [makeSlug]);

  function changeMake(slug: string) {
    setMakeSlug(slug);
    setModels([]);
    setModelSlug("");
    setYear("");
    setGen("");
    setError(null);
    setLoading(!!slug);
  }
  function changeModel(slug: string) {
    setModelSlug(slug);
    setYear("");
    setGen("");
  }
  function changeYear(y: string) {
    setYear(y);
    setGen("");
  }

  const milesNum = miles === "" ? null : Math.max(0, Math.round(Number(miles)));
  const valid = !!make && !!model && !!yearNum && milesNum != null && Number.isFinite(milesNum);

  function go() {
    if (!make || !model || !valid) return;
    start(() => {
      router.push(
        sellHref({
          makeSlug: make.slug,
          modelSlug: model.slug,
          year: yearNum,
          gen: effectiveGen || null,
          trim: hasGens ? null : trim.trim() || null,
          miles: milesNum,
        }),
      );
    });
  }

  return (
    <form
      className="panel sell-picker"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <div className="picker-head">
        {make ? (
          <BrandLogo make={make.slug} px={44} />
        ) : (
          <span
            className="brand-logo mono-tile"
            style={{ width: 44, height: 44 }}
            aria-hidden="true"
          >
            ?
          </span>
        )}
        <div>
          <div className="lab">Your car</div>
          <b className="display" style={{ fontSize: 18 }}>
            {make ? make.name : "Pick a make to start"}
            {model ? ` ${model.name}` : ""}
            {yearNum ? ` · ${yearNum}` : ""}
          </b>
        </div>
      </div>
      <div className="grid-3">
        <div className="fld">
          <label htmlFor="p-make">Make</label>
          <select id="p-make" value={makeSlug} onChange={(e) => changeMake(e.target.value)}>
            <option value="">Choose a make</option>
            {makes.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="p-model">Model</label>
          <select
            id="p-model"
            value={modelSlug}
            onChange={(e) => changeModel(e.target.value)}
            disabled={!makeSlug || loading}
          >
            <option value="">{loading ? "Loading models…" : "Choose a model"}</option>
            {models.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
                {m.ready ? "" : " (report on request)"}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="p-year">Model year</label>
          <select
            id="p-year"
            value={year}
            onChange={(e) => changeYear(e.target.value)}
            disabled={!model}
          >
            <option value="">Choose a year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          {hasGens ? (
            <>
              <label htmlFor="p-gen">Trim or generation</label>
              <select
                id="p-gen"
                value={effectiveGen}
                onChange={(e) => setGen(e.target.value)}
                disabled={!model}
              >
                <option value="">{trims.length ? "Choose a trim" : "n/a"}</option>
                {trims.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name} ({t.yearStart}–{t.yearEnd})
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label htmlFor="p-trim">Trim (optional)</label>
              <input
                id="p-trim"
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
                maxLength={80}
                placeholder="e.g. Competition, Weissach"
                disabled={!model}
              />
            </>
          )}
        </div>
        <div className="fld">
          <label htmlFor="p-miles">Mileage</label>
          <input
            id="p-miles"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={miles}
            onChange={(e) => setMiles(e.target.value)}
            placeholder="e.g. 12,000"
            required
            disabled={!model}
          />
        </div>
        <div className="fld" style={{ justifyContent: "end" }}>
          <button type="submit" className="btn primary" disabled={!valid || pending}>
            {pending ? "Loading…" : "See what it's worth"}
          </button>
        </div>
      </div>
      {error ? <p className="err">{error}</p> : null}
      <p className="hint" style={{ margin: 0 }}>
        Free, no account needed. You get a market value, what you would net at auction, from a
        dealer, or selling it yourself, and a one-click path to list it on InAuto.
      </p>
    </form>
  );
}
