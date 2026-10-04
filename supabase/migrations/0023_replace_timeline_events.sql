-- Replaces one symbol-set's trading day of timeline events in a single transaction.
-- The advisory lock serialises rebuilds of the same day: without it, two
-- overlapping callers can both delete, then both insert, and leave duplicates
-- (a DELETE in READ COMMITTED does not see rows the other transaction inserted).
CREATE OR REPLACE FUNCTION public.replace_timeline_events(
  p_symbols text[],
  p_day date,
  p_rows jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('timeline_events:' || p_day::text));

  DELETE FROM public.timeline_events
  WHERE symbol = ANY (p_symbols) AND trading_day = p_day;

  INSERT INTO public.timeline_events (symbol, trading_day, event_at, kind, label, detail)
  SELECT r.symbol, r.trading_day, r.event_at, r.kind, r.label, r.detail
  FROM jsonb_to_recordset(p_rows) AS r(
    symbol text, trading_day date, event_at timestamptz,
    kind text, label text, detail text
  );
END;
$$;
