"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fmtChange, type TickerItem } from "@/lib/market/ticker";

/** Pages where the strip would only get in the way. */
const HIDDEN = ["/admin", "/signin", "/signup", "/invite"];

/**
 * A scrolling strip of market news under the site header: the UrCar index, segment medians,
 * the biggest 90-day movers and the latest sold auctions. Fetched after mount from a cached
 * route so the layout stays static; pauses on hover; stands still for reduced motion.
 */
export function MarketTicker() {
  const pathname = usePathname();
  const [items, setItems] = useState<TickerItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/ticker")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: TickerItem[] } | null) => {
        if (alive && d?.items?.length) setItems(d.items);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (HIDDEN.some((p) => pathname?.startsWith(p))) return null;
  if (!items) return <div className="ticker" aria-hidden="true" />;
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
    <div className="ticker" aria-label="Market ticker">
      <div className="ticker-track" style={{ animationDuration: `${seconds}s` }}>
        <div className="ticker-row">{row(false)}</div>
        <div className="ticker-row" aria-hidden="true">
          {row(true)}
        </div>
      </div>
    </div>
  );
}
