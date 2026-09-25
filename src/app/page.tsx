import Link from "next/link";
import { listMarketModels } from "@/lib/market/source";
import { usd } from "@/components/market/format";
import { SearchBox } from "@/components/site/search";

export default async function HomePage() {
  const models = await listMarketModels();
  const featured = models[0];
  return (
    <>
      <section className="home-hero">
        <div className="eyebrow">Collector car market data, pricing and buyer protection</div>
        <h1>Know what it&apos;s worth before you buy or sell.</h1>
        <p className="lead">
          Real dealer sales and auction hammer prices, by generation. A pricing tool that tells
          sellers whether to auction, sell to a dealer, or list it themselves. And the tools buyers
          need to not get scammed: title vetting, condition reports, and escrow.
        </p>
        <div className="search" role="search">
          <SearchBox size="hero" placeholder="Search a make or model, e.g. Mercedes S63" />
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Start with the make. Pick a model and we build its market report from dealer sales and
          auction results.
        </p>
      </section>

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

      {featured && (
        <section style={{ paddingBlock: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Featured market report
          </div>
          <Link href={`/${featured.make.slug}/${featured.model.slug}`} className="panel featured">
            <div>
              <div className="eyebrow">{featured.make.name}</div>
              <div className="name">{featured.model.name}</div>
              <div className="note" style={{ margin: 0 }}>
                {featured.totals.dealerSales} dealer sales · {featured.totals.auctionSales} auction
                sales · {featured.totals.activeNow} for sale today
              </div>
            </div>
            <div>
              <div className="lab">Latest generation median</div>
              <div className="price">{usd(featured.headline)}</div>
            </div>
          </Link>
        </section>
      )}

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
