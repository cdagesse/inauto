import Link from "next/link";
import { ExternalCard } from "@/components/listings/external-card";
import { ListingCard } from "@/components/listings/listing-card";
import { SearchBox } from "@/components/site/search";
import { FeaturedHero } from "@/components/home/featured-hero";
import { RecentlyViewed } from "@/components/home/recent-views";
import { autoFeatured, listFeatured, resolveCars } from "@/server/queries/featured";
import { topViewed } from "@/server/views";
import { env } from "@/env/server";
import { SegmentsTable } from "@/components/market/segments-table";
import { getMarketTree } from "@/lib/market/tree-source";
import { listExternalListings } from "@/server/queries/external";
import { listActiveListings } from "@/server/queries/listings";

/**
 * The home page shows the newest active listings, so it is regenerated every
 * 10 minutes and whenever a listing is created, published, withdrawn or sold.
 * No session is read here on purpose: that keeps the page static at the CDN,
 * so only public (non private-network) listings appear.
 */
export const revalidate = 600;

const OWN_LIMIT = 8;
const EXTERNAL_LIMIT = 4;

export default async function HomePage() {
  const [tree, own, external, picked] = await Promise.all([
    getMarketTree().catch(() => null),
    listActiveListings(null, {}, OWN_LIMIT).catch(() => ({ rows: [], nextCursor: null })),
    listExternalListings({ limit: EXTERNAL_LIMIT }).catch(() => ({ rows: [], nextCursor: null })),
    listFeatured(env.externalPhotos).catch(() => []),
  ]);
  // Hero rotation: admin picks first, then the most-viewed cars of the week, then newest with photos.
  const trendingIds = await topViewed(7, 8).catch(() => []);
  const trending = (await resolveCars(trendingIds, env.externalPhotos, false).catch(() => [])).map(
    (c) => ({ ...c, views: trendingIds.find((t) => `${t.kind}:${t.refId}` === c.key)?.views }),
  );
  const seen = new Set(picked.map((c) => c.key));
  const heroCars = [
    ...picked,
    ...trending.filter((c) => c.photo && !seen.has(c.key) && seen.add(c.key)),
  ].slice(0, 8);
  if (heroCars.length < 3)
    for (const c of await autoFeatured(5).catch(() => []))
      if (!seen.has(c.key) && heroCars.length < 5) {
        seen.add(c.key);
        heroCars.push(c);
      }
  const segments = tree?.segments ?? [];
  const live = external.rows.filter((l) => l.status === "live");
  return (
    <>
      <section className={`home-hero${heroCars.length ? " with-featured" : ""}`}>
        <div className="home-hero-copy">
          <div className="eyebrow">Collector car market data, pricing and buyer protection</div>
          <h1>Know what it&apos;s worth before you buy or sell.</h1>
          <p className="lead">
            Real dealer sales and auction hammer prices, by generation. A pricing tool that tells
            sellers whether to auction, sell to a dealer, or list it themselves. And the tools
            buyers need to not get scammed: title vetting, condition reports, and escrow.
          </p>
          <div className="search" role="search">
            <SearchBox size="hero" placeholder="Search a make or model, e.g. Mercedes S63" />
          </div>
          <p className="note" style={{ marginTop: 8 }}>
            Start with the make. Pick a model and we build its market report from dealer sales and
            auction results.
          </p>
        </div>
        {heroCars.length ? <FeaturedHero cars={heroCars} /> : null}
      </section>

      <section className="shelf home-listings" aria-labelledby="latest-h">
        <div className="page-head" style={{ paddingBlock: "28px 12px" }}>
          <div>
            <div className="eyebrow">For sale now</div>
            <h2 id="latest-h" className="sec" style={{ marginTop: 6 }}>
              Latest listings
            </h2>
            <p className="sub" style={{ margin: "4px 0 0" }}>
              The newest cars listed on InAuto, each priced against real dealer and auction sales.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/listings" className="btn">
              Browse all
            </Link>
            <Link href="/sell" className="btn primary">
              Sell yours
            </Link>
          </div>
        </div>
        {own.rows.length === 0 ? (
          <div className="panel empty-shelf">
            <b className="display">No active listings yet.</b>
            <p className="note" style={{ margin: "4px 0 10px" }}>
              Value your car in a minute and be the first to list it. Free, priced against real
              sales, with title vetting and inspection for buyers.
            </p>
            <Link href="/sell" className="btn primary">
              Value and list my car
            </Link>
          </div>
        ) : (
          <div className="car-grid">
            {own.rows.map((l) => (
              <ListingCard key={l.id} l={l} />
            ))}
          </div>
        )}
        {live.length > 0 ? (
          <>
            <h3 className="sec" style={{ fontSize: 18, marginTop: 28 }}>
              Live auctions on other platforms
            </h3>
            <div className="car-grid" style={{ marginTop: 10 }}>
              {live.map((l) => (
                <ExternalCard key={l.id} l={l} showPhotos={env.externalPhotos} />
              ))}
            </div>
          </>
        ) : null}
      </section>

      <RecentlyViewed />

      <section className="props">
        <div className="panel prop">
          <div className="eyebrow">Market data</div>
          <h3>Every generation, priced from real sales</h3>
          <p>
            Dealer sold prices from Visor and auction results from Old Cars Data, cleaned,
            deduplicated and aggregated nightly. Trends, mileage curves, color premiums and
            auction-vs-dealer gaps.
          </p>
        </div>
        <div className="panel prop">
          <div className="eyebrow">Pricing tool</div>
          <h3>What to list it for, and where</h3>
          <p>
            Enter your car and get a market value with a range, an expected hammer price, a likely
            dealer offer, and a recommendation. Listing too high or too low? We&apos;ll tell you
            before you publish.
          </p>
        </div>
        <div className="panel prop">
          <div className="eyebrow">Buyer protection</div>
          <h3>Arm yourself before you send money</h3>
          <ul>
            <li>Title vetting: liens, brands, and history</li>
            <li>Independent condition reports</li>
            <li>Escrow, coming soon</li>
          </ul>
        </div>
      </section>

      {segments.length ? (
        <section className="shelf home-segments" aria-labelledby="seg-h">
          <div
            className="feed-head"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "end",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="eyebrow">Market reports</div>
              <h2 id="seg-h" className="sec" style={{ marginTop: 4 }}>
                Segments at a glance
              </h2>
              <p className="hint feed-hint">
                Monthly dealer sales and a price index for each segment; the index sets every
                generation&apos;s normal price at 100.
              </p>
            </div>
            <Link href="/markets" className="btn">
              All market reports
            </Link>
          </div>
          <SegmentsTable segments={segments} />
        </section>
      ) : null}

      <section className="ctas">
        <Link href="/sell" className="btn primary">
          Value and list your car
        </Link>
        <Link href="/listings" className="btn">
          Browse listings
        </Link>
        <Link href="/tools" className="btn">
          Buyer tools
        </Link>
      </section>
    </>
  );
}
