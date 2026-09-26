-- Append-only event log of Top-20 companies' Form 8-K filings (material-event
-- disclosures), fetched from SEC EDGAR on the existing 15-minute
-- market-hours-gated refresh cycle (src/lib/sec-edgar.ts, src/lib/refresh.ts).
-- Keyed by SEC's own accession number, not by symbol — this is the same
-- per-event shape this project's existing `news` table uses, not the
-- per-symbol "current state" shape `fundamentals` uses, because a historical
-- filing must never be silently overwritten the way an upserted cache row
-- would lose it.
--
-- Only form = '8-K' rows are ever written (filtered at ingest time in
-- refresh.ts) — every other form type (Form 4/144 insider-trading notices,
-- 10-Q/10-K, proxy statements) is discarded before it reaches this table.
-- item_codes stores every SEC item code on the filing unfiltered — no
-- "which ones matter" allow-list; the Today's Story prompt does that
-- judgment at generation time, not ingestion.
CREATE TABLE sec_filings (
  accession_number TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  form TEXT NOT NULL,
  filing_date DATE NOT NULL,
  item_codes TEXT NOT NULL DEFAULT '',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sec_filings_symbol_date ON sec_filings (symbol, filing_date);

ALTER TABLE sec_filings ENABLE ROW LEVEL SECURITY;

-- Same rolling ~370-day window as daily_closes (0010), for the same reason:
-- Today's Story only ever looks at "today", so older filings are pure growth
-- with nothing left to consume them. Rides the existing prune_old_data()
-- schedule (0007) with the same never-empty-the-table guard (0008) every
-- other retention-pruned table here already has.
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
END;
$$ LANGUAGE plpgsql;
