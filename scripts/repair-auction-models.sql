-- One-off repair for auction rows written before matching became year-aware (PR #69).
-- Run once against the production database, e.g.
--   psql "$DATABASE_URL" -f scripts/repair-auction-models.sql
-- Everything runs in one transaction and prints the counts it changed.
--
-- 1. auction_result rows whose year falls outside their model's years move to the sibling
--    model (same Old Cars Data alias) whose years contain the car, narrowest span first.
-- 2. Rows still outside their model's years (no sibling fits) are removed: the alias matched
--    on make and line only, the year-aware nightly never stored them.
-- 3. Rows with no generation get a curated generation containing the year, else the model's
--    catch-all, and needs_review is recomputed as the source rule (non-USD).
-- 4. external_listing pointers get the same treatment: sibling if one fits, else unlinked.

BEGIN;

WITH mis AS (
  SELECT a.id AS row_id, a.year, a.model_id, al.raw_make, al.raw_model, COALESCE(al.raw_trim_pattern, '') AS kw
  FROM auction_result a
  JOIN model m ON m.id = a.model_id
  JOIN model_alias al ON al.model_id = m.id AND al.source = 'ocd'
  WHERE a.year IS NOT NULL
    AND ((m.year_start IS NOT NULL AND a.year < m.year_start) OR (m.year_end IS NOT NULL AND a.year > m.year_end))
), target AS (
  SELECT DISTINCT ON (mis.row_id) mis.row_id, s.id AS new_model
  FROM mis
  JOIN model_alias sa ON sa.source = 'ocd' AND sa.raw_make = mis.raw_make
    AND sa.raw_model IS NOT DISTINCT FROM mis.raw_model
    AND COALESCE(sa.raw_trim_pattern, '') = mis.kw AND sa.model_id <> mis.model_id
  JOIN model s ON s.id = sa.model_id
    AND (s.year_start IS NULL OR mis.year >= s.year_start)
    AND (s.year_end IS NULL OR mis.year <= s.year_end)
  ORDER BY mis.row_id, (COALESCE(s.year_end, 9999) - COALESCE(s.year_start, 0))
), moved AS (
  UPDATE auction_result a SET model_id = t.new_model, generation_id = NULL
  FROM target t WHERE a.id = t.row_id RETURNING a.id
)
SELECT count(*) AS auction_result_moved_to_sibling FROM moved;

WITH removed AS (
  DELETE FROM auction_result a USING model m
  WHERE m.id = a.model_id AND a.year IS NOT NULL
    AND ((m.year_start IS NOT NULL AND a.year < m.year_start) OR (m.year_end IS NOT NULL AND a.year > m.year_end))
  RETURNING a.id
)
SELECT count(*) AS auction_result_removed_no_model_fits FROM removed;

WITH pick AS (
  SELECT DISTINCT ON (a2.id) a2.id AS row_id, g.id AS gen_id
  FROM auction_result a2
  JOIN generation g ON g.model_id = a2.model_id
  WHERE a2.generation_id IS NULL
    AND (g.code = 'all' OR (a2.year IS NOT NULL AND a2.year BETWEEN g.year_start AND g.year_end))
  ORDER BY a2.id, (g.code = 'all')
), grouped AS (
  UPDATE auction_result a
  SET generation_id = pick.gen_id,
      needs_review = (a.raw_json->>'currency') IS NOT NULL AND (a.raw_json->>'currency') <> 'USD'
  FROM pick WHERE a.id = pick.row_id RETURNING a.id
)
SELECT count(*) AS auction_result_given_generation FROM grouped;

WITH mis AS (
  SELECT e.id AS row_id, e.year, e.model_id, al.raw_make, al.raw_model, COALESCE(al.raw_trim_pattern, '') AS kw
  FROM external_listing e
  JOIN model m ON m.id = e.model_id
  JOIN model_alias al ON al.model_id = m.id AND al.source = 'ocd'
  WHERE e.year IS NOT NULL
    AND ((m.year_start IS NOT NULL AND e.year < m.year_start) OR (m.year_end IS NOT NULL AND e.year > m.year_end))
), target AS (
  SELECT DISTINCT ON (mis.row_id) mis.row_id, s.id AS new_model
  FROM mis
  JOIN model_alias sa ON sa.source = 'ocd' AND sa.raw_make = mis.raw_make
    AND sa.raw_model IS NOT DISTINCT FROM mis.raw_model
    AND COALESCE(sa.raw_trim_pattern, '') = mis.kw AND sa.model_id <> mis.model_id
  JOIN model s ON s.id = sa.model_id
    AND (s.year_start IS NULL OR mis.year >= s.year_start)
    AND (s.year_end IS NULL OR mis.year <= s.year_end)
  ORDER BY mis.row_id, (COALESCE(s.year_end, 9999) - COALESCE(s.year_start, 0))
), moved AS (
  UPDATE external_listing e SET model_id = t.new_model, generation_id = NULL
  FROM target t WHERE e.id = t.row_id RETURNING e.id
)
SELECT count(*) AS external_listing_moved_to_sibling FROM moved;

WITH unlinked AS (
  UPDATE external_listing e SET model_id = NULL, generation_id = NULL
  FROM model m WHERE m.id = e.model_id AND e.year IS NOT NULL
    AND ((m.year_start IS NOT NULL AND e.year < m.year_start) OR (m.year_end IS NOT NULL AND e.year > m.year_end))
  RETURNING e.id
)
SELECT count(*) AS external_listing_unlinked FROM unlinked;

SELECT
  (SELECT count(*) FROM auction_result a JOIN model m ON m.id = a.model_id
     WHERE a.year IS NOT NULL AND ((m.year_start IS NOT NULL AND a.year < m.year_start) OR (m.year_end IS NOT NULL AND a.year > m.year_end))) AS still_misfiled,
  (SELECT count(*) FROM auction_result WHERE generation_id IS NULL) AS still_ungrouped;

COMMIT;
