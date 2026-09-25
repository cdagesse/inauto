# Paddock Index: build spec

A collector and enthusiast car pricing site in the spirit of classic.com. Every car model gets a market page (historical prices, trends, auction results, dealer sales) and a "What is my car worth?" tool that tells an owner what to list it for and whether to auction it, sell it to a dealer, or sell it themselves.

The working prototype for one model (Porsche 911 GT3 RS) is `docs/reference/gt3rs-prototype.html`. Treat it as the design and behavior reference for the model page. Its data is hard-coded; the real site computes everything from a database fed by nightly jobs.

---

## 1. Data sources

| Source | What it gives us | Auth | Notes |
|---|---|---|---|
| Visor API (`https://api.visor.vin`) | Dealer listings, active and sold, with price, miles, color, dealer, state, days on market, sold date | `VISOR_API_KEY` env var | Sold history begins about Feb 17, 2026. 100 rows per page. Asking price at the time a listing left the market is our "dealer sale price". |
| Old Cars Data API (`https://api.oldcarsdata.com`) | Auction results from Bring a Trailer, Cars & Bids, RM Sotheby's, Bonhams, Barrett-Jackson, Hagerty and others. Hammer price, status (sold or reserve not met), miles, URL, date | `OCD_API_KEY` env var, header `Authorization: Bearer <key>` | Must send a real `User-Agent` header or requests get 403. Free plan: 20 rows per search, 10 searches a month, which is useless for production. A paid plan is required before launch. OpenAPI at `/openapi.json`. Endpoints: `/auctions`, `/stats`, `/makes`, `/models`, `/auctions/live`, `/auctions/{id}/bids`. |

Rules for both:

- Keys live only in environment variables or the host's secret store. Never in the repo, logs, client bundles, or error messages.
- All third-party calls happen in scheduled jobs, never in a page request.
- Store the raw response rows (with fetch timestamp) before normalizing, so we can reprocess without re-spending API calls.
- Log every call's cost and rate-limit headers; stop a job cleanly when it hits a configured monthly budget.
- **Licensing gate:** before any page is public, confirm in writing that both Visor's and Old Cars Data's terms allow displaying their data (including individual listing rows and links) on a public commercial site. If not, get a commercial or redistribution license. Build behind a login or `noindex` until this is cleared.

---

## 2. Data model

