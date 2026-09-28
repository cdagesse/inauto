"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CarFilter } from "@/lib/listings/filters";
import type { DealerCardData } from "@/server/queries/dealers";
import type { ExternalCardData } from "@/server/queries/external";
import {
  type ListingFeedRow,
  loadMoreDealers,
  loadMoreExternal,
  loadMoreListings,
} from "@/server/listings-feed";
import { DealerCard } from "./dealer-card";
import { ExternalCard } from "./external-card";
import { ListingCard } from "./listing-card";

type Page<T> = { rows: T[]; nextCursor: string | null };
type Item =
  | { kind: "own"; row: ListingFeedRow }
  | { kind: "ext"; row: ExternalCardData }
  | { kind: "dealer"; row: DealerCardData };

const itemId = (i: Item) => `${i.kind}:${i.row.id}`;

/**
 * One continuous feed: UrCar listings first (highlighted), then platform
 * auctions. Pages append as the sentinel below the grid scrolls into view.
 * The first page of each is server-rendered by the parent, so the list works
 * without JavaScript (the noscript link keeps paginated navigation) and
 * search engines still see the first page.
 */
export function ListingsFeed({
  own,
  external,
  dealers = { rows: [], nextCursor: null },
  ownFilter,
  externalFilter,
  dealerFilter = null,
  showPhotos,
  fallbackHref,
  searchTruncated = false,
}: {
  own: Page<ListingFeedRow>;
  external: Page<ExternalCardData>;
  /** Dealer inventory, shown after the auctions. */
  dealers?: Page<DealerCardData>;
  ownFilter:
    | (CarFilter & {
        type?: "classified" | "auction";
        when?: "live" | "past";
        result?: "sold" | "unsold";
      })
    | null;
  externalFilter:
    | (CarFilter & {
        source?: ExternalCardData["source"];
        limit?: number;
        when?: "live" | "past";
        result?: "sold" | "unsold";
      })
    | null;
  dealerFilter?: (CarFilter & { limit?: number }) | null;
  showPhotos: boolean;
  fallbackHref: string | null;
  /** A search that matched more than it shows; the footer says so instead of "every car". */
  searchTruncated?: boolean;
}) {
  const [items, setItems] = useState<Item[]>(() => [
    ...own.rows.map((row): Item => ({ kind: "own", row })),
    ...external.rows.map((row): Item => ({ kind: "ext", row })),
    ...dealers.rows.map((row): Item => ({ kind: "dealer", row })),
  ]);
  const [ownCursor, setOwnCursor] = useState(ownFilter ? own.nextCursor : null);
  const [extCursor, setExtCursor] = useState(externalFilter ? external.nextCursor : null);
  const [dealerCursor, setDealerCursor] = useState(dealerFilter ? dealers.nextCursor : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const inflight = useRef(false);
  const hasMore = !!ownCursor || !!extCursor || !!dealerCursor;

  const append = useCallback((next: Item[]) => {
    setItems((prev) => {
      const seen = new Set(prev.map(itemId));
      return [...prev, ...next.filter((x) => !seen.has(itemId(x)))];
    });
  }, []);

  const more = useCallback(async () => {
    if (!hasMore || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    if (ownCursor && ownFilter) {
      const r = await loadMoreListings({ ...ownFilter, cursor: ownCursor });
      if (r.ok) {
        append(r.data.rows.map((row) => ({ kind: "own", row })));
        setOwnCursor(r.data.nextCursor);
      } else setError(r.error);
    } else if (extCursor && externalFilter) {
      const r = await loadMoreExternal({ ...externalFilter, cursor: extCursor });
      if (r.ok) {
        append(r.data.rows.map((row) => ({ kind: "ext", row })));
        setExtCursor(r.data.nextCursor);
      } else setError(r.error);
    } else if (dealerCursor && dealerFilter) {
      const r = await loadMoreDealers({ ...dealerFilter, cursor: dealerCursor });
      if (r.ok) {
        append(r.data.rows.map((row) => ({ kind: "dealer", row })));
        setDealerCursor(r.data.nextCursor);
      } else setError(r.error);
    }
    setBusy(false);
    inflight.current = false;
  }, [
    hasMore,
    ownCursor,
    ownFilter,
    extCursor,
    externalFilter,
    dealerCursor,
    dealerFilter,
    append,
  ]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void more();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, more]);

  return (
    <>
      <div className="car-grid">
        {items.map((i) =>
          i.kind === "own" ? (
            <ListingCard key={itemId(i)} l={i.row} highlight />
          ) : i.kind === "ext" ? (
            <ExternalCard key={itemId(i)} l={i.row} showPhotos={showPhotos} />
          ) : (
            <DealerCard key={itemId(i)} l={i.row} />
          ),
        )}
      </div>
      <div ref={sentinel} className="feed-foot" aria-live="polite">
        {busy ? (
          <span className="hint">Loading more…</span>
        ) : error ? (
          <>
            <span className="err" style={{ margin: 0 }}>
              {error}
            </span>{" "}
            <button type="button" className="btn sm" onClick={() => void more()}>
              Try again
            </button>
          </>
        ) : hasMore && fallbackHref ? (
          <noscript>
            <a href={fallbackHref} className="btn">
              Load more
            </a>
          </noscript>
        ) : items.length > 0 ? (
          <span className="hint">
            {searchTruncated
              ? "Showing the best matches. Add a year, make or trim to narrow it down."
              : "That is every car that matches."}
          </span>
        ) : null}
      </div>
    </>
  );
}
