-- Market Story: the 8-section AI narrative for the whole market, one row
-- per trading day (not per symbol) — see src/lib/market-story-generation.ts.
-- Mirrors the `stories` table (migration 0012) exactly, one row shape
-- narrower: no `symbol` column, since this describes the market as a whole.
CREATE TABLE market_stories (
  story_date DATE PRIMARY KEY,
  sections JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE market_stories ENABLE ROW LEVEL SECURITY;

-- Same 7-day window and never-empty guard every other retention-pruned
-- table here has — this table rides the same schedule (0007), so its
-- DELETE joins the accumulated body of prune_old_data() alongside stories'
-- own block (0012).
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

  DELETE FROM sec_filings
  WHERE filing_date < (now() - interval '370 days')::date
    AND EXISTS (
      SELECT 1 FROM sec_filings WHERE filing_date >= (now() - interval '370 days')::date
    );

  DELETE FROM market_stories
  WHERE story_date < (now() - interval '7 days')::date
    AND EXISTS (
      SELECT 1 FROM market_stories WHERE story_date >= (now() - interval '7 days')::date
    );
END;
$$ LANGUAGE plpgsql;
