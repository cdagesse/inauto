"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { type CarFilter, countActive } from "@/lib/listings/filters";
import type { SellMake, SellModel } from "@/server/queries/sell-catalog";
import { getSellModels } from "@/server/sell-catalog";

type Form = {
  make: string;
  model: string;
  trim: string;
  yearMin: string;
  yearMax: string;
  priceMin: string;
  priceMax: string;
  milesMin: string;
  milesMax: string;
};

const THIS_YEAR = new Date().getFullYear();
const s = (v: string | number | undefined | null) => (v == null ? "" : String(v));

/**
 * The Buy page filter drawer. The Filter button opens a side panel with
 * year, make, model, trim, price and mileage; Apply navigates to /listings
 * with those values in the query string, keeping the other chips (live/past,
 * type, source) that the page already has.
 */
export function FilterDrawer({
  makes,
  current,
  keep,
}: {
  makes: SellMake[];
  current: CarFilter;
  /** Query params to carry along untouched (when, result, type, source). */
  keep: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [models, setModels] = useState<SellModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [form, setForm] = useState<Form>(() => ({
    make: s(current.make),
    model: s(current.model),
    trim: s(current.trim),
    yearMin: s(current.yearMin),
    yearMax: s(current.yearMax),
    priceMin: s(current.priceMin),
    priceMax: s(current.priceMax),
    milesMin: s(current.milesMin),
    milesMax: s(current.milesMax),
  }));
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const active = countActive(current);
  const makeSlug = makes.find((m) => m.name.toLowerCase() === form.make.toLowerCase())?.slug;

  // Models for the chosen make (catalog makes only; free text still works).
  useEffect(() => {
    if (!makeSlug) return;
    let cancelled = false;
    getSellModels({ makeSlug }).then((r) => {
      if (cancelled) return;
      setLoadingModels(false);
      setModels(r.ok ? r.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [makeSlug]);

  // Escape closes; focus moves into the panel when it opens.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>("select, input")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function set<K extends keyof Form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function changeMake(v: string) {
    setForm((f) => ({ ...f, make: v, model: "" }));
    setModels([]);
    setLoadingModels(!!makes.find((m) => m.name.toLowerCase() === v.toLowerCase()));
  }

  function apply(next: Form) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
    for (const [k, v] of Object.entries(next)) if (v.trim()) p.set(k, v.trim());
    const qs = p.toString();
    start(() => {
      router.push(qs ? `/listings?${qs}` : "/listings");
      setOpen(false);
    });
  }
  function clear() {
    const empty: Form = {
      make: "",
      model: "",
      trim: "",
      yearMin: "",
      yearMax: "",
      priceMin: "",
      priceMax: "",
      milesMin: "",
      milesMax: "",
    };
    setForm(empty);
    apply(empty);
  }

  const years: number[] = [];
  for (let y = THIS_YEAR + 1; y >= 1930; y--) years.push(y);

  return (
    <>
      <button
        type="button"
        className={`btn${active ? " primary" : ""}`}
        aria-expanded={open}
        aria-controls="filter-drawer"
        onClick={() => setOpen(true)}
      >
        Filter{active ? <span className="count-badge">{active}</span> : null}
      </button>
      {open ? (
        <div className="drawer-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      ) : null}
      <aside
        id="filter-drawer"
        ref={panel}
        className={`drawer${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={!open}
      >
        <form
          className="drawer-form"
          onSubmit={(e) => {
            e.preventDefault();
            apply(form);
          }}
        >
          <div className="drawer-head">
            <div>
              <div className="eyebrow">Filter cars</div>
              <h2 id={titleId} className="sec" style={{ margin: "4px 0 0" }}>
                Narrow it down
              </h2>
            </div>
            <button
              type="button"
              className="btn sm"
              onClick={() => setOpen(false)}
              aria-label="Close filters"
            >
              Close
            </button>
          </div>

          <div className="fld">
            <label htmlFor="f-make">Make</label>
            <input
              id="f-make"
              list="f-make-list"
              value={form.make}
              onChange={(e) => changeMake(e.target.value)}
              placeholder="Any make"
              maxLength={60}
              autoComplete="off"
            />
            <datalist id="f-make-list">
              {makes.map((m) => (
                <option key={m.slug} value={m.name} />
              ))}
            </datalist>
          </div>
          <div className="fld">
            <label htmlFor="f-model">Model</label>
            <input
              id="f-model"
              list="f-model-list"
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder={loadingModels ? "Loading models…" : "Any model"}
              maxLength={80}
              autoComplete="off"
            />
            <datalist id="f-model-list">
              {models.map((m) => (
                <option key={m.slug} value={m.name} />
              ))}
            </datalist>
          </div>
          <div className="fld">
            <label htmlFor="f-trim">Trim</label>
            <input
              id="f-trim"
              value={form.trim}
              onChange={(e) => set("trim", e.target.value)}
              placeholder="e.g. GT3, Competition, Weissach"
              maxLength={80}
            />
            <span className="hint">Matches the trim or the listing title.</span>
          </div>

          <div className="fld">
            <span className="lab">Model year</span>
            <div className="range">
              <select
                aria-label="Year from"
                value={form.yearMin}
                onChange={(e) => set("yearMin", e.target.value)}
              >
                <option value="">From</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span className="range-sep">to</span>
              <select
                aria-label="Year to"
                value={form.yearMax}
                onChange={(e) => set("yearMax", e.target.value)}
              >
                <option value="">To</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="fld">
            <span className="lab">Price</span>
            <div className="range">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                aria-label="Minimum price"
                placeholder="Min $"
                value={form.priceMin}
                onChange={(e) => set("priceMin", e.target.value)}
              />
              <span className="range-sep">to</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                aria-label="Maximum price"
                placeholder="Max $"
                value={form.priceMax}
                onChange={(e) => set("priceMax", e.target.value)}
              />
            </div>
            <span className="hint">Asking price, or the current bid on auctions.</span>
          </div>
          <div className="fld">
            <span className="lab">Mileage</span>
            <div className="range">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                aria-label="Minimum miles"
                placeholder="Min mi"
                value={form.milesMin}
                onChange={(e) => set("milesMin", e.target.value)}
              />
              <span className="range-sep">to</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                aria-label="Maximum miles"
                placeholder="Max mi"
                value={form.milesMax}
                onChange={(e) => set("milesMax", e.target.value)}
              />
            </div>
          </div>

          <div className="drawer-actions">
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? "Applying…" : "Show cars"}
            </button>
            <button type="button" className="btn" onClick={clear} disabled={pending}>
              Clear all
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
