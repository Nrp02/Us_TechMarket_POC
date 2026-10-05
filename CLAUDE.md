# US TechMarket — Instructions for Claude Code

> This file holds only what applies to every task. The reasoning and history behind each rule lives in `docs/history/` (index at the bottom) — open the relevant file before changing anything it covers. Rules here are locked with the project owner: if one seems wrong, flag it, don't silently deviate. Where docs and code disagree, the code wins; say so.

## Agent skills

- Issue tracker: local markdown under `.scratch/`. See `docs/agents/issue-tracker.md`.
- Domain docs: `CONTEXT.md` at the repo root. See `docs/agents/domain.md`.
- Code map: `docs/architecture.md` — read it before exploring the codebase.
- Visual contract: `DESIGN.md` (generated from code by `/impeccable document`). Product truth: `PRODUCT.md`. Architecture decisions: `docs/adr/`.

## What this is

An AI daily intelligence app for US tech stocks. One question per stock, per day: **"What happened to this stock today?"** No user accounts, $0 budget (free tiers only), optimised for a working deployable link — not scale.

Pages: **Market** (`/`, route group `(market)`), **Stocks** (`/todays-activity/[symbol]`), **News** (`/news`). There is no watchlist; it was removed (`bbad099`).

This file is the **content contract** (what data/features exist); `DESIGN.md` is the **visual contract**. A visual pass may recompose freely but must not add or drop a field, section or feature.

## Current scope (2026-09-26)

- 43 `TRACKED_STOCK_SYMBOLS` for news, breadth, movers, sector averages; refresh covers them plus six ETF proxies (QQQ, SPY, DIA, XLK, VIXY, SOXX). Deep analysis, fundamentals, SEC, peers: **Top 20 only**. `ALL_SYMBOLS` = Top 20 + ETFs.
- News filters: All + six sectors. Ambiguous tickers AI/F/ON/TEAM are never matched as ordinary words.
- Significance count is Top-20-only, and labelled so.
- News cron `7 0,2,4,6,8,10,12,14,16,18,20,21 * * *` UTC is **live** (`news-ingest`, running since 2026-09-29; it is the only source of News). Changing schedules, live ingestion and deploys are the owner's call.

## Stack

Next.js App Router + Supabase Postgres + Supabase Cron (`pg_cron`/`pg_net`, **not** Vercel Cron — Hobby allows once/day) + Vercel (functions pinned to `sin1`). TypeScript; add another language only for a significant benefit.

| Need | Source |
|---|---|
| Price, news, earnings calendar, avg volume | Finnhub free (60/min) |
| Today's volume, intraday bars, **official close** | Yahoo chart endpoint (failure = "unknown", never an error) |
| SEC 8-K metadata | EDGAR submissions, Top 20, `CIK_BY_SYMBOL` |
| Peers | hardcoded `PEERS` map, no live call |
| Logos | Brandfetch CDN, **hotlinked, never vendored** (licence) |

No paid tier anywhere. If a free endpoint can't deliver, stop and flag it.

## Locked rules

**Ingestion.** Every upstream call (Finnhub, Yahoo, SEC, any AI) runs from a scheduled server job behind `CRON_SECRET` (fails closed: 503 if unset). Pages read Supabase only, through `src/lib/queries.ts`. AI output is generated once per cycle and stored — never per visitor. Lint (`no-restricted-imports`) enforces this. Sole exception: Brandfetch logo images.

**Reads throw, never swallow.** Every read goes through `src/lib/db-read.ts`. A failed read must throw so `unstable_cache` (60s) doesn't cache "no data" for everyone. Never return `[]` on failure. PostgREST caps responses at 1000 rows — ask `count: "exact"` only when `.limit()` is the ceiling.

**Closing price** comes from Yahoo's 16:00 bar (`reconcileClose`), not Finnhub's quote, which drifts after hours. Don't "unify" a price mismatch without establishing which value is true.

**Significant Movement** — one shared rule, imported everywhere:
```
|change| ≥ 5%  OR  relVol ≥ 2.5x  OR  (|change| ≥ 3% AND relVol ≥ 1.5x)  → Significant
```

**Don't use `export const dynamic = "force-dynamic"`** — it disables the data cache.

