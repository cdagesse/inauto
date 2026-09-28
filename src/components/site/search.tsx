"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

interface MakeHit {
  name: string;
  slug: string;
}
interface ModelHit {
  make: string;
  makeSlug: string;
  model: string;
  modelSlug: string;
  ready: boolean;
}
/** A suggestion row. `group` decides the section; `href` is where it goes. */
interface Hit {
  group: "listings" | "market";
  key: string;
  href: string;
  main: string;
  small: string;
  detail: string;
}

/** Turns catalog matches into two sections: cars for sale, then market reports. */
export function buildHits(term: string, data: { makes: MakeHit[]; models: ModelHit[] }): Hit[] {
  // Once the user has typed past the make (e.g. "BMW M"), makes stop being useful.
  const bare = !/\s\S/.test(term.trim());
  const makes = bare ? data.makes : [];
  const listings: Hit[] = [
    ...makes.map((m) => ({
      group: "listings" as const,
      key: `l-make-${m.slug}`,
      href: `/listings?make=${encodeURIComponent(m.name)}`,
      main: m.name,
      small: "",
      detail: "All cars for sale",
    })),
    ...data.models.map((m) => ({
      group: "listings" as const,
      key: `l-model-${m.makeSlug}/${m.modelSlug}`,
      href: `/listings?make=${encodeURIComponent(m.make)}&model=${encodeURIComponent(m.model)}`,
      main: m.model,
      small: m.make,
      detail: "Cars for sale",
    })),
  ];
  const market: Hit[] = [
    ...makes.map((m) => ({
      group: "market" as const,
      key: `m-make-${m.slug}`,
      href: `/markets?q=${encodeURIComponent(m.name)}`,
      main: m.name,
      small: "",
      detail: "All reports",
    })),
    ...data.models.map((m) => ({
      group: "market" as const,
      key: `m-model-${m.makeSlug}/${m.modelSlug}`,
      href: `/${m.makeSlug}/${m.modelSlug}`,
      main: m.model,
      small: m.make,
      detail: m.ready ? "Market report" : "Build report",
    })),
  ];
  return [...listings.slice(0, 5), ...market.slice(0, 5)];
}

/** Where a bare Enter goes: a make match → its listings; else the first suggestion; else the market search. */
export function defaultHref(term: string, data: { makes: MakeHit[]; models: ModelHit[] }): string {
  const t = term.trim().toLowerCase();
  const make = data.makes.find((m) => m.name.toLowerCase() === t);
  if (make) return `/listings?make=${encodeURIComponent(make.name)}`;
  const first = buildHits(term, data)[0];
  return first ? first.href : `/markets?q=${encodeURIComponent(term.trim())}`;
}

/**
 * Typeahead over the make/model catalog in two sections: cars for sale (the
 * default) and market reports. "BMW" + Enter goes to BMW listings; "BMW M3"
 * offers M3 listings and the M3 market report.
 */
export function SearchBox({
  size = "compact",
  placeholder = "Search a make or model",
  autoFocus,
}: {
  size?: "compact" | "hero";
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [data, setData] = useState<{ makes: MakeHit[]; models: ModelHit[] }>({
    makes: [],
    models: [],
  });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (value: string) => {
    abortRef.current?.abort();
    const term = value.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(String(res.status));
      const payload = (await res.json()) as { makes: MakeHit[]; models: ModelHit[] };
      const next = buildHits(term, payload);
      setData(payload);
      setHits(next);
      setActive(next.length ? 0 : -1);
      setOpen(true);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setHits([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(q), 150);
    return () => clearTimeout(t);
  }, [q, search]);

  function choose(hit: Hit) {
    setOpen(false);
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) {
      if (e.key === "Enter" && q.trim().length >= 2) {
        e.preventDefault();
        router.push(defaultHref(q, data));
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      // With nothing highlighted, a bare make goes straight to its listings.
      if (active < 0) router.push(defaultHref(q, data));
      else {
        const hit = hits[active] ?? hits[0];
        if (hit) choose(hit);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const listId = `${id}-list`;
  return (
    <div
      className={`sbox ${size}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Search makes and models"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {loading && <span className="sbox-spin" aria-hidden="true" />}
      {open && hits.length > 0 && (
        <ul id={listId} role="listbox" className="sbox-list">
          {hits.map((h, i) => {
            const prevGroup = i > 0 ? hits[i - 1]!.group : null;
            return (
              <li key={h.key}>
                {prevGroup !== h.group && (
                  <div className="sbox-group" aria-hidden="true">
                    {h.group === "listings" ? "Cars for sale" : "Markets"}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  id={`${id}-opt-${i}`}
                  aria-selected={i === active}
                  className={`sbox-opt${i === active ? " on" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(h)}
                >
                  <span>
                    {h.small ? <small>{h.small} </small> : null}
                    <b>{h.main}</b>
                  </span>
                  <small>{h.detail}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
