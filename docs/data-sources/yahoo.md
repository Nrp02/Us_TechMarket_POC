# Yahoo Finance chart endpoint

**Role:** the one gap Finnhub's free tier cannot fill — today's traded volume, intraday bars, and the **official close**. Client: `src/lib/yahoo.ts`. Called only from the refresh job.

## Endpoint

`https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=15m`, sent with a `User-Agent: Mozilla/5.0` header. It is an unofficial, undocumented endpoint with no key and no stated limits.

## What it supplies

| Data | Used by |
|---|---|
| Today's volume | Relative volume (volume ÷ 10-day average from Finnhub) |
| 15-minute bars | `intraday_snapshots`, sparklines, the intraday chart (snapped to a 15-minute grid so the live partial bar does not leave off-grid rows) |
| The 16:00 bar | The official closing price |
| Historic daily bars | One-off backfill of `daily_closes` (`scripts/backfill-daily-closes.mts`) |

## The closing-price finding

`range=1d` excludes pre- and post-market bars, so the 16:00 ET bar is the closing auction result and does not keep drifting. Measured against 2026-08-21, where `price_cache` was written at 16:15 ET: the Yahoo 16:00 bar matched the official daily close on 20 of 20 symbols, while Finnhub's quote matched 19 of 20 (NVDA read $214.75 against an official $214.72). `closing-price.ts` therefore prefers the bar once the session has produced one ([ADR 0005](../adr/0005-official-close-from-the-1600-bar.md)).

## Failure behaviour

Because the endpoint is unofficial, **a failure means "unknown", never an error**. Volume and relative volume are then absent; the app never reports them as "normal" or "low", and the AI prompt treats them as missing data. The refresh keeps the previous good rows.

## Risk

Yahoo can change or block the endpoint without notice. This is accepted for a free-tier build and is why every caller treats failure as "unknown" (`history/data-sources-and-ingestion.md`). If it breaks, volume and the close fall back to the Finnhub quote and relative volume becomes unknown.
