-- One row per named macro series (CPI, unemployment, GDP, fed funds rate),
-- refreshed from FRED (src/lib/fred.ts) only when stale — this data updates
-- monthly at most, so a 15-minute refresh cadence would be pure waste; see
-- src/lib/refresh.ts. Feeds Market Story's macro-context section (ticket 07).
--
-- latest_value/prior_value let the narrative compare a release against its
-- own prior reading without a second query — FRED gives no consensus/
-- expectation figure, so that comparison is the whole of what this table
-- supports (see CLAUDE.md's Market Story macro-data note). Named latest_date
-- rather than current_date, which collides with a built-in Postgres function.
--
-- Excluded from prune_old_data(): same reasoning already recorded for
-- price_cache/events/fundamentals — a fixed ~4-row cache, always upserted,
-- never grows, so pruning it saves nothing and would just break Market Story
-- until the next stale refresh repopulates it.
CREATE TABLE macro_indicators (
  series_id TEXT PRIMARY KEY,
  latest_date DATE NOT NULL,
  latest_value NUMERIC,
  prior_date DATE,
  prior_value NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE macro_indicators ENABLE ROW LEVEL SECURITY;
