"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * The Buy page search box. As you type, the page reloads with `q` in the query string
 * (debounced), keeping every other filter; results come best match first. Enter applies
 * at once. Matching is typo-tolerant on the server, so "porshe gt3" still finds a GT3.
 */
export function BuySearch({
  initial,
  params,
}: {
  initial: string;
  /** Every other query param to carry along (cursor params already dropped). */
  params: Record<string, string>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  /** The query this box last sent to the URL. */
  const [applied, setApplied] = useState(initial);
  // A navigation that changed q elsewhere (a chip, Clear all) updates the box; one this
  // box caused leaves it alone, so typing is never interrupted. Derived during render,
  // as React recommends, rather than in an effect.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    if (initial.trim() !== applied.trim()) {
      setApplied(initial);
      setValue(initial);
    }
  }

  // The debounce timer fires after later renders; it reads the newest params and applied
  // query through refs (written in effects, never during render) so a navigation that
  // landed meanwhile is carried along rather than overwritten.
  const latest = useRef({ params, applied });
  useEffect(() => {
    latest.current = { params, applied };
  }, [params, applied]);
  // A query changed elsewhere cancels a pending debounce for the old text.
  useEffect(() => {
    if (initial.trim() !== latest.current.applied.trim() && timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, [initial]);

  const href = (q: string) => {
    const p = new URLSearchParams(latest.current.params);
    const trimmed = q.trim();
    if (trimmed) p.set("q", trimmed);
    else p.delete("q");
    const s = p.toString();
    return s ? `/listings?${s}` : "/listings";
  };
  const go = (q: string) => {
    if (q.trim() === latest.current.applied.trim()) return;
    latest.current = { ...latest.current, applied: q };
    setApplied(q);
    start(() => router.replace(href(q), { scroll: false }));
  };
  const onChange = (q: string) => {
    setValue(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go(q), 350);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <form
      className="buy-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go(value);
      }}
    >
      <label className="sr-only" htmlFor="buy-q">
        Search cars
      </label>
      <input
        id="buy-q"
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by year, make, model, trim or keyword"
        maxLength={80}
        autoComplete="off"
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            setValue("");
            if (timer.current) clearTimeout(timer.current);
            go("");
            input.current?.focus();
          }}
          aria-label="Clear search"
        >
          Clear
        </button>
      ) : null}
      <span className="hint" aria-live="polite">
        {pending ? "Searching…" : ""}
      </span>
      <span className="hint">Typos are fine.</span>
    </form>
  );
}
