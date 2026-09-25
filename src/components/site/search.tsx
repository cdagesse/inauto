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
type Hit = { kind: "make"; make: MakeHit } | { kind: "model"; model: ModelHit };

/**
 * Typeahead over the make/model catalog. Typing "Mercedes" suggests the makes;
 * picking one fills the box with "Mercedes-AMG " so the user can continue with
 * "S63"; picking a model navigates to its market report (built on demand).
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
      const data = (await res.json()) as { makes: MakeHit[]; models: ModelHit[] };
      // Once the user has typed past the make (e.g. "Mercedes-AMG S6"), makes stop being useful.
      const showMakes = !/\s\S/.test(term);
      const next: Hit[] = [
        ...(showMakes ? data.makes.map((m) => ({ kind: "make", make: m }) as Hit) : []),
        ...data.models.map((m) => ({ kind: "model", model: m }) as Hit),
      ];
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
    if (hit.kind === "make") {
      setQ(`${hit.make.name} `);
      setOpen(true);
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
    router.push(`/${hit.model.makeSlug}/${hit.model.modelSlug}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) {
      if (e.key === "Enter" && q.trim().length >= 2) {
        e.preventDefault();
        router.push(`/markets?q=${encodeURIComponent(q.trim())}`);
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
      const hit = hits[active] ?? hits[0];
      if (hit) choose(hit);
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
            const isMake = h.kind === "make";
            const prevKind = i > 0 ? hits[i - 1]!.kind : null;
            return (
              <li key={isMake ? `m-${h.make.slug}` : `x-${h.model.makeSlug}/${h.model.modelSlug}`}>
                {prevKind !== h.kind && (
                  <div className="sbox-group" aria-hidden="true">
                    {isMake ? "Makes" : "Models"}
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
                  {isMake ? (
                    <>
                      <b>{h.make.name}</b>
                      <small>All models</small>
                    </>
                  ) : (
                    <>
                      <span>
                        <small>{h.model.make}</small> <b>{h.model.model}</b>
                      </span>
                      <small>{h.model.ready ? "Market report" : "Build report"}</small>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
