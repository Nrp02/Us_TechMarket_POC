# Analysis engine

Everything numeric the AI reads is computed here first, in pure functions with no database import (so they are unit-testable). The model **states** these figures; it never derives them. `story-input.ts` composes the engines into one structured input per stock.

## Significant Movement

`src/lib/significance.ts`, imported by every surface (status badge, top movers, stock badge, Market Story count):

```
|change| ≥ 5%  OR  relVol ≥ 2.5x  OR  (|change| ≥ 3% AND relVol ≥ 1.5x)  → Significant
```

Relative volume is today's volume (Yahoo) over the 10-day average (Finnhub). When either is missing, relative volume is unknown and is never reported as "normal" or "low". The Top-20-only significance count is labelled as such ([ADR 0006](adr/0006-one-significant-movement-rule.md)).

## Divergence and peers

`peer-comparison.ts`:
- `vsSectorPercent` = stock − XLK, `vsMarketPercent` = stock − SPY, with a direction (`same`, `opposite`, `flat`). Null until the proxy has been fetched, mirrored rather than replaced by zero.
- `peerAveragePercent` = mean change of the stock's hardcoded peers (`PEERS` in `symbols.ts`) that have a cached price; `vsPeersPercent` = stock − that mean.

## Engine label

`movement-classification.ts` ([ADR 0010](adr/0010-sector-wide-engine-label.md)):

| Condition | Label |
|---|---|
| gap to SPY missing | `unknown` |
| gap to SPY < 2 points | `market-wide` |
| gap to SPY ≥ 2, but gap to XLK or to the peer mean < 2 | `sector-wide` |
| otherwise | `company-specific` |

It is a threshold on gaps, not a finding about cause; the prompt says so.

## Volatility and range

`volatility.ts`: the **magnitude percentile** ranks today's |change| against the stored history of daily changes, excluding today's own row. The **range position** is where the price sits within the trailing min/max of closes (a distance, not a percentile), with a label.

## Recent trend

`trend-detection.ts`, decided in [ADR 0001](adr/0001-closing-price-trend-detection.md): a fixed trailing 10-trading-day window of closing prices, strict 5-bar swings (two days either side), so a reversal needs two later sessions to confirm and today or yesterday cannot be a reversal. Output is a direction (`uptrend`, `downtrend`, `no-clear-trend`), a signed net window change and the age of the latest swing point. A named 1% cutoff handles windows with no confirmed swing. It is backward-looking only, never a forecast.

## Period performance

`period-performance.ts`: YTD and MTD from `daily_closes` and today's price.

## Fundamentals

`fundamentals.ts`: growth trend and earnings-surprise classification from stored figures. Missing fundamentals are unknown, never "no earnings were released".

## Market breadth

`market-breadth.ts`: advancers, decliners and coverage over the 43 tracked stocks (`computeBreadth`), sector averages (`computeSectorAverages`) and top movers (`computeTopMovers`). Coverage (for example 43 of 43) is disclosed in the Market Story.

## Timeline

`timeline.ts` and `timeline-rebuild.ts` turn snapshots, news and events into the day's ordered timeline, replaced atomically per day.

## Why pure

`lib/supabase.ts` builds its client at import and throws without environment variables, so any rule defined beside it cannot be loaded by the test runner. Keeping each engine free of that import is what lets `npm test` cover them ([testing-strategy.md](testing-strategy.md)).
