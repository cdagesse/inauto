"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { type CarFilter, countActive } from "@/lib/listings/filters";
import { PLATFORM_KEYS, PLATFORMS } from "@/lib/sources/platforms";
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

/** Live/past, result, type and source: shown as page pills on desktop, inside the drawer on phones. */
type Scope = { when: string; result: string; type: string; source: string };

const THIS_YEAR = new Date().getFullYear();
/** Next model year down to 1930, newest first. Built once, not per render. */
const YEARS: number[] = [];
for (let y = THIS_YEAR + 1; y >= 1930; y--) YEARS.push(y);

function ScopePills({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onPick: (v: string) => void;
}) {
  return (
    <div className="scope-row" role="group" aria-label={label}>
      <span className="lab">{label}</span>
      <div className="seg">
        {options.map(([v, text]) => (
          <button
            key={v || "all"}
            type="button"
            aria-pressed={value === v}
            onClick={() => onPick(v)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  // Models fetched so far, keyed by make slug, so reopening or switching back is free.
  const [modelsBySlug, setModelsBySlug] = useState<Record<string, SellModel[]>>({});
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
  const [scope, setScope] = useState<Scope>(() => ({
    when: keep.when ?? "",
    result: keep.result ?? "",
    type: keep.type ?? "",
    source: keep.source ?? "",
  }));
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const active = countActive(current);
  const makeSlug = makes.find((m) => m.name.toLowerCase() === form.make.toLowerCase())?.slug;
  const models = (makeSlug && modelsBySlug[makeSlug]) || [];
  const loadingModels = !!makeSlug && !(makeSlug in modelsBySlug);

  // Models for the chosen make (catalog makes only; free text still works).
  // Only while the drawer is open: /listings?make=… must not cost a server
  // action on every load for a panel most visitors never open.
  const inflight = useRef(new Set<string>());
  useEffect(() => {
    if (!open || !makeSlug || makeSlug in modelsBySlug || inflight.current.has(makeSlug)) return;
    inflight.current.add(makeSlug);
    // A failed call (network, deploy skew) caches an empty list rather than
    // leaving the field on "Loading models…" for the session; free text still works.
    getSellModels({ makeSlug })
      .then(
        (r) => (r.ok ? r.data : []),
        () => [] as SellModel[],
      )
      .then((list) => setModelsBySlug((m) => ({ ...m, [makeSlug]: list })))
      .finally(() => inflight.current.delete(makeSlug));
  }, [open, makeSlug, modelsBySlug]);

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
  }

  function apply(next: Form, sc: Scope = scope) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v && !(k in sc)) p.set(k, v);
    if (sc.when === "past") p.set("when", "past");
    if (sc.when === "past" && sc.result) p.set("result", sc.result);
    if (sc.type) p.set("type", sc.type);
    if (sc.source) p.set("source", sc.source);
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
    const plain: Scope = { when: "", result: "", type: "", source: "" };
    setScope(plain);
    apply(empty, plain);
  }

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

          <div className="drawer-scope">
            <ScopePills
              label="Show"
              value={scope.when === "past" ? "past" : ""}
              options={[
                ["", "Live"],
                ["past", "Past"],
              ]}
              onPick={(v) => setScope((x) => ({ ...x, when: v, result: v ? x.result : "" }))}
            />
            {scope.when === "past" ? (
              <ScopePills
                label="Result"
                value={scope.result}
                options={[
                  ["", "All results"],
                  ["sold", "Sold"],
                  ["unsold", "Not sold"],
                ]}
                onPick={(v) => setScope((x) => ({ ...x, result: v }))}
              />
            ) : null}
            <ScopePills
              label="Type"
              value={scope.type}
              options={[
                ["", "All"],
                ["classified", "Classifieds"],
                ["auction", "Auctions"],
              ]}
              onPick={(v) => setScope((x) => ({ ...x, type: v }))}
            />
            <div className="fld">
              <label htmlFor="f-source">Source</label>
              <select
                id="f-source"
                value={scope.source}
                onChange={(e) => setScope((x) => ({ ...x, source: e.target.value }))}
              >
                <option value="">All sources</option>
                <option value="inauto">UrCar</option>
                {PLATFORM_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {PLATFORMS[k].name}
                  </option>
                ))}
              </select>
            </div>
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
                {YEARS.map((y) => (
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
                {YEARS.map((y) => (
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
