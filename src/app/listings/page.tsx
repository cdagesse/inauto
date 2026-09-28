import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { auth } from "@/auth";
import { BuySearch } from "@/components/listings/buy-search";
import { FilterDrawer } from "@/components/listings/filter-drawer";
import { ListingsFeed } from "@/components/listings/infinite-feed";
import { CAR_FILTER_KEYS, filterChips, keysForChip } from "@/lib/listings/filters";
import { env } from "@/env/server";
import { PLATFORMS, PLATFORM_KEYS } from "@/lib/sources/platforms";
import { listingFilterSchema } from "@/server/listings-schema";
import { countDealerListings, listDealerListings } from "@/server/queries/dealers";
import { countLiveBySource, listExternalListings } from "@/server/queries/external";
import { listActiveListings } from "@/server/queries/listings";
import { listSellMakes } from "@/server/queries/sell-catalog";
import { soft } from "@/server/result";

export const metadata: Metadata = {
  title: "Cars for sale",
  description:
    "Collector and enthusiast cars listed by their owners, plus live auctions on Bring a Trailer, Cars & Bids and other platforms, all priced against real market data.",
};

const sourceSchema = z.enum(["all", "inauto", "dealer", ...PLATFORM_KEYS]).default("all");
const xcursorSchema = z.string().max(160).optional();

