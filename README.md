# US TechMarket

**A daily intelligence app for US tech stocks. It answers one question per stock, once a day: *what happened to this stock today?***

**Live: [ustechmarket.vercel.app](https://ustechmarket.vercel.app)** — no sign-up, nothing to install.

---

## What it does

Most market apps hand you a chart, a price and a news feed and leave you to assemble the answer. This one does the assembling. It tracks 43 US technology stocks for news, breadth, movers and sector averages, and writes a per-stock account of the day for the 20 largest of them after the US market closes.

There are three pages:

| | |
|---|---|
| **Market** (`/`) | Index-proxy cards, market breadth, the day's movers, and sector averages. Makes no AI calls. |
| **Stocks** (`/todays-activity/[symbol]`) | One page per stock: price and volume figures, the AI daily summary, an intraday chart, the session timeline, and a *Today's Story* written from structured figures. Deep analysis, fundamentals, SEC filings and peers are Top 20 only. |
| **News** (`/news`) | Articles for the tracked universe, filterable by All plus six sectors, each with a short AI-written blurb and a link to the original. Ambiguous tickers (AI, F, ON, TEAM) are never matched as ordinary words. |

There is no watchlist and no user account. The site stores nothing per visitor.

## The part that is actually interesting

### The AI is forbidden from doing the thing every competitor does

Products in this category compete on explaining **why** a stock moved and **what comes next**. This one is built to do neither. Every piece of generated text describes what happened: it never invents news or numbers, never calculates new figures, never predicts, never advises, and never claims news caused a move unless the source says so.

The rule is enforced in the pipeline, not only in the prompt. Figures are computed before the model sees them, and the model states them rather than deriving them. Where the evidence does not explain a move, the output uses a fixed fallback line instead of a guess.

Today's Story and Market Story are the one place grounded inference is allowed: every claim must point to a figure or label in the structured input. Automated checks on those drafts record problems and display them as "Automated check" notes under the card. A failed check does not reject the draft, so every stock gets a story each day.

### Your visit never touches a metered API

Every upstream call — Finnhub, Yahoo, SEC EDGAR, Gemini, Groq and OpenRouter — runs from a scheduled server-side job. Pages read cached Postgres rows only, so two visitors on the same page cost zero AI calls between them.

This is enforced mechanically rather than by convention: importing an upstream client from a page or component **fails lint**, and every ingestion endpoint checks a shared secret and fails closed. The one exception is Brandfetch logo images, which are hotlinked from its CDN and never vendored.

### A failed read is not an empty table

supabase-js reports a failure as `{ data: null, error }` rather than rejecting, so a read that ignored `error` quietly became `[]`. Behind a 60-second cache, one transient failure was then served to every visitor for a minute, and it looked exactly like an upstream outage.

So every read goes through `src/lib/db-read.ts` and either returns rows or **throws**. Throwing is the mechanism: `unstable_cache` writes nothing for a rejected promise, so a wrong answer cannot become a durable one. PostgREST also caps responses at 1000 rows, so counts are requested explicitly only where a limit is the ceiling.

### It survives its upstreams failing

If the refresh job cannot reach a source, it writes nothing for that source and the pages keep rendering the last good data. A total upstream outage cannot reach a visitor, because a visitor was never connected to an upstream.

The scheduled cleanup is guarded the same way. Supabase pauses a free-tier project after about a week of inactivity, and cron pauses with it. On resume, a naive prune would find every row older than the window and delete all of them, so each delete leaves the last surviving data in place. The job trims history but can never empty a table.

### One significance rule, everywhere

A stock is marked **Significant** when any of these hold:

```
|change| ≥ 5%   OR   relVol ≥ 2.5×   OR   (|change| ≥ 3% AND relVol ≥ 1.5×)
```

The rule lives in one shared module and is imported everywhere it is used. The significance count covers the Top 20 only, and the page says so.

### Closing prices come from the exchange, not the quote

Finnhub's quote drifts after the bell, so the closing figure is reconciled to Yahoo's 16:00 bar. A price mismatch is not "unified" until it is established which value is true.

## How it looks

The visual contract lives in `DESIGN.md`, and the product truth in `PRODUCT.md`. The typography is a newspaper's rather than a terminal's: serif for prose, a sans-serif for the interface, and monospace for every number. The product is written, edited prose after the close, not a live terminal, and the type says so.

Designed widths are phone, iPad and laptop. Owner testing happens on an iPhone 12 and an iPad (gen 10), so layout bugs reported from those devices are the ones to take seriously.

## How it is built

| | |
|---|---|
| **Frontend + backend** | Next.js (App Router), React, TypeScript, Tailwind CSS |
| **Database** | Supabase (Postgres) |
| **Scheduling** | Supabase Cron (`pg_cron` + `pg_net`). Vercel Hobby cron runs only once a day, which cannot deliver intraday snapshots |
| **AI** | Gemini for the AI Daily Summary; Groq for Today's Story and Market Story; OpenRouter (free tier) for News blurbs |
| **Hosting** | Vercel, functions pinned to `sin1` (Singapore), next to the database |

Every model call stays within a free-tier limit, and no paid tier is used anywhere. Batched or one-per-stock calls are the rule; a 429 defers the work to the next scheduled run rather than retrying immediately.

**Data sources.**

| Need | Source |
|---|---|
| Price, company news, earnings calendar, average volume | Finnhub (free tier) |
| Today's volume, intraday bars, official close | Yahoo Finance chart endpoint — a failure means "unknown", never an error page |
| 8-K filing metadata | SEC EDGAR submissions, Top 20 |
| Peers | A hardcoded map, with no live call |
| Logos | Brandfetch CDN, hotlinked under its licence |

**Schedule.** Price and volume snapshots during market hours; the News ingest runs on a cron cadence of its own; summaries and stories are generated after the close, one stock per five-minute slot, so a failure cannot starve other stocks. Market hours are evaluated in `America/New_York`, so the schedule survives daylight saving without editing a cron expression.

**Retention is seven days, and that is the product.** This is a daily-intelligence tool, not an archive. Old rows are physically deleted, and the News page floors its reads at a whole ET day so the window never opens onto a partial day.

## Running it locally

```bash
npm install
npm run dev          # http://localhost:3000
```

You will need a `.env.local` with Supabase, Finnhub, Gemini, Groq and OpenRouter credentials, plus a `CRON_SECRET`. Pages read Supabase only; missing AI credentials leave that provider's output pending.

```bash
npm run build        # production build
npm test             # unit tests
npx tsc --noEmit     # type check
npm run lint
npm run migrate      # apply SQL migrations
npm run setup-cron   # provision the Supabase Cron schedules (idempotent)
```

**A warning if you do run it:** local and deployed point at the *same* Supabase project and, by default, the same AI keys. Triggering an ingestion job by hand writes production rows and spends production's daily AI quota. Swap in test keys before manual AI runs.

## Where things are

```
src/app/          routes: Market, Stocks, News, and the API endpoints for ingestion and AI
src/components/   UI, server components unless a file says "use client"
src/lib/          upstream clients, queries (queries.ts), db-read.ts, the significance rule, AI prompts
supabase/         SQL migrations
scripts/          migrate + cron provisioning
docs/             architecture, ADRs, and the history behind each reversed decision
```

Three root documents carry the reasoning, and they divide cleanly:

- **`CLAUDE.md`** — the technical and content contract: what must exist on each page, what was cut, and the rules that are locked. If something in the code looks wrong, the reason is usually in `docs/history/`.
- **`PRODUCT.md`** — durable product truth: who it is for, what it promises, what it must never claim.
- **`DESIGN.md`** — the visual contract: tokens, type, material, and the named rules the interface is built from.

## Honest limits

- The market index cards are **ETF proxies** (QQQ, SPY, DIA, XLK, VIXY), because the free tier rejects real index symbols. `VIXY` tracks VIX *futures*, not VIX spot.
- The universe is a **fixed list**, not a live market-cap ranking, because no free endpoint provides one.
- Today's volume comes from an **unofficial Yahoo endpoint**. A failure there means "volume unknown".
- **Nothing on screen is live.** Snapshots land on a schedule and reads are cached for up to 60 seconds.
- **Only seven days of history exist**, by design. There is no archive and no way to look up a past session.
- There are **no users, no track record and no financial-services standing**. This is a student project that holds no money and executes no trades. Nothing in it is investment advice.
