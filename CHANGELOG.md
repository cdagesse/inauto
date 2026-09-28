# InAuto changelog

Features and fixes as they ship, newest first. One line per change, with the pull request.

## 2026-09-27

### Features

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

### Fixes

- Filter drawer "Show cars" did nothing: its form was nested inside the page's filter form (#36)
- Only 100 of ~1,600 live auctions were ever ingested: the client stopped after page one (#35)
- Admin Remove bar on listings never reached production (#24)
- Sticky header held empty space before the photo appeared (#40)
- Vitu sandbox: placeholder inquiry ids, object-shaped record fields, location id format (#28–#33)

### Known / waiting

- Vitu MVR sandbox returns placeholder id 999999 for every create; awaiting Vitu support on account provisioning
- Old Cars Data has no per-auction photo endpoint: one photo per auction
