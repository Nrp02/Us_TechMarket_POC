# FRED (Federal Reserve Economic Data)

**Role:** macro backdrop for Market Story, and the 10-year Treasury yield for Today's Story. Client: `src/lib/fred.ts`. Requires a free API key (`FRED_API_KEY`).

## Series

| Key | Series ID | Cadence |
|---|---|---|
| `cpi` | `CPIAUCSL` | Monthly |
| `unemployment` | `UNRATE` | Monthly |
| `gdp` | `GDPC1` | Quarterly (real GDP) |
| `fedFundsRate` | `FEDFUNDS` | Monthly |
| `tenYearTreasury` | `DGS10` | Daily |

Endpoint: `https://api.stlouisfed.org/fred/series/observations`. `fetchLatestTwo` returns the latest two non-missing observations, newest first, so the model sees both the latest and the prior value.

## Storage and freshness

One row per series in `macro_indicators` (migration 0014) holding latest and prior values and dates. The refresh job re-fetches a series only when stale: 12 hours for the daily `DGS10`, seven days for the rest. FRED marks holiday rows with `.`; those are skipped.

## Rules that protect the narrative

- A yield observed after the session being described is never used (a retried run the next day must not describe a session with a later reading).
- Rate series are shown with `%` so the figure check accepts them; before this, "4.1%" unemployment was rejected as an unsupplied figure.
- Macro readings are labelled with their release date. They are backdrop: the prompts tell the model that a release dated before the session does not establish that it moved prices.
- `FOMC_DECISION_DAY` is a stored flag from a static FOMC calendar (`fomc-calendar.ts`), not a FRED series, and is excluded from the macro list the model sees.

## Failure behaviour

A failed series keeps its previous row. If macro data is unavailable (for example in a historical replay), Market Story still generates and the prompt treats macro context as missing.
