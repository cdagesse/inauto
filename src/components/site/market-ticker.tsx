"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fmtChange, type TickerItem } from "@/lib/market/ticker";

/** Pages where the strip would only get in the way. */
const HIDDEN = ["/admin", "/signin", "/signup", "/invite"];
/** Refetch cadence in a long session; the route itself refreshes with the live sweep. */
const REFRESH_MS = 15 * 60 * 1000;

/**
 * A scrolling strip of market news under the site header: the UrCar index, segment medians,
 * the biggest 90-day movers and the latest sold auctions. Fetched after mount from a cached
 * route so the layout stays static, and again every 15 minutes or when the tab comes back.
 * Pauses on hover; while a link has keyboard focus it stands still and scrolls like a normal
 * strip so every item can be reached; stands still for reduced motion.
 */
export function MarketTicker() {
  const pathname = usePathname();
  const hidden = HIDDEN.some((p) => pathname?.startsWith(p));
  // null: not loaded yet (reserve the row); []: nothing to show (render nothing).
  const [items, setItems] = useState<TickerItem[] | null>(null);
  useEffect(() => {
    if (hidden) return;
    let alive = true;
    const load = () =>
      fetch("/api/ticker")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { items?: TickerItem[] } | null) => {
          if (alive) setItems(d?.items ?? []);
        })
        .catch(() => {
          if (alive) setItems((cur) => cur ?? []);
        });
    load();
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hidden]);
  if (hidden) return null;
  if (items == null) return <div className="ticker" aria-hidden="true" />;
  if (items.length === 0) return null;
  const seconds = Math.max(40, items.length * 5);
  const row = (copy: boolean) =>
    items.map((it, i) => (
      <Link
        key={`${copy ? "b" : "a"}-${i}`}
        href={it.href}
        className={`ticker-item ${it.kind}`}
        tabIndex={copy ? -1 : undefined}
      >
        <span className="tk-label">{it.label}</span> <b className="tk-value">{it.value}</b>
        {it.change != null ? (
          <span className={`tk-change ${it.change >= 0 ? "up" : "down"}`}>
            {" "}
            {fmtChange(it.change)}
          </span>
        ) : null}
        {it.note ? <span className="tk-note"> · {it.note}</span> : null}
      </Link>
    ));
  return (
    <div className="ticker" role="marquee" aria-label="Market ticker">
      <div className="ticker-track" style={{ animationDuration: `${seconds}s` }}>
        <div className="ticker-row">{row(false)}</div>
        <div className="ticker-row" aria-hidden="true">
          {row(true)}
        </div>
      </div>
    </div>
  );
}
