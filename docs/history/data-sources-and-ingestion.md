> Moved verbatim from CLAUDE.md on 2026-09-29 (commit 1dbde83). History and reasoning, not a summary of current behaviour: where this and the code disagree, the code wins.

## Data sources

| Need | Source | Note |
|---|---|---|
| Price, company news, earnings calendar | Finnhub (free tier, 60 calls/min) | Primary source for almost everything |
| **Today's traded volume + intraday bars** | Yahoo Finance `query1.finance.yahoo.com/v8/finance/chart` | **Finnhub's free tier cannot supply this** — see the reversal note below. Scoped to this one gap only; unofficial endpoint, so callers treat failure as "volume unknown", never as an error. |
| Average daily volume | Finnhub `/stock/metric` (`10DayAverageTradingVolume`, reported in millions) | Denominator for relative volume |
| Market index proxies — all five cards | Finnhub `/quote` on ETF symbols: `QQQ` (NASDAQ 100), `SPY` (S&P 500), `DIA` (Dow Jones), `XLK` (Technology), `VIXY` (Volatility) | Confirmed live in Phase 1. Real index symbols (`^VIX`, `^GSPC`, `^IXIC`) return "Market data subscription required for CFD indices". `VIXY` tracks VIX **futures**, not VIX spot — the UI must not imply otherwise. |
| Sector/Peers | Sector: XLK, above. Peers: a **hardcoded map** (`PEERS` in `src/lib/symbols.ts`, Top-20 symbol → 2–4 peer tickers, populated by a one-time manual lookup) | Used inside Today's Story's Peers stat card and comparison section, not a standalone page. **Not a live Finnhub `/stock/peers` call** — this row used to imply one; the Today's Story build (see "Decisions that were explicitly reversed") replaced it with the hardcoded map so peer comparison costs no extra upstream call per cycle |
| SEC 8-K filings (structured metadata only) | SEC EDGAR per-company submissions endpoint (`data.sec.gov/submissions/CIK##########.json`), free, no API key | **Reverses the "never built, and not owed" row this used to be** — see the reversal note under "Decisions that were explicitly reversed" for why this is a different decision, not scope creep against the cut SEC Filings tab. `src/lib/sec-edgar.ts`; ticker→CIK map hardcoded in `CIK_BY_SYMBOL` (`src/lib/symbols.ts`), sourced once from SEC's public `company_tickers.json` mapping file. |
| AI summarization | News blurbs: OpenRouter `dots-studio/dots-3-note-preview:free` (`src/lib/openrouter.ts`). AI Daily Summary: Gemini `gemini-3.5-flash`. Today's Story + Market Story: Groq `openai/gpt-oss-120b` | All free tier, batched or one-per-stock — see "AI call budget" below. Gemini is **not 2.5 Flash**, which returns 404 for new users; see the model reversal note below. |
| Company + Finnhub logos | Brandfetch Logo CDN (free to 500k req/month) | The one upstream the **browser** calls directly, and the only one that returns images rather than data. Hotlinked, never vendored — the licence caps caching at 30 days. See the logo note under "Decisions that were explicitly reversed". |

No paid tier anywhere. If a free-tier endpoint can't deliver something in this file, stop and flag it rather than substituting a paid one.

---

## Ingestion architecture — locked

**No client-triggered upstream API calls.** This is structural, not a preference, and it applies to every phase:

- Every external API call (Finnhub, Yahoo, Gemini) originates from a **scheduled server-side ingestion job**. Never from a page render, a component, a user interaction, or a page view.
- **Frontend pages read cached Supabase data only** — always through `src/lib/queries.ts`, never through an upstream client.
- **AI summaries are generated once per stock/data cycle and stored.** Never per visitor. Two visitors loading the same page cause zero AI calls between them.

How this is enforced:

| Mechanism | Where |
|---|---|
| Upstream clients isolated | `src/lib/finnhub.ts`, `src/lib/yahoo.ts` — only ever reached via an ingestion job |
| Ingestion behind a shared secret | `src/app/api/refresh/route.ts` checks `CRON_SECRET` and **fails closed** — a missing secret returns 503, never open access |
| Work skipped outside market hours | `isMarketOpen()` in `src/lib/market.ts`, evaluated in `America/New_York` so it survives EST/EDT |
| Schedules provisioned | `scripts/setup-cron.mts` (idempotent, re-runnable; reads secrets from `.env.local`, commits none) |
| Violations caught mechanically | `no-restricted-imports` in `eslint.config.mjs` — importing an upstream client from a page or component fails lint |

**One deliberate exception: company logos.** `src/lib/logos.ts` emits `cdn.brandfetch.io` URLs that the browser loads on every page view. This is outside the rule above rather than a violation of it, and the distinction is what the rule protects: metered quotas. Finnhub allows 60 calls/min and Gemini 20 requests/day, so page traffic reaching either would starve the ingestion jobs and there would be no way to buy more before a demo. Brandfetch's Logo CDN is a free static-asset host with a 500k requests/month allowance, returns images rather than data, and cannot exhaust anything the app depends on. It is also the only delivery method its licence permits — see the logo note under "Decisions that were explicitly reversed". Do not generalise this exception to anything that returns data.

A consequence worth knowing: adding a stock to the watchlist does **not** fetch anything. All 20 candidate symbols are ingested every cycle, so any stock the user can add already has cached data. Phase 4.5 extends the same reasoning to AI summaries — once each visitor keeps their own watchlist, every stock they *could* pick must already be summarised.

