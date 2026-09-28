# UrCar changelog

Features and fixes as they ship, newest first. One line per change, with the pull request.

## 2026-09-28

### Features

- Ferrari 360 Challenge Stradale is its own catalog model, so a Challenge Stradale listing is read against Challenge Stradale results instead of ordinary 360s; hammer-based figures now rest on the last year of sales (or the latest five) rather than every sale on file, so an appreciating car reads at today's prices; the base 360 now pulls dealer data under Visor's real model name; `rematch-listings` gained `scope=all` with a `models=` filter that also moves auction results, for catalog splits like this one (#81)
- Link previews: a listing link shared in iMessage, Slack or social apps shows the car's photo and a one-line summary (year, make, model, miles, place, price and outcome); pages without a car photo show a UrCar preview card instead of nothing (#80)
- Past listings in Buy results show the date they sold or ended next to the outcome, without opening them (#79)
- Markets by region: the market section is now called Markets everywhere, and the Markets page opens with six US regions (Northeast, Southeast, South Central, Midwest, Mountain West, West Coast) showing dealer sales in the last 90 days, whether prices and volume are rising or falling against the 90 days before, days to sell, and which types of car are strongest and softest in each; every region has its own page with its types ranked, top makes, auction sales and states (#77)
- Market reports without dealer data yet read from auction results instead of showing zeros: the model page's KPI strip shows the median hammer price, range, 90-day change, sell-through and miles from sold auctions, the by-year table switches to hammer prices, dealer-only sections say so instead of rendering empty, the value tool prices the car from hammer prices lifted by the usual auction gap instead of showing $0 and NaN, and make and segment cards and tables show the median hammer, auction sales and an auction price trend for those models, labelled as such (#76)

- Dealer listings: cars for sale at dealers (from Visor) with photos, asking price, miles, dealer and location. A "Dealers" source on the Buy page, dealer cards alongside auctions whenever a make, model, trim or search narrows the list, a dealer listing page with a "View at dealer" link and the UrCar read, and a "For sale at dealers" section on every model report (#74)

- Buy page search box: type a year, make, model, trim or keyword and the list narrows as you type, best match first; typos are tolerated (trigram matching in Postgres) (#72)
- Buy page filters: Make, Model and Trim are dropdowns that follow each other, with trims taken from what is actually on the market for that model; the filter drawer no longer hides under the sticky header on phones or desktop (#72)

- Market reports for the whole catalog: the nightly Visor rotation now covers every published model, not only those with a report, and a model's report goes live after its first successful pull (a year of sales, capped at 2,000 rows per query); the Health headline counts new reports (#70)

- Old Cars Data refresh: live auctions sweep every 15 minutes (bids, end times, new listings), a new ended-results sweep every 6 hours for final prices on every platform, and the nightly no longer pulls auction results per model; Visor dealer data refreshes each model about every 14 days on a rotation held to a time cap and a nightly call allowance, so the nightly finishes inside the 5-minute limit; sweeps keep 20% of each API plan for report builds (#69)
- Auctions are matched to the catalog model whose years contain the car, so sibling models that share a name (Corvette C1 to C8, M3 and M3 E46, Supra generations) each get their own results; `scripts/repair-auction-models.sql` re-files the 649 rows written before and groups the 2,893 rows left without a generation (#69)

- Admin Health page: every job's status (healthy, overdue, failed, did not finish), what its last run added or updated, Visor and Old Cars Data monthly budget use and recent errors, data on hand, and a filterable run history with a detail page per run; close-auctions, report requests, title vetting, snapshots and the evidence sweep now record their runs (#68)

- Phones: home page opens straight on the search box and featured car; the headline and eyebrow are hidden (#55)

- The site is UrCar everywhere: titles, copy, sign-in, bill of sale, admin, crawler user agent; default site URL is ur.car (#54)

- Phones: Live/Past, result, type and source move inside the filter drawer; the Filter button is a bar pinned to the bottom of the screen (#53)
- New marbled UrCar logo, dark and light versions (#53)

- Phones: Buy page filters in two tight rows with a compact Filter button and smaller pills; source menu opens as a dropdown (#52)

- Phones: the light/dark toggle and Admin move into the menu panel; the bar keeps logo, garage, avatar and menu (#51)

- Phones: header logo keeps its shape; Garage and Admin collapse to icons (#50)

- Phones: hamburger menu in the header with Buy, Sell, Market reports, Buyer tools, Garage and search (#49)
- Phones: home hero drops the intro paragraph and hint so search and cars appear sooner (#48)
- UrCar logo in the header and footer, white wordmark in dark mode and dark wordmark in light mode (#46, wide versions #47)

- Mobile pass: home hero, Buy page header and source menu, car-page headers and sticky bar all fit a 390px phone (#45)

- Home page bottom shows "Segments at a glance" (median, 90-day move, sales, for sale, monthly volume, price index) instead of one featured report (#43)
- Home hero: larger photo with the controls under it, auto-cycles every 5 s, and mixes in the week's most-viewed cars ("Trending") after the admin picks; new per-day view counter (#42)

- Search suggestions in two sections, cars for sale first then market reports; Enter on a make opens its listings, "BMW M3" offers M3 listings and the M3 report (#41)
- Home page "Recently viewed" row from the cars the visitor opened in this browser (#41)
- Sticky site header on every page; Buy page filter row stays pinned under it (#40)

- Home page hero rotates through admin-featured cars; "Feature on home page" toggle in the admin bar on listing and auction pages; `/admin/featured` to manage the set (#39)
- Garage sections become tabs with counts; single Garage link with an icon; sun/moon theme toggle (#38)
- Listing and auction pages: sticky header, the car's photo slides in on scroll (#37)
- Buy page and listing headers condensed; sources in a dropdown; filter drawer fixed (#36)
- Auction listings show currency and country (e.g. £ prices with a GBP tag and 🇬🇧 United Kingdom) (#36)
- Auction pages show engine, transmission, drivetrain, colours, title status, seller type, known flaws, modifications, service and ownership history (#36)
- Sell picker offers one entry per base model (M3, not M3 (E30)); generation chosen from the year (#36)
- One-time backfill of every live auction (2,087) and 30 days of past sales (7,789) from Old Cars Data; Past view populated (#35)
- Old Cars Data plan raised to 10,000 calls/month; auctions reload once a day (#34)
- Admin VIN tester at `/admin/vitu` for Vitu title checks (#27)
- Title vetting through Vitu: NMVTIS vehicle history (brands, title history, junk/salvage) and MVR registered owner, lien and registration checks; buyer-facing title card (#23, #25–#33)
- Deploys run database migrations before the new code goes live (#22)

### Hardening and performance

- Purchase proof uploads are private: files land in a private blob path owned by the buyer, the purchase page serves them through a signed-in route, and a nightly sweep deletes blobs no purchase references after 48 hours (#64)
- Price guidance is computed on the server when a listing is created; the browser can no longer send its own guidance figures (#64)
- Accepting or declining a purchase runs in one transaction with the purchase and listing rows locked, so two responses cannot both mark the car sold (#64)
- Video previews in the purchase form show again (CSP now allows local media) (#64)
- Jobs: external auctions upsert in batches of 200 instead of one row at a time; Vitu calls time out after 15 s and only reads are retried; title vetting locks each order so two runs never process the same one; all seven cron routes share one secret check; `/api/health` reports why the database check failed (#63)
- One money formatter module for the whole app; dead exports, unused types and three unused packages removed; `pnpm lint:dead` (knip) finds dead code (#62)
- Buy page paging cursor handles auctions with no end time and old cursors fall back to page one; sign-in and admin "back" links only accept same-site paths; listing photos must come from UrCar uploads; every admin query checks admin first (#61)
- Cards and the home hero render real images through Next image optimisation; the first hero photo is marked high priority and the next slide is warmed before it shows; the filter drawer loads models only when opened; zod no longer ships to the browser (#60)
- Nightly job reads only the columns it needs and updates reclassified rows in batches; raw fetches older than 30 days, views older than 90 days and job runs older than 90 days are pruned; a failed snapshot write fails the build; market report pages revalidate together (#59)
- Branded error, not-found and last-resort error pages; a data outage during page regeneration is logged and keeps the last good page instead of a blank section (#58)
- Car pages read the listing once for the page and its metadata; the VIN timeline and market blocks stream in after the main content (#57)
- Database indexes for VIN lookups, model reports and the view counter (#56)
- `globals.css` deduplicated: duplicate valuation and sticky-header blocks and unreachable phone rules removed; the Buy filter row is sticky from 641px up (#66)

### Fixes

- Aliases that only exclude a word (488 but not Pista, 458 but not Speciale, WRX but not STI, AMG GT but not 63) were read as requiring that word, so those base models matched only the cars meant for their siblings; one- and two-character keywords ("R", "GP", "S/T") now match whole words, so "Convertible" and "Amethyst" no longer stand in for them (#81)
- Platform listings the feed tags by Porsche chassis code (996, 997, 991, 992, 930) now link to the catalog model, so their pages get the UrCar read and market data; a by-hand `rematch-listings` job re-links older unmatched listings, a listing page falls back to a by-name match for its read when the platform's tag did not link, the plain 911 Carrera alias no longer swallows Carrera GTS cars, and report builds pull the chassis-coded lines too (#79)
- Photos that will not load (a platform moved or removed the file after we stored its URL) no longer show a broken-image glyph: cards fall back to their placeholder or a "No photo" tile, galleries drop the dead photo and show the platform placeholder when none is left, and the sticky header hides its thumbnail (#78)
- Dealer listings: "listed now" reads each model's newest snapshot in one pass, days listed are aged from the snapshot day and the feed sorts by listing date, dealer search is indexed and typo-tolerant the same way as auctions, an exact model name no longer pulls in sibling models, Dealers with Auctions or Past explains itself, and partial Visor inventory walks no longer replace a model's newest snapshot (#75)
- Live auction sweeps were re-reading the same 500 most recently changed auctions every 15 minutes and never reaching new listings: the window is now one cron gap plus 5 minutes (was 45 minutes) with an 8-page cap, so each sweep finishes (#73)
- Build broke after the dead-export prune removed a type the purchase guidance change still used (#65)
- Outbound dealer link clicks were never recorded: the click logger called Clerk on a route outside its middleware (#57)
- Filter drawer "Show cars" did nothing: its form was nested inside the page's filter form (#36)
- Only 100 of ~1,600 live auctions were ever ingested: the client stopped after page one (#35)
- Admin Remove bar on listings never reached production (#24)
- Sticky header held empty space before the photo appeared (#40)
- Vitu sandbox: placeholder inquiry ids, object-shaped record fields, location id format (#28–#33)

### Known / waiting

- Vitu MVR sandbox returns placeholder id 999999 for every create; awaiting Vitu support on account provisioning
- Old Cars Data has no per-auction photo endpoint: one photo per auction
