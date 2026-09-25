# External auction listings

Live auctions from third-party platforms (Bring a Trailer, Cars & Bids, Sotheby's Motorsport, Hagerty, Barrett-Jackson, Bonhams, PCARMARKET, Collecting Cars) are shown on InAuto so buyers can compare them against our market data and order buyer-protection services. Bidding always happens on the platform: every external page has a prominent "View on <platform>" link that goes through `/go/{id}` (click logged, then a 302 to the platform's URL). The platform is named on every card and page (`SourceBadge`).

## Flow

1. `syncLiveAuctions` (`src/jobs/live-auctions.ts`, cron `/api/jobs/live-auctions` every 30 min) pulls `GET /auctions/live` from Old Cars Data inside the monthly OCD budget, stores each raw response in `raw_fetch`, and upserts `external_listing` on `(source, source_id)`.
2. Rows are matched to catalog models through `model_alias` (source `ocd`) and to a generation by model year (the placeholder `all` generation is skipped).
3. Listings past their end time are marked `ended`. When the nightly job later imports the result into `auction_result`, the reconcile step settles the listing to `sold` / `rnm` / `withdrawn` with the final price (`reconcileDecision` in `src/lib/sources/live.ts`).
4. `/listings` shows live external auctions after InAuto's own listings (source filter chips per platform); `/listings/ext/{source}/{sourceId}` is the detail page with an "InAuto read" (our valuation for the car's year and miles versus the current bid) and buyer-protection CTAs.

Dry run (`JOBS_DRY_RUN=true`, the default) makes no API calls; only the end-time and reconcile steps run. Trigger a real pull with `?live=1` on the cron route (bearer required). `?scope=catalog` pulls per catalog alias instead of one unfiltered pull.

## Assumptions to verify

The `/auctions/live` request and row shapes are verified against `https://api.oldcarsdata.com/openapi.json` (see the header of `src/lib/sources/ocd.ts` and docs/pipeline.md). `price` is the current bid, `stats.bids` the bid count, `auction_end_at` the end time, `featured_image_url` the only photo; `has_reserve` says whether a reserve exists, not whether it is met, so `reserve_met` stays null.

## Licensing and content

- Photos and descriptions belong to the platforms and their sellers. `EXTERNAL_PHOTOS` is off by default; external pages show a platform placeholder instead of hotlinked images until the platforms' terms (and Old Cars Data's redistribution terms) are confirmed in writing. Descriptions are shown as plain text when present; consider truncating or dropping them under the same review.
- External pages are `noindex, nofollow` and the outbound link carries `rel="nofollow noopener noreferrer sponsored"`.
- VINs are masked to the last 6 on our pages.
- Every external page states: "Listing details are provided by the platform; InAuto is not the seller. Bid and buy on the platform."

## Seed

`seedExternal` (`src/db/seed-external.ts`) loads the 18 real, ended GT3 RS auctions from the fixture. Live rows with fabricated bids are only inserted when `SEED_DEMO_LIVE=true` and are titled "(DEMO)"; a normal seed removes them.