Postgres (or the repo's existing database). Minimum tables:

- `make` (id, name, slug)
- `model` (id, make_id, name, slug), e.g. 911 GT3 RS
- `generation` (id, model_id, code, name, year_start, year_end, original_msrp, engine, hp, gearbox, notes, sort_order). For GT3 RS: 997.1 (2007 to 2008), 997.2 (2010 to 2011), 991.1 (2016), 991.2 (2019), 992 (2023 to 2026).
- `model_alias` (model_id, source, raw_make, raw_model, raw_trim_pattern): maps each source's spellings to our model. Example: Visor `make=Porsche, model=911, trim ILIKE '%GT3 RS%'`.
- `dealer_sale` (id, source_listing_id, vin, generation_id, year, miles, price, color, is_pts, dealer_name, state, days_on_market, sold_date, excluded_reason nullable, raw_json)
- `dealer_active` (same shape, snapshot per day)
- `auction_result` (id, source, source_id, url, vin nullable, generation_id, year, miles, hammer_price, status `sold|rnm|withdrawn`, ended_at, is_weissach or a general `packages text[]`, raw_json)
- `market_daily` (generation_id, date, channel `dealer|auction`, n, median, p25, p75, median_miles): precomputed aggregates that pages read.
- `valuation_config` (key, value, scope nullable): every tunable number in section 5. Scope can be global, model or generation.
- `valuation_request` (id, created_at, generation_id, inputs json, outputs json, optional contact fields): log of tool uses, for tuning and, optionally, leads.

Generation assignment: by model year using `generation.year_start/year_end`. Where two generations share a year, use trim or package text, and flag unresolved rows for review rather than guessing.

---

## 3. Data pipeline (nightly)

1. **Pull.** For each model with an alias, pull Visor sold listings (last 2 days, overlapping) and today's active listings; pull OCD auction results since the last cursor. Save raw.
2. **Normalize.** Map to model and generation, parse miles and price, detect packages (Weissach, etc.) and paint-to-sample from trim, options or title text.
3. **Dedupe.** Dealer: one row per VIN per sale (Visor already dedupes rooftops). Auction: one row per source + source_id; if the same VIN sells on two platforms, keep both (they are separate events). A car that fails to sell (rnm) and later sells is two rows.
4. **Clean.** Mark rows with an `excluded_reason` instead of deleting them:
   - price outside `[0.4 × gen median, 2.5 × gen median]` for that generation, computed from the trailing 180 days: `outlier_price`
   - delivery-mile cars priced like a different, rarer model (the prototype excluded seven 2016 listings at $680k to $900k that were likely 911 R or mislabeled): `likely_mislabeled`
   - missing price or miles: `incomplete`
5. **Aggregate.** Rebuild `market_daily` for touched generations.
6. **Check.** Log row counts versus yesterday, share excluded, and any generation whose median moved more than 15% day over day. Alert, but do not block publishing.

---

## 4. Model page

Match the prototype's sections and behavior, driven by the database:

1. Header with breadcrumbs (make / model) and a "Value my car" anchor link.
2. Hero with "data through" date, dealer sale count, auction sale count, listed-now count.
3. Generation selector (remember choice per visitor in localStorage, wrapped in try/catch).
4. KPI row: median sold price with typical range (p25 to p75, or cleaned min/max for small samples), 90-day change (median of last 90 days vs the prior 90), sales count and median days to sell, active count and asking median, median miles, multiple of original MSRP. Show a "Thin sample" pill when a generation has fewer than 30 dealer sales in the window.
5. **Value my car** tool (section 5).
6. Monthly price trend, one line per generation, hover crosshair.
7. Price vs mileage scatter: dealer sales as dots, auction sales as diamonds, plus a mileage-band table.
8. By model year table, color premium table, top states.
9. Auction results: auction vs dealer comparison by generation (count, medians, gap) and a list of results linking out to the source listing. Reserve-not-met rows show the high bid with a "High bid, no sale" tag and never count as sales.
10. Recent dealer sales.
11. Generation guide.
12. Methodology footer stating sources, date ranges, exclusions, and limits.

Design system: follow the prototype (Archivo, Instrument Sans, IBM Plex Mono; light and dark themes via CSS tokens; hand-built SVG or a light chart library; tabular numbers). Mobile first: no horizontal page scroll at 360px.

SEO: server-render each model page with real numbers in the HTML, a descriptive title and meta description, and `Product`/`Dataset` structured data where appropriate. URL pattern `/porsche/911-gt3-rs` with generation as a query param or sub-path.

---

## 5. Value my car: the engine

Put this in one pure, tested module (for example `lib/valuation.ts`) that takes inputs plus market data plus config and returns outputs. The page and any API route call the same function. Every number below comes from `valuation_config`, not code.

### Inputs

generation, model year, miles, packages (Weissach where offered), color class (`std`, `spec`, `pts`), condition (`ex`, `good`, `fair`), history (`clean`, `acc`).

### Step 1: base market value

- **Generations with 30 or more dealer sales in the trailing window:** fit `ln(price) = a + b × ln(miles + 250)` by least squares on non-excluded dealer sales. `base = exp(a + b × ln(miles + 250))`. Store the residuals' 25th and 75th percentiles (`q25`, `q75`) for the range.
- **Thin generations:** use the model-year median if that year has at least 5 sales, otherwise the generation median. Adjust for miles with `base = median × ((miles + 250) / (median_miles + 250)) ^ -0.06`. Range multipliers are 0.80 and 1.20, and the page shows the thin-sample warning plus "get an appraisal".
- Special cases live in config as overrides. Example: a 2011 997.2 is priced off 2010 cars, with a note that the RS 4.0 (600 built, $600k and up) needs a specialist appraisal.

### Step 2: adjustments (multiplicative)

| Key | Default | Notes |
|---|---|---|
| `adj.package.weissach.992` | +3% | Most 992 sales already carry it, so the curve includes much of the premium |
| `adj.package.weissach.991.2` | +6% | |
| `adj.color.spec` | +6% | Shark Blue, Lizard Green, Python Green, Voodoo Blue and similar |
| `adj.color.pts` | +12% | |
| `adj.condition.good` | -6% | |
| `adj.condition.fair` | -15% | |
| `adj.history.acc` | -18% | |

`market_value = base × Π(1 + adj)`. Range: `market_value × exp(q25)` to `market_value × exp(q75)` (or the thin multipliers).

These are starting assumptions. Phase 4 replaces them with measured values once enough tagged sales exist.

### Step 3: channel outcomes

**Online auction**
- `auction_gap` = (median auction hammer − median dealer price) / median dealer price for the generation, over the trailing 12 months of sold results. If fewer than 3 auction sales, use `auction.gap_default` = -8%.
- `expected_hammer = market_value × (1 + auction_gap)`; range uses the same range multipliers.
- `suggested_reserve = expected_hammer × 0.93` (`auction.reserve_pct`).
- Buyer's fee (display only, paid by buyer): Bring a Trailer and Cars & Bids charge 5% of the winning bid, $250 minimum, $7,500 cap. Keep these in config because platforms change them.
- `auction_net = expected_hammer − listing_fee (349) − prep (1,500)`.
- Time to cash: "about 3 to 6 weeks".

**Sell to a dealer**
- `dealer_margin = 0.08 + 0.001 × median_days_to_sell + (thin ? 0.04 : 0)`.
- `dealer_offer = market_value × (1 − dealer_margin)`; show a range of 97% to 102% of that.
- `dealer_net = dealer_offer`. Time: a day or two.

**List it yourself**
- `asking = market_value × 1.04`, `likely_sale = market_value × 0.99`, `private_net = likely_sale − 1,000`.
- Time: at least 2 × median days to sell.

### Step 4: recommendation

In order:
1. If condition is `fair` or history is `acc`: recommend **Sell to a dealer**, with the explanation that auction bidders punish disclosed issues.
2. Else if `auction_net − dealer_net > max(5,000, 3% of market_value)`: recommend **Auction it**, stating the extra dollars, the reserve and the expected hammer.
3. Else: recommend **Sell to a dealer**, stating how little extra an auction would net and the no-sale risk.

"List it yourself" is always shown but never the headline recommendation.

All money outputs round to the nearest $500. Every output screen ends with "This is an estimate, not an offer."

### Step 5: comparable sales

Show up to 7 comps nearest by miles: up to 4 auction results (sorted first by matching package flag, then by mileage distance, each linking to the source) plus the closest dealer sales, re-sorted by miles.

### Worked example for tests (prototype data as of Sep 19, 2026)

2026 992, 1,500 miles, no Weissach, standard color, excellent, clean:
- market value $486,500, range about $427,000 to $559,500
- 992 auction gap -3% (4 sales), expected hammer $472,000, reserve $439,000, auction net $470,000
- dealer margin 9.6% (16 median days to sell), offer $440,000
- asking $506,000, likely sale $482,000, private net $481,000
- recommendation: Auction it (+$30,500 over dealer)

Same car with "Accident reported": market value $399,000, recommendation Sell to a dealer.

Unit tests should use a frozen fixture of the prototype's dataset so these numbers are reproducible, plus synthetic cases for the thin-sample path, the fewer-than-3-auctions fallback, and each recommendation branch.

---

## 6. Phases

1. **Foundation:** schema, model/generation seed for the Porsche 911 GT3 RS, Visor and OCD clients, raw storage, nightly job, cleaning, aggregates. Dry-run and cost-cap flags.
2. **Model page:** port the prototype into the site's framework reading from the database. Pixel-close in light, dark and mobile.
3. **Valuation engine and tool:** the module, tests, the UI, `valuation_request` logging, and an API route `POST /api/valuation` that returns the same outputs.
4. **Measure the assumptions:** once 200+ auction results and package-tagged dealer sales exist for a generation, estimate package, color and condition premiums by regression on the residuals and write them to `valuation_config` (with a review step before they go live). Add a monthly back-test: for every auction that closed, compare our pre-sale estimated hammer to the actual; report median absolute error by generation.
5. **More models:** a make/model/generation admin screen, alias management and an outlier review queue, so adding a model is data entry, not code. Index pages by make and a search box.
6. **Optional, business decision first:** "Get a real offer" lead capture on the dealer card, routed to our buying team, with clear consent language.