## AI providers and budget

| Job | Provider / model | Limit |
|---|---|---|
| News blurbs | OpenRouter `dots-studio/dots-3-note-preview:free`, ≤50 articles/call | 50 req/day, 20/min |
| AI Daily Summary ("What Happened Today") | Gemini `gemini-3.5-flash` (not 2.5), batches of 5 → 4 calls/day | **20 req/day** per project |
| Today's Story + Market Story | Groq `openai/gpt-oss-120b`, one call per stock (effort set in `story-analysis-call.ts`) | 8,000 TPM, 200,000 TPD |

Batched or one-per-stock only; never per article or per interaction. No immediate retries — a 429 defers to the next scheduled run. Home makes zero AI calls.

**Testing keys:** local and production share **one Supabase DB** — a local job run writes production rows. `.env.local` holds deploy keys by default. Swap in the Gemini test key before manual Gemini runs; run Groq tests through `.scratch/narrative-audit/with-test-key.sh <cmd>`. Never commit a key.

## AI Safety / Data Integrity Rules

The product answers **"what happened"** — never "what happens next". The AI must never:
- invent news, events, timestamps, or numbers
- calculate new numbers (all figures are pre-computed and supplied)
- predict prices or trends
- give investment advice of any kind
- claim news caused a price move unless the source says so — **except in Today's Story and Market Story**, where grounded inference is allowed if every claim points to a figure or label in the structured input and no outside fact is introduced. News blurbs keep the strict rule.

A positive change narrated as a decline (or vice versa) counts as an invented number. When evidence doesn't explain a move, use the fixed fallback line rather than guess. Only GOOD example sentences go in prompts — a quoted BAD one gets copied.

**Story drafts are published, never rejected, for a check failure (owner, 2026-09-29)** — a prototype must have content every day, and rejections were burning the Groq quota. The prompts still forbid all of the above; the code checks now *record* instead of *block*: `sections.checks.shown` (a figure not in the input, a flat/sign error, "no earnings released", market-YTD comparisons) is displayed under the card as "Automated check: …"; `sections.checks.logged` (trend wording/placement) is stored only. A figure rounded from a supplied one (−2.98% → −3%) is not a violation. Only a missing section or unusable response remains pending for a later scheduled run. Stocks rotate by five-minute cron slot so failures cannot starve other stocks. There is no model-correction feedback or attempt ledger; checks run locally and consume no additional AI tokens. News blurbs keep strict batch validation.

## Verification

- `npm test`, `npx tsc --noEmit`, `npm run lint` (errors in untracked `.scratch/` are pre-existing).
- After deleting `.next`, run `npx next typegen`.
- Check a scheduled job in `net._http_response`, not `cron.job_run_details` (pg_net reports queued as success).
- Live site `https://ustechmarket.vercel.app` deploys from **`main`** only.
- Designed widths: phone, iPad, laptop. Owner tests on iPhone 12 / iPad gen 10.
- Error boundaries render client-side — verify in a browser, not curl. Brandfetch refuses curl and headless UA.

## History index — read before touching the area

| File | Covers |
|---|---|
| `docs/history/scope-and-stack.md` | Full current-scope notes, providers, design/content split |
| `docs/history/data-sources-and-ingestion.md` | Source table, ingestion rule enforcement, logo exception |
| `docs/history/serving-latency.md` | Region + cache measurements, the cached-empty-read bug, 1000-row ceiling |
| `docs/history/ai-call-budget.md` | Measured quotas, cron schedules, two Gemini keys, shared-DB caveat |
| `docs/history/reversed-decisions.md` | Today's Story, safety-rule loosening, SEC, Market Story charts, prompt rewrite, timeline, closing price, logos |
| `docs/history/resolved-and-open-items.md` | Retention/pruning, news pipeline drop bug, News date-picker outage, open items |
| `docs/history/execution-plan.md` | Original phases, responsive fixes, outage test, browser-automation traps |
| `docs/history/phase-4.5-watchlist.md` | Removed watchlist (history only) |
| `docs/history/phase-6-news-topics.md` | News Topics — in design, nothing built; resume the interview there |
| `docs/history/risk-register.md` | Risk register |
