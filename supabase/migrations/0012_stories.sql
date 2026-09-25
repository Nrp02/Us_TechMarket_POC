-- Today's Story: the 8-section AI narrative that replaces the old 3-field
-- daily_summaries row on the page (ticket 05, not yet wired up). One row per
-- symbol per trading day, written by one Groq call per stock — see
-- src/lib/story-generation.ts.
--
-- `sections` is JSONB rather than 8 columns because the shape is exactly the
-- payload the page will read back (see StorySections in story-generation.ts)
-- and every section is prose or a small resolved object, never something a
-- SQL query needs to filter or aggregate on.
CREATE TABLE stories (
  symbol TEXT NOT NULL,
  story_date DATE NOT NULL,
  sections JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, story_date)
);
CREATE INDEX idx_stories_symbol_day ON stories (symbol, story_date);

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- Same 7-day window and never-empty guard as daily_summaries (0008) — this
-- table replaces it on the page, so it gets the same treatment.
CREATE OR REPLACE FUNCTION prune_old_data() RETURNS void AS $$
BEGIN
  DELETE FROM news
  WHERE published_at < now() - interval '7 days'
    AND EXISTS (
      SELECT 1 FROM news WHERE published_at >= now() - interval '7 days'
    );

  DELETE FROM intraday_snapshots
  WHERE snapshot_at < now() - interval '7 days'
    AND EXISTS (
      SELECT 1 FROM intraday_snapshots WHERE snapshot_at >= now() - interval '7 days'
    );

  DELETE FROM timeline_events
  WHERE trading_day < (now() - interval '7 days')::date
    AND EXISTS (
      SELECT 1 FROM timeline_events WHERE trading_day >= (now() - interval '7 days')::date
    );

  DELETE FROM daily_summaries
  WHERE summary_date < (now() - interval '7 days')::date
    AND EXISTS (
      SELECT 1 FROM daily_summaries WHERE summary_date >= (now() - interval '7 days')::date
    );

  DELETE FROM daily_closes
  WHERE trading_day < (now() - interval '370 days')::date
    AND EXISTS (
      SELECT 1 FROM daily_closes WHERE trading_day >= (now() - interval '370 days')::date
    );

  DELETE FROM stories
  WHERE story_date < (now() - interval '7 days')::date
    AND EXISTS (
      SELECT 1 FROM stories WHERE story_date >= (now() - interval '7 days')::date
    );
END;
$$ LANGUAGE plpgsql;
