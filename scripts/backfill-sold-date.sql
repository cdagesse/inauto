-- One-time backfill: Visor's sold feed never sends sold_date, so every dealer_sale
-- row was stored with sold_date = null. The sale date is the day the car was listed
-- plus its days on market, capped at the day we fetched it. Idempotent: only touches
-- rows that are still null. Reverse with: update dealer_sale set sold_date = null;
-- (safe only while no row has a source-provided sold_date, which is the case today).
--
-- Run from the repo root:
--   psql "$DATABASE_URL_UNPOOLED" -f scripts/backfill-sold-date.sql
update dealer_sale
set sold_date = least(
  ((raw_json->>'listed_at')::timestamp
    + make_interval(days => greatest(coalesce(days_on_market, 0), 0)))::date,
  fetched_at::date
)
where sold_date is null
  and raw_json->>'listed_at' is not null;

select count(*) as total, count(sold_date) as with_sold_date, min(sold_date), max(sold_date)
from dealer_sale;
