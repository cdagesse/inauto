# Data pipeline

Nightly job that fills the market tables from Visor (dealer listings) and Old Cars Data (auction results). Pages never call a third-party API; they read only what this job wrote.

## Flow

`runNightly()` in `src/jobs/nightly.ts`, per model that has at least one `model_alias` row:

1. **Pull**: Visor sold listings for the last 2 days (overlapping) and today's active listings; Old Cars Data auctions since the newest `ended_at` we hold minus 2 days (first run: one year back). Every HTTP call first reserves one unit of the source's monthly budget, then stores the raw response in `raw_fetch` (status, rate-limit headers, body, row count, params with secrets stripped).
2. **Normalize** (`src/jobs/lib/normalize.ts`): alias rules map each source's make/model/trim spellings to our model; generation is assigned from model year using `generation.year_start/year_end`; where two generations share a year the row is matched against a pattern stored as `notes = "match:<regex>"` on the generation, and flagged `needs_review` if that does not settle it. Packages (Weissach, Touring, Manthey, RS 4.0) and paint-to-sample are detected from trim/title/color text.
3. **Dedupe**: inserts use `ON CONFLICT DO NOTHING` on `dealer_sale.source_listing_id`, `dealer_active (source_listing_id, snapshot_date)` and `auction_result (source, source_id)`. A car sold on two platforms is two rows; an RNM that later sells is two rows.
4. **Clean** (`src/jobs/lib/clean.ts`): rows get `excluded_reason` instead of being deleted. `incomplete` (no price or miles), `likely_mislabeled` (rule table `MISLABEL_RULES`, e.g. 2016 delivery-mile "GT3 RS" at 911 R money), `outlier_price` (outside 0.4×–2.5× the generation's trailing-180-day dealer median). `manual` marks are never overwritten.
5. **Aggregate**: `market_daily` gets one row per generation × channel × day: n, median, p25, p75, median miles. Dealer uses the trailing 180 days of non-excluded sales; auction uses trailing 12 months of sold results.
6. **Check** (`src/jobs/lib/check.ts`): warns (never blocks) when a median moved >15% day over day, more than 25% of rows are excluded, or the row count fell.

Each run writes a `job_run` row with a JSON summary and any errors.

## Running it

| Where       | How                                                                                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel cron | `vercel.json` schedules `GET /api/jobs/nightly` at 08:15 UTC. Vercel sends `Authorization: Bearer $CRON_SECRET`; the route compares in constant time and returns 401 otherwise, 503 if the secret is not set. Append `?live=1` to force a live run regardless of `JOBS_DRY_RUN`. |
| Locally     | `pnpm jobs:nightly` (dry run) or `pnpm jobs:nightly --live`. Reads `.env.local` through dotenv.                                                                                                                                                                                  |

`maxDuration` is 300 s; if pulls grow past that, split the route per model or move it to a queue.

## Dry run

`JOBS_DRY_RUN` defaults to true. A dry run spends **no** API calls and writes nothing to `dealer_sale`, `dealer_active`, `auction_result` or `market_daily`. It still runs clean → aggregate → check over what is already in the database and reports what a live run would change, so you can validate rules without burning the Old Cars Data quota. It always writes a `job_run` row.

## Environment

| Var                                                    | Purpose                                                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `VISOR_API_KEY`, `VISOR_MONTHLY_BUDGET` (default 2000) | Visor key and monthly call cap                                                                                                            |
| `OCD_API_KEY`, `OCD_MONTHLY_BUDGET` (default 10)       | Old Cars Data key and monthly call cap. The free plan allows 10 searches/month and 20 rows/search; a paid plan is required before launch. |
| `CRON_SECRET`                                          | Protects the cron route. Set in Vercel; it is passed automatically to cron invocations.                                                   |
| `JOBS_DRY_RUN`                                         | `true` (default) or `false`                                                                                                               |

Keys are read only in `src/env/server.ts` (server-only) and passed to the clients by the job. They never reach a page, a client bundle, a log line or a stored URL (`redactUrl` / `redactParams`).

## Budgets

`api_budget (source, month, calls_used)` is incremented with one atomic `INSERT … ON CONFLICT DO UPDATE … WHERE calls_used < cap … RETURNING`, so two overlapping runs cannot both take the last unit. When the cap is hit the source client throws `BudgetExceeded` before making the request; the job records it in the summary (`budgetStopped`) and continues with the other source/model. A failed request still consumes its unit.

Pagination is also capped (`maxPages`) so a bad response shape cannot page forever.

## Adding a model

Data entry, no code:

1. Insert `make` and `model` rows, and one `generation` row per generation with `year_start`/`year_end` (and `notes = "match:<regex>"` if two generations share a model year).
2. Insert `model_alias` rows, one per source: e.g. Visor `raw_make=Porsche, raw_model=911, raw_trim_pattern=%GT3 RS%`; Old Cars Data `raw_make=Porsche, raw_model=911 GT3 RS`.
3. If the model has a known mislabel pattern, add a rule to `MISLABEL_RULES` (to move to `valuation_config` in phase 5).
4. Run `pnpm jobs:nightly --live` once, then review rows with `needs_review = true`.

## Licensing gate (do not skip)

Before any market page is public, confirm in writing that Visor's and Old Cars Data's terms allow displaying their data, including individual listing rows and outbound links, on a public commercial site. Until then keep pages behind login or `noindex`.

## Open TODOs

- **Verify both API schemas.** The request/response shapes in `src/lib/sources/visor.ts` and `src/lib/sources/ocd.ts` are documented assumptions (endpoint paths, auth header name, paging fields, row field names). Check Visor's docs and `https://api.oldcarsdata.com/openapi.json`, then adjust the clients and the fixtures in `tests/unit/sources-normalize.test.ts`. The normalizers are tolerant of several field spellings, but paths and auth must be right.
- `dealer_active` currently gets a snapshot per day; add a retention job before it grows unbounded.
- Move `MISLABEL_RULES` and the outlier multipliers into `valuation_config`.
