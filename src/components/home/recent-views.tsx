"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { money } from "@/lib/format/money";
import { CardPhoto } from "@/components/listings/card-photo";

const KEY = "inauto-recent";
const MAX = 12;

export interface RecentItem {
  key: string;
  href: string;
  title: string;
  sub: string;
  price: number | null;
  currency: string;
  priceLabel: string;
  photo: string | null;
  badge: string;
  at: number;
}

function read(): RecentItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RecentItem[]) : [];
    return Array.isArray(list) ? list.filter((x) => x && typeof x.href === "string") : [];
  } catch {
    return [];
  }
}

/** Drop this on a car page: it remembers the car in this browser for the home page. */
export function RecordView({ item }: { item: Omit<RecentItem, "at"> }) {
  useEffect(() => {
    try {
      const rest = read().filter((x) => x.key !== item.key);
      localStorage.setItem(
        KEY,
        JSON.stringify([{ ...item, at: Date.now() }, ...rest].slice(0, MAX)),
      );
    } catch {}
  }, [item]);
  return null;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
const getRaw = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

/** Cars this visitor opened recently, newest first. Renders nothing until there are any. */
export function RecentlyViewed({ excludeHref }: { excludeHref?: string }) {
  // Read through useSyncExternalStore so the server renders nothing and the client hydrates cleanly.
  const raw = useSyncExternalStore(subscribe, getRaw, () => "");
  const items = useMemo(() => {
    if (!raw) return [] as RecentItem[];
    try {
      const list = JSON.parse(raw) as RecentItem[];
      return (Array.isArray(list) ? list : [])
        .filter((x) => x && typeof x.href === "string" && x.href !== excludeHref)
        .slice(0, 8);
    } catch {
      return [] as RecentItem[];
    }
  }, [raw, excludeHref]);
  if (items.length === 0) return null;
  return (
    <section className="shelf recent-views" aria-labelledby="recent-h">
      <div className="feed-head">
        <div className="eyebrow">Recently viewed</div>
        <h2 id="recent-h" className="sec" style={{ marginTop: 4 }}>
          Pick up where you left off
        </h2>
      </div>
      <div className="car-grid">
        {items.map((it) => (
          <Link key={it.key} href={it.href} className="panel car-card link-card listing-card">
            <CardPhoto src={it.photo} />
            <div className="lab card-meta">
              <span className="meta-main">{it.badge}</span>
            </div>
            <h3 className="display" style={{ fontSize: 18, margin: "2px 0 4px" }}>
              {it.title}
            </h3>
            <div className="hint">{it.sub}</div>
            <div className="num price">
              {it.price != null ? money(it.price, it.currency) : ""}{" "}
              <span className="hint">{it.price != null ? it.priceLabel : "No price yet"}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