/** Human name of a source value for headings and the source menu. */
function sourceName(source: string): string {
  if (source === "all") return "All sources";
  if (source === "inauto") return "UrCar";
  if (source === "dealer") return "Dealers";
  return PLATFORMS[source as (typeof PLATFORM_KEYS)[number]]?.name ?? source;
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const parsed = listingFilterSchema.safeParse({
    type: sp.type,
    q: sp.q,
    make: sp.make,
    model: sp.model,
    trim: sp.trim,
    yearMin: sp.yearMin,
    yearMax: sp.yearMax,
    priceMin: sp.priceMin,
    priceMax: sp.priceMax,
    milesMin: sp.milesMin,
    milesMax: sp.milesMax,
    cursor: sp.cursor,
    when: sp.when,
    result: sp.result,
  });
  const filter = parsed.success ? parsed.data : {};
  const past = filter.when === "past";
  const result = past ? filter.result : undefined;
  const source = sourceSchema.safeParse(sp.source).data ?? "all";
  const xcursor = xcursorSchema.safeParse(sp.xcursor).data;
  const dcursor = xcursorSchema.safeParse(sp.dcursor).data;
  const session = await auth();

  const showOwn = source === "all" || source === "inauto";
  const showExternal = source !== "inauto" && source !== "dealer" && filter.type !== "classified";
  const carFilter = Object.fromEntries(
    CAR_FILTER_KEYS.map((k) => [k, filter[k]]).filter(([, v]) => v != null),
  ) as Pick<typeof filter, (typeof CAR_FILTER_KEYS)[number]>;
  // Dealer inventory (asking prices, no auction) joins the feed when asked for, when the
  // type is Classifieds, or whenever the visitor narrowed to a car; it never mixes into the
  // unfiltered live-auction feed, which would bury the auctions.
  const narrowed = !!(carFilter.make || carFilter.model || carFilter.trim || carFilter.q);
  const showDealers =
    !past &&
    filter.type !== "auction" &&
    (source === "dealer" || (source === "all" && (filter.type === "classified" || narrowed)));
  const chips = filterChips(carFilter);
  const [own, external, dealers, liveCounts, dealerTotal, makes] = await Promise.all([
    showOwn
      ? listActiveListings(session?.user?.id ?? null, filter)
      : Promise.resolve({ rows: [], nextCursor: null, truncated: false }),
    showExternal
      ? listExternalListings({
          source: source === "all" ? undefined : source,
          ...carFilter,
          cursor: xcursor,
          phase: past ? "past" : "live",
          result,
          // A search is one page of best matches, so it gets more room.
          limit: filter.q ? 36 : source === "all" ? 12 : 24,
        })
      : Promise.resolve({ rows: [], nextCursor: null, truncated: false }),
    showDealers
      ? listDealerListings({
          ...carFilter,
          cursor: dcursor,
          limit: filter.q ? 36 : source === "dealer" ? 24 : 12,
        }).catch(soft("listings dealers", { rows: [], nextCursor: null }))
      : Promise.resolve({ rows: [], nextCursor: null }),
    countLiveBySource().catch(soft("listings live counts", {} as Record<string, number>)),
    past ? Promise.resolve(0) : countDealerListings().catch(soft("listings dealer count", 0)),
    listSellMakes().catch(soft("listings makes", [])),
  ]);
  const liveTotal = Object.values(liveCounts).reduce((a, b) => a + b, 0);
  const platformsWithLive = PLATFORM_KEYS.filter((k) => (liveCounts[k] ?? 0) > 0);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      when: past ? "past" : undefined,
      result,
      type: filter.type,
      source: source === "all" ? undefined : source,
      ...Object.fromEntries(Object.entries(carFilter).map(([k, v]) => [k, String(v)])),
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/listings?${s}` : "/listings";
  };

  return (
    <div className="buy-page">
      <div className="page-head compact buy-head">
        <div className="head-main">
          <div className="eyebrow">Buy</div>
          <h1 className="display head-title">Cars for sale</h1>
        </div>
        <Link href="/sell" className="btn primary">
          Sell yours
        </Link>
      </div>
      <BuySearch
        initial={filter.q ?? ""}
        params={Object.fromEntries(
          Object.entries({
            when: past ? "past" : undefined,
            result,
            type: filter.type,
            source: source === "all" ? undefined : source,
            ...Object.fromEntries(
              Object.entries(carFilter)
                .filter(([k]) => k !== "q")
                .map(([k, v]) => [k, String(v)]),
            ),
          }).filter((e): e is [string, string] => !!e[1]),
        )}
      />
      <div className="filters">
        <div className="seg" role="group" aria-label="Live or past">
          <Link
            href={qs({ when: undefined, result: undefined, cursor: undefined, xcursor: undefined })}
            className="seg-link"
            aria-pressed={!past}
          >
            Live
          </Link>
          <Link
            href={qs({ when: "past", result: undefined, cursor: undefined, xcursor: undefined })}
            className="seg-link"
            aria-pressed={past}
          >
            Past
          </Link>
        </div>
        {past ? (
          <div className="seg" role="group" aria-label="Result">
            <Link
              href={qs({ result: undefined, cursor: undefined, xcursor: undefined })}
              className="seg-link"
              aria-pressed={!result}
            >
              All results
            </Link>
            <Link
              href={qs({ result: "sold", cursor: undefined, xcursor: undefined })}
              className="seg-link"
              aria-pressed={result === "sold"}
            >
              Sold
            </Link>
            <Link
              href={qs({ result: "unsold", cursor: undefined, xcursor: undefined })}
              className="seg-link"
              aria-pressed={result === "unsold"}
            >
              Not sold
            </Link>
          </div>
        ) : null}
        <div className="seg" role="group" aria-label="Listing type">
          <Link
            href={qs({ type: undefined, cursor: undefined, xcursor: undefined })}
            className="seg-link"
            aria-pressed={!filter.type}
          >
            All
          </Link>
          <Link
            href={qs({ type: "classified", cursor: undefined, xcursor: undefined })}
            className="seg-link"
            aria-pressed={filter.type === "classified"}
          >
            Classifieds
          </Link>
          <Link
            href={qs({ type: "auction", cursor: undefined, xcursor: undefined })}
            className="seg-link"
            aria-pressed={filter.type === "auction"}
          >
            Auctions
          </Link>
        </div>
        <details className="src-menu">
          <summary className="seg-link" aria-label="Choose a source">
            {sourceName(source)}
            <span className="caret" aria-hidden="true">
              ▾
            </span>
          </summary>
          <div className="src-list" role="group" aria-label="Source">
            <Link
              href={qs({ source: undefined, cursor: undefined, xcursor: undefined })}
              aria-pressed={source === "all"}
            >
              All sources
            </Link>
            <Link
              href={qs({ source: "inauto", cursor: undefined, xcursor: undefined })}
              aria-pressed={source === "inauto"}
            >
              UrCar
            </Link>
            {dealerTotal > 0 || source === "dealer" ? (
              <Link
                href={qs({ source: "dealer", cursor: undefined, xcursor: undefined })}
                aria-pressed={source === "dealer"}
              >
                Dealers <span className="count">{dealerTotal}</span>
              </Link>
            ) : null}
            {platformsWithLive.map((k) => (
              <Link
                key={k}
                href={qs({ source: k, cursor: undefined, xcursor: undefined })}
                aria-pressed={source === k}
              >
                {PLATFORMS[k].name} <span className="count">{liveCounts[k]}</span>
              </Link>
            ))}
            {!platformsWithLive.includes(source as (typeof PLATFORM_KEYS)[number]) &&
            source !== "all" &&
            source !== "inauto" &&
            source !== "dealer" ? (
              <Link href={qs({ source, cursor: undefined, xcursor: undefined })} aria-pressed>
                {sourceName(source)}
              </Link>
            ) : null}
          </div>
        </details>
        <FilterDrawer
          makes={makes}
          current={carFilter}
          keep={{
            when: past ? "past" : undefined,
            result,
            type: filter.type,
            source: source === "all" ? undefined : source,
            q: filter.q,
          }}
        />
      </div>
      {chips.length ? (
        <div className="active-chips">
          <span className="lab">Filters</span>
          {chips.map((c) => (
            <Link
              key={c.key}
              href={qs({
                ...Object.fromEntries(keysForChip(c.key).map((k) => [k, undefined])),
                cursor: undefined,
                xcursor: undefined,
              })}
              className="chip"
              aria-label={`Remove filter ${c.label}`}
            >
              {c.label} <span className="x">×</span>
            </Link>
          ))}
          <Link
            href={qs({
              ...Object.fromEntries(CAR_FILTER_KEYS.map((k) => [k, undefined])),
              cursor: undefined,
              xcursor: undefined,
            })}
            className="chip"
          >
            Clear all
          </Link>
        </div>
      ) : null}

      <section className="shelf" aria-labelledby="all-h">
        <div className="feed-head">
          <h2 id="all-h" className="sec">
            {past
              ? result === "sold"
                ? "Sold"
                : result === "unsold"
                  ? "Not sold"
                  : "Past auctions and sales"
              : source === "inauto"
                ? "On UrCar"
                : source === "dealer"
                  ? "At dealers"
                  : source === "all"
                    ? "All cars"
                    : `On ${sourceName(source)}`}
            {past && source !== "all" ? ` · ${sourceName(source)}` : ""}
          </h2>
          <p className="hint feed-hint">
            {past
              ? result === "sold"
                ? "Sold, newest first, with the price paid."
                : result === "unsold"
                  ? "Ended without a sale, newest first, with the high bid."
                  : "Finished auctions and sales, newest first."
              : source === "dealer"
                ? `${chips.length ? "Dealer listings matching your filters" : `${dealerTotal.toLocaleString("en-US")} listed at dealers`} · asking prices, buy from the dealer`
                : liveTotal > 0
                  ? showExternal
                    ? `${liveTotal} live on the platforms · bidding happens there${showDealers && dealers.rows.length && external.rows.length ? " · dealer listings follow" : ""}`
                    : showDealers && dealers.rows.length
                      ? `${dealers.rows.length}${dealers.nextCursor ? "+" : ""} at dealers · asking prices`
                      : `${liveTotal} live on the platforms · bidding happens there`
                  : showOwn && own.rows.length === 0
                    ? "No UrCar listings match yet."
                    : null}
            {!past && showOwn && own.rows.length === 0 ? (
              <>
                {" "}
                <Link href="/sell">Be the first to list.</Link>
              </>
            ) : null}
          </p>
        </div>
        {!past && showExternal && external.rows.length === 0 && dealers.rows.length === 0 ? (
          <div className="panel empty-shelf" style={{ marginBottom: 16 }}>
            <b className="display">
              {filter.q
                ? `Nothing matches “${filter.q}”`
                : chips.length && liveTotal > 0
                  ? "Nothing live matches these filters"
                  : "No live platform auctions right now."}
            </b>
            <p className="note" style={{ margin: "4px 0 10px" }}>
              {liveTotal === 0
                ? "Auctions that have ended move to Past as soon as they close. The platform feed refreshes hourly while its data budget allows."
                : "Nothing live matches this filter."}
            </p>
            <Link
              href={qs({ when: "past", cursor: undefined, xcursor: undefined })}
              className="btn"
            >
              See recently ended and past results
            </Link>
          </div>
        ) : null}
        {own.rows.length === 0 && external.rows.length === 0 && dealers.rows.length === 0 ? (
          source === "dealer" && (past || filter.type === "auction") ? (
            <p className="note" style={{ padding: "24px 0" }}>
              Dealer listings are asking-price sales, so there are no dealer auctions or past dealer
              results.{" "}
              <Link
                href={qs({
                  type: undefined,
                  when: undefined,
                  result: undefined,
                  cursor: undefined,
                  xcursor: undefined,
                })}
              >
                Show live dealer listings
              </Link>
              .
            </p>
          ) : past ? (
            <p className="note" style={{ padding: "24px 0" }}>
              No finished auctions match this filter yet.
            </p>
          ) : showExternal ? null : (
            <p className="note" style={{ padding: "24px 0" }}>
              {source === "dealer"
                ? "No dealer listings match this filter yet. Dealer inventory refreshes about every two weeks per model."
                : "Nothing matches this filter yet."}
            </p>
          )
        ) : (
          <ListingsFeed
            key={`${source}|${filter.when ?? ""}|${result ?? ""}|${filter.type ?? ""}|${JSON.stringify(carFilter)}|${filter.cursor ?? ""}|${xcursor ?? ""}|${dcursor ?? ""}`}
            own={own}
            external={external}
            dealers={dealers}
            dealerFilter={
              showDealers
                ? { ...carFilter, limit: filter.q ? 36 : source === "dealer" ? 24 : 12 }
                : null
            }
            searchTruncated={own.truncated || external.truncated}
            ownFilter={
              showOwn ? { type: filter.type, ...carFilter, when: filter.when, result } : null
            }
            externalFilter={
              showExternal
                ? {
                    source: source === "all" ? undefined : source,
                    ...carFilter,
                    limit: filter.q ? 36 : source === "all" ? 12 : 24,
                    when: filter.when,
                    result,
                  }
                : null
            }
            showPhotos={env.externalPhotos}
            fallbackHref={
              own.nextCursor
                ? qs({ cursor: own.nextCursor })
                : external.nextCursor
                  ? qs({ xcursor: external.nextCursor })
                  : dealers.nextCursor
                    ? qs({ dcursor: dealers.nextCursor })
                    : null
            }
          />
        )}
      </section>
    </div>
  );
}
