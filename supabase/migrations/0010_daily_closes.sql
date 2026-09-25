-- One row per symbol per trading day, backing YTD/MTD period-performance and
-- (later) volatility-percentile calculations. Backfilled once for all 25
-- tracked symbols (ALL_SYMBOLS) from Yahoo's chart endpoint
-- (scripts/backfill-daily-closes.mts), then kept current by an ongoing write
-- inside the existing 15-minute refresh cycle once a session's closing print
-- is available (src/lib/refresh.ts) — no new upstream call either way.
CREATE TABLE daily_closes (
  symbol TEXT NOT NULL,
  trading_day DATE NOT NULL,
  close NUMERIC NOT NULL,
  change NUMERIC,
  change_percent NUMERIC,
  PRIMARY KEY (symbol, trading_day)
);
CREATE INDEX idx_daily_closes_symbol_day ON daily_closes (symbol, trading_day);

ALTER TABLE daily_closes ENABLE ROW LEVEL SECURITY;

-- 370 days, not 365: a YTD read taken in the first days of January still has
-- last year's final close available as a baseline. Rides the existing
-- data-retention-cleanup schedule (0007) rather than a new cron job, same
-- "never empty a table" guard 0008 added for the other four tables.
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
END;
$$ LANGUAGE plpgsql;
