# Finnhub

**Role:** primary source for price, company and market news, earnings calendar and average volume. Free tier, 60 calls/minute. Clients: `src/lib/finnhub.ts`, `finnhub-news.ts`, `finnhub-events.ts`. Called only from scheduled jobs.

## Endpoints used

| Endpoint | Used for | Notes |
|---|---|---|
| `/quote` | Price, change, change % | Unknown symbols return a zeroed payload, not an error, so `c = 0` is treated as no quote. **No volume field** |
| `/stock/metric` | 10-day average volume (denominator of relative volume), fundamentals | Average volume is reported in millions |
| `/company-news` | Per-symbol articles | The Stock News feed |
| `/news?category=general` | Market (no-ticker) news | The free tier has no technology feed: `category=technology` and `category=general` return identical article sets |
| `/calendar/earnings` | Next earnings date and call | Re-fetched on each end-of-day run, upserted to `events` |

## Not available on the free tier (probed at build time)

- `/stock/candle` (daily and intraday) → "You don't have access to this resource".
- Real index symbols (`^VIX`, `^GSPC`, `^IXIC`) → "Market data subscription required for CFD indices". Hence the ETF proxies QQQ, SPY, DIA, XLK, VIXY. `VIXY` tracks VIX **futures**, not spot; the UI must not imply otherwise.
- Volume in `/quote`. Today's volume comes from Yahoo instead ([yahoo.md](yahoo.md)).

## Behaviour and limits

- 10-second timeout per request; a non-OK response throws.
- Refresh runs with concurrency 5, which bounds workers, not requests per minute. A warm refresh uses about 49 quotes; a cold run that also fetches fundamentals can hit the minute quota, and the work is deferred to the next tick.
- The `/quote` price drifts after hours on liquid names, so the stored closing price is reconciled to Yahoo's 16:00 bar ([ADR 0005](../adr/0005-official-close-from-the-1600-bar.md)).
- Fundamentals are refreshed only when seven days stale; they change quarterly.

## Failure behaviour

A failing symbol is skipped for that tick and never overwrites a good row. A news fetch failure leaves the queue untouched; articles that were already stored stay queued for a blurb until written.
