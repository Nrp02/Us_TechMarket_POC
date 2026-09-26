-- Every ET trading day with a stored intraday snapshot, most recent first —
-- backs the historical date picker on Today's Activity/Stocks/Market
-- (ticket 05/06). Same shape as news_days() (migration 0009): a SQL
-- function rather than scanning rows in JS, so the read is bounded by the
-- retention window rather than by row volume.
CREATE OR REPLACE FUNCTION public.activity_days()
RETURNS TABLE (day date)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT (snapshot_at AT TIME ZONE 'America/New_York')::date
  FROM intraday_snapshots
  ORDER BY 1 DESC
$$;

NOTIFY pgrst, 'reload schema';
