-- A past session's Relative Volume, as it stood that day. Written with the
-- close by the refresh job; price_cache holds only the latest session, so once
-- the next session starts there is nowhere else to recover either figure.
-- Nullable: rows written before this migration have no value, and a past day
-- without one reports Relative Volume as unknown rather than dividing by
-- today's average.
ALTER TABLE daily_closes ADD COLUMN IF NOT EXISTS volume BIGINT;
ALTER TABLE daily_closes ADD COLUMN IF NOT EXISTS avg_volume NUMERIC;

NOTIFY pgrst, 'reload schema';
