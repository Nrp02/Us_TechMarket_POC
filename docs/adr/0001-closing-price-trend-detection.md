# Recent Trend uses closing prices

Recent Trend uses a fixed trailing 10-trading-day window and strict 5-bar
closing-price swings (two trading days on either side), as selected in the
feature's research and design. `daily_closes` stores closes, not daily highs
or lows; `intraday_snapshots` is retained for only seven calendar days, so
it cannot supply this window. Using closes reuses already-loaded history
without a schema change, backfill, or new upstream call. Revisit this
simplification only if stored daily high/low columns become available.

The two-day confirmation lag deliberately excludes reversals today or
yesterday. The named 1% flat cutoff is a product judgment for a window with
no confirmed swing, not a universal technical-analysis threshold.
