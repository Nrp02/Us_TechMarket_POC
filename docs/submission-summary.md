# Submission summary

**US TechMarket — an AI daily-intelligence app for US technology stocks.**
Live: https://ustechmarket.vercel.app · Source: https://github.com/Nrp02/Us_TechMarket_POC · Status as of 2026-10-10.

## 1. What it does

For each of 43 US tech stocks it answers one question once a day: **"What happened to this stock today?"** Three pages: **Market** (indices, breadth, movers, a market-level story), **Stocks** (price and volume, intraday chart, event timeline, a plain AI account of the day, and an eight-card analysis for the Top 20), **News** (the day's articles with AI blurbs, filterable by sector). Seven Sessions are browsable. There are no accounts and it costs $0 to run.

## 2. The principle behind every decision

> The product describes what happened. It never predicts, advises, or states more than the evidence supports.

| Situation | Easier path | What was done |
|---|---|---|
| Quote drifts after the bell | Show the quote | Use the exchange's 16:00 bar; on 2026-08-21 NVDA read $214.75 against an official $214.72 ([ADR 0005](adr/0005-official-close-from-the-1600-bar.md)) |
| A database read fails | Return an empty list | Throw, so a blip is never cached as "no data" for everyone ([ADR 0004](adr/0004-failed-reads-throw.md)) |
| Visitors load a page | Call the APIs live | Pages read stored rows only; lint forbids otherwise ([ADR 0003](adr/0003-pages-read-the-database-only.md)) |
| The AI draft fails a check | Reject it | Publish it and show "Automated check: …" so every day has content ([ADR 0008](adr/0008-publish-stories-and-record-checks.md)) |
| Many places need "unusual move" | Re-implement per page | One shared rule imported everywhere ([ADR 0006](adr/0006-one-significant-movement-rule.md)) |
| Free quotas are tight | One big AI provider | Three providers with independent quotas, each budgeted ([ADR 0007](adr/0007-three-ai-providers-by-quota.md)) |
| A group of stocks falls together | Call each company-specific | Compare with sector and peers too ([ADR 0010](adr/0010-sector-wide-engine-label.md)) |

## 3. What is built

- **Ingestion:** five scheduled jobs on Supabase Cron — 15-minute snapshots, 12 news cycles a day, after-close summaries and stories, a cache warmer — plus daily retention.
- **Data:** 15 tables, 5 SQL functions, 23 migrations, seven-day retention that never empties a table.
- **Analysis engine:** deterministic significance, divergence, engine label, volatility percentile, recent trend, YTD/MTD, breadth ([analysis-engine.md](analysis-engine.md)).
- **AI:** news blurbs (OpenRouter), a plain daily account (Gemini), per-stock and market stories (Groq), all batched or one-per-stock, none per visitor.
- **Quality:** 268 automated tests in 43 files, strict TypeScript, and a lint rule that enforces the architecture.
- **Performance:** about 92 ms server median per page after a region move and a 60-second read cache, down from 1.2–1.5 s ([performance-and-reliability.md](performance-and-reliability.md)).
- **Process:** 139+ commits since 2026-08-14, ADRs, a measured-decisions history, and a risk register.

## 4. Engineering evidence worth checking

| Claim | Where to verify |
|---|---|
| Pages cannot reach upstream clients | `eslint.config.mjs`, `no-restricted-imports` |
| Reads throw on error or truncation | `src/lib/db-read.ts`, `db-read.test.ts` |
| Closing price is reconciled to the official bar | `src/lib/closing-price.ts` and its header comment |
| Job routes fail closed | `src/app/api/*/route.ts` (503 without `CRON_SECRET`) |
| Retention never empties a table | `supabase/migrations/0008_retention_keep_last.sql` |
| Quotas were measured, not assumed | `history/ai-call-budget.md` |

Run `npm test`, `npx tsc --noEmit` and `npm run lint` to confirm (lint errors only appear under the untracked `.scratch/` directory).

## 5. Honest limits

- Indices are ETF proxies (QQQ, SPY, DIA, XLK, VIXY), and VIXY tracks VIX futures, not spot.
- The universe is a fixed list; no free endpoint ranks by market cap.
- Volume comes from an unofficial Yahoo endpoint; failure means "unknown".
- Snapshots are 15-minute and reads cache 60 seconds; nothing is live.
- Only seven days of history exist.
- **The AI stories describe more than they analyse.** A review of 80 stories (2026-10-05 to 10-08) found most restate supplied figures, nearly all close with a stock "remains unresolved" line, and about one in seven contain forward-looking wording the prompt forbids and the checks do not catch. The engine label was found to mislabel group moves and was corrected on 2026-10-09 (`38690fe`). Remaining known gaps: the story job runs before some post-close explanatory news is published, and Market Story reads only general news.
- No users, no track record, no financial-services standing. This is a student project and nothing in it is investment advice.

## 6. Where to read next

[project-overview.md](project-overview.md) → [system-design.md](system-design.md) → [ai-architecture.md](ai-architecture.md) → [adr/](adr/).
