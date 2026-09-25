import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { auth } from "@/auth";
import { ExternalCard } from "@/components/listings/external-card";
import { ListingCard } from "@/components/listings/listing-card";
import { env } from "@/env/server";
import { PLATFORMS, PLATFORM_KEYS } from "@/lib/sources/platforms";
import { listingFilterSchema } from "@/server/listings-schema";
import { countLiveBySource, listExternalListings } from "@/server/queries/external";
import { listActiveListings } from "@/server/queries/listings";

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
  const parsed = listingFilterSchema.safeParse({ type: sp.type, make: sp.make, cursor: sp.cursor });
  const filter = parsed.success ? parsed.data : {};
  const source = sourceSchema.safeParse(sp.source).data ?? "all";
  const xcursor = xcursorSchema.safeParse(sp.xcursor).data;
  const session = await auth();

  const showOwn = source === "all" || source === "inauto";
  const showExternal = source !== "inauto" && filter.type !== "classified";
  const [own, external, liveCounts] = await Promise.all([
    showOwn
      ? listActiveListings(session?.user?.id ?? null, filter)
      : Promise.resolve({ rows: [], nextCursor: null }),
    showExternal
      ? listExternalListings({
          source: source === "all" ? undefined : source,
          make: filter.make,
          cursor: xcursor,
          includeSettled: true,
          limit: source === "all" ? 12 : 24,
        })
      : Promise.resolve({ rows: [], nextCursor: null }),
    countLiveBySource().catch(() => ({}) as Record<string, number>),
  ]);
  const liveTotal = Object.values(liveCounts).reduce((a, b) => a + b, 0);
  const platformsWithLive = PLATFORM_KEYS.filter((k) => (liveCounts[k] ?? 0) > 0);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = {
      type: filter.type,
      make: filter.make,
      source: source === "all" ? undefined : source,
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
        <div className="fld" style={{ flexDirection: "row", gap: 6 }}>
          <input
            name="make"
            placeholder="Make"
            defaultValue={filter.make ?? ""}
            maxLength={60}
            aria-label="Filter by make"
          />
          <button type="submit" className="btn">
            Filter
          </button>
        </div>
      </form>

      {showOwn ? (
        <section className="shelf" aria-labelledby="own-h">
          {source === "all" ? (
            <h2 id="own-h" className="sec">
              On InAuto
            </h2>
          ) : null}
          {own.rows.length === 0 ? (
            <p className="note" style={{ padding: "24px 0" }}>
              No active InAuto listings match. <Link href="/sell">Be the first to list.</Link>
            </p>
          ) : (
            <div className="car-grid" style={{ marginTop: source === "all" ? 12 : 0 }}>
              {own.rows.map((l) => (
                <ListingCard key={l.id} l={l} />
              ))}
            </div>
          )}
          {own.nextCursor ? (
            <div style={{ textAlign: "center", padding: 24 }}>
              <Link href={qs({ cursor: own.nextCursor })} className="btn">
                Load more InAuto listings
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      {showExternal ? (
        <section className="shelf" aria-labelledby="ext-h">
          <div className="page-head" style={{ paddingBlock: "8px 12px" }}>
            <div>
              <h2 id="ext-h" className="sec">
                {source === "all"
                  ? liveTotal
                    ? `Live on other platforms · ${liveTotal}`
                    : "Recent auctions on other platforms"
                  : `On ${PLATFORMS[source as (typeof PLATFORM_KEYS)[number]].name}`}
              </h2>
              <p className="sub" style={{ margin: "4px 0 0" }}>
                Auctions running on Bring a Trailer, Cars &amp; Bids and others. We show the numbers
                and our read on the price; bidding happens on the platform.
              </p>
            </div>
          </div>
          {external.rows.length === 0 ? (
            <p className="note" style={{ padding: "24px 0" }}>
              {liveTotal === 0
                ? "No platform auctions synced yet."
                : "No platform auctions match this filter."}
            </p>
          ) : (
            <div className="car-grid">
              {external.rows.map((l) => (
                <ExternalCard key={l.id} l={l} showPhotos={env.externalPhotos} />
              ))}
            </div>
          )}
          {external.nextCursor ? (
            <div style={{ textAlign: "center", padding: 24 }}>
              <Link href={qs({ xcursor: external.nextCursor })} className="btn">
                Load more from platforms
              </Link>
            </div>
          ) : source === "all" && external.rows.length > 0 ? (
            <div style={{ textAlign: "center", padding: 24 }}>
              <Link
                href={qs({ source: platformsWithLive[0] ?? "bat", cursor: undefined })}
                className="btn"
              >
                See all platform auctions
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
