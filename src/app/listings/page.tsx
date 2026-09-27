import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { auth } from "@/auth";
import { FilterDrawer } from "@/components/listings/filter-drawer";
import { ListingsFeed } from "@/components/listings/infinite-feed";
import { CAR_FILTER_KEYS, filterChips, keysForChip } from "@/lib/listings/filters";
import { env } from "@/env/server";
import { PLATFORMS, PLATFORM_KEYS } from "@/lib/sources/platforms";
import { listingFilterSchema } from "@/server/listings-schema";
import { countLiveBySource, listExternalListings } from "@/server/queries/external";
import { listActiveListings } from "@/server/queries/listings";
import { listSellMakes } from "@/server/queries/sell-catalog";

export const metadata: Metadata = {
  title: "Cars for sale",
  description:
    "Collector and enthusiast cars listed by their owners, plus live auctions on Bring a Trailer, Cars & Bids and other platforms, all priced against real market data.",
};

const sourceSchema = z.enum(["all", "inauto", ...PLATFORM_KEYS]).default("all");
const xcursorSchema = z.string().max(160).optional();

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const parsed = listingFilterSchema.safeParse({
    type: sp.type,
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
  const session = await auth();

  const showOwn = source === "all" || source === "inauto";
  const showExternal = source !== "inauto" && filter.type !== "classified";
  const carFilter = Object.fromEntries(
    CAR_FILTER_KEYS.map((k) => [k, filter[k]]).filter(([, v]) => v != null),
  ) as Pick<typeof filter, (typeof CAR_FILTER_KEYS)[number]>;
  const chips = filterChips(carFilter);
  const [own, external, liveCounts, makes] = await Promise.all([
    showOwn
      ? listActiveListings(session?.user?.id ?? null, filter)
      : Promise.resolve({ rows: [], nextCursor: null }),
    showExternal
      ? listExternalListings({
          source: source === "all" ? undefined : source,
          ...carFilter,
          cursor: xcursor,
          includeSettled: past,
          settledOnly: past,
          result,
          limit: source === "all" ? 12 : 24,
        })
      : Promise.resolve({ rows: [], nextCursor: null }),
    countLiveBySource().catch(() => ({}) as Record<string, number>),
    listSellMakes().catch(() => []),
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
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Buy</div>
          <h1 className="display" style={{ fontSize: 40, margin: "6px 0 0" }}>
            Cars for sale
          </h1>
          <p className="sub">
            Listed by owners, priced against real market data, alongside live auctions on the major
            platforms. Every car can be title-vetted and inspected before you commit.
          </p>
        </div>
        <Link href="/sell" className="btn primary">
          Sell yours
        </Link>
      </div>
      <form className="filters" method="get" action="/listings">
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
        <div className="seg" role="group" aria-label="Source">
          <Link
            href={qs({ source: undefined, cursor: undefined, xcursor: undefined })}
            className="seg-link"
            aria-pressed={source === "all"}
          >
            All sources
          </Link>
          <Link
            href={qs({ source: "inauto", cursor: undefined, xcursor: undefined })}
            className="seg-link"
            aria-pressed={source === "inauto"}
          >
            InAuto
          </Link>
          {platformsWithLive.map((k) => (
            <Link
              key={k}
              href={qs({ source: k, cursor: undefined, xcursor: undefined })}
              className="seg-link"
              aria-pressed={source === k}
            >
              {PLATFORMS[k].name} <span className="count">{liveCounts[k]}</span>
            </Link>
          ))}
          {!platformsWithLive.includes(source as (typeof PLATFORM_KEYS)[number]) &&
          source !== "all" &&
          source !== "inauto" ? (
            <Link
              href={qs({ source, cursor: undefined, xcursor: undefined })}
              className="seg-link"
              aria-pressed
            >
              {PLATFORMS[source as (typeof PLATFORM_KEYS)[number]].name}
            </Link>
          ) : null}
        </div>
        {filter.type ? <input type="hidden" name="type" value={filter.type} /> : null}
        {source !== "all" ? <input type="hidden" name="source" value={source} /> : null}
        {past ? <input type="hidden" name="when" value="past" /> : null}
        {result ? <input type="hidden" name="result" value={result} /> : null}
        <FilterDrawer
          makes={makes}
          current={carFilter}
          keep={{
            when: past ? "past" : undefined,
            result,
            type: filter.type,
            source: source === "all" ? undefined : source,
          }}
        />
      </form>
      {chips.length ? (
        <div className="active-chips" style={{ paddingBottom: 14 }}>
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
                ? "On InAuto"
                : source === "all"
                  ? "All cars"
                  : `On ${PLATFORMS[source as (typeof PLATFORM_KEYS)[number]].name}`}
            {past && source !== "all"
              ? ` · ${source === "inauto" ? "InAuto" : PLATFORMS[source as (typeof PLATFORM_KEYS)[number]].name}`
              : ""}
          </h2>
          <p className="sub" style={{ margin: "4px 0 0" }}>
            {past ? (
              result === "sold" ? (
                "Cars that found a buyer, newest first, with the price they went for."
              ) : result === "unsold" ? (
                "Auctions that ended without a sale (reserve not met or withdrawn), newest first, with the high bid."
              ) : (
                "Every finished auction and sale, newest first. Filter to what sold or what did not."
              )
            ) : showOwn && own.rows.length > 0 ? (
              <>
                <span className="pill accent inauto-pill">On InAuto</span> cars are listed by their
                owners here and can be title-vetted and inspected before you commit.{" "}
              </>
            ) : showOwn ? (
              <>
                No InAuto listings match yet. <Link href="/sell">Be the first to list.</Link>{" "}
              </>
            ) : null}
            {!past && showExternal && liveTotal > 0
              ? `${liveTotal} auctions are live on Bring a Trailer, Cars & Bids and others; we show the numbers and our read on the price, bidding happens on the platform.`
              : null}
          </p>
        </div>
        {!past && showExternal && external.rows.length === 0 ? (
          <div className="panel empty-shelf" style={{ marginBottom: 16 }}>
            <b className="display">No live platform auctions right now.</b>
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
        {own.rows.length === 0 && external.rows.length === 0 ? (
          past ? (
            <p className="note" style={{ padding: "24px 0" }}>
              No finished auctions match this filter yet.
            </p>
          ) : showExternal ? null : (
            <p className="note" style={{ padding: "24px 0" }}>
              Nothing matches this filter yet.
            </p>
          )
        ) : (
          <ListingsFeed
            key={`${source}|${filter.when ?? ""}|${result ?? ""}|${filter.type ?? ""}|${JSON.stringify(carFilter)}|${filter.cursor ?? ""}|${xcursor ?? ""}`}
            own={own}
            external={external}
            ownFilter={
              showOwn ? { type: filter.type, ...carFilter, when: filter.when, result } : null
            }
            externalFilter={
              showExternal
                ? {
                    source: source === "all" ? undefined : source,
                    ...carFilter,
                    limit: source === "all" ? 12 : 24,
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
                  : null
            }
          />
        )}
      </section>
    </div>
  );
}
