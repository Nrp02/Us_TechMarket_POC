-- One row per Top-20 symbol, refreshed only when missing or stale (7 days —
-- this data changes quarterly, so a 15-minute refresh cadence would be pure
-- waste; see src/lib/refresh.ts). Feeds the future "how has the business
-- changed" narrative section — not surfaced on any page yet.
--
-- Growth/margin fields come from the same Finnhub /stock/metric response
-- already fetched for avg_volume (previously discarded); earnings fields come
-- from a new /stock/earnings call, taking the most recent quarter.
--
-- Excluded from prune_old_data(): same reasoning already recorded for
-- price_cache/events — a fixed ~20-row cache, always upserted, never grows, so
-- pruning it saves nothing and would just break the future narrative until the
-- next stale refresh repopulates it.
CREATE TABLE fundamentals (
  symbol TEXT PRIMARY KEY,
  eps_growth_quarterly_yoy NUMERIC,
  eps_growth_ttm_yoy NUMERIC,
  revenue_growth_quarterly_yoy NUMERIC,
  revenue_growth_ttm_yoy NUMERIC,
  gross_margin_ttm NUMERIC,
  net_margin_ttm NUMERIC,
  latest_earnings_period DATE,
  latest_earnings_surprise_percent NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fundamentals ENABLE ROW LEVEL SECURITY;
