# US TechMarket

**A daily intelligence app for 20 US technology stocks. It answers one question per stock, once a day: *what happened to this stock today?***

**Live: [ustechmarket.vercel.app](https://ustechmarket.vercel.app)** — no sign-up, nothing to install.

---

## What it does

Most market apps hand you a chart, a price and a news feed and leave you to assemble the answer. This one does the assembling: it watches a fixed universe of 20 US technology stocks, collects price, volume, news and events for all of them on a schedule, filters out what is mis-tagged, and writes a summary per stock after the US market closes.

There are three surfaces:

| | |
|---|---|
| **Home** | Five market index cards, your watchlist as a table with a Significant/Normal badge per stock, the day's top movers ranked, and a three-article news teaser. |
| **News** | Every article collected, split into All / Company / Industry / Market, filterable by day, each with an AI-written 2–3 line summary and a link to the original. |
| **Today's Activity** | One page per stock: five stat cards, the AI daily summary, an intraday price-and-volume chart, a reconstructed timeline of the session, and the next earnings date. |

Your watchlist (1–10 stocks, 7 by default) lives in a cookie in your own browser. There are no accounts.

## The part that is actually interesting

### The AI is forbidden from doing the thing every competitor does

Products in this category compete on explaining **why** a stock moved and **what comes next**. This one is structurally prevented from doing either. The summary describes what happened; it never asserts a cause the source material does not state, never predicts, and never advises.

That is not a line in a prompt hoping to be obeyed. The narrative is generated as **three separate fields** — `movement` (price and volume, no news), `recap` (news, no price), and `explanation` (the only field allowed to link them) — because a single-prompt narrative reliably invented causation the sources never claimed. One measured example, before the split:

> *"Apple's stock price increased **as** Norway's sovereign wealth fund disclosed a position"*

Nothing in the source claimed that link. Listing banned phrasings did not stop it, because *"does the source state this?"* is a judgement the model makes generously. Splitting the fields did: the fixed fallback line — *"The available information does not establish a clear explanation for this movement."* — went from rarely used to used on 7 of 10 stocks, with the other 3 traced to reports that genuinely made the claim.

Every number in a summary is passed in pre-computed. The model states figures; it never derives them.

### Your visit never touches a metered API

Every data/AI call — Finnhub, Yahoo, Gemini, Groq and OpenRouter — comes from a scheduled server-side job. Pages read cached Postgres rows only; two visitors on the same page cost zero AI calls between them.

This is enforced mechanically rather than by convention: importing an upstream client from a page or component **fails lint**, and the ingestion endpoint checks a shared secret and fails closed.

Gemini's measured limit is **20 requests/day/project**. It now handles AI Daily Summary only, normally four successful batches for Top 20 with up to 12 scheduled attempts. Free Dots via OpenRouter handles News blurbs, capped at 50 articles per attempt with reasoning disabled. This account currently has 50 free requests/day shared across models; the documented rate limit is 20 requests/minute. The proposed 12-cycle schedule uses 12 requests/day for a theoretical ceiling of 600 blurbs, subject to provider availability and pending articles staying in the fetch window. It is stored in code and has not been applied to live cron. News and market aggregates cover 43 stocks; deep stock analysis stays Top 20.

### A failed read is not an empty table

Every read used to destructure `{ data }` alone — the string `error` did not appear in the query layer at all. supabase-js reports a failure as `{ data: null, error }` rather than by rejecting, so one network blip arrived as `data: null` and the call site collapsed it to `[]`. A failed read was indistinguishable from an empty table.

The 60-second read cache is what turned that into a reported bug rather than a bad second: **one transient failure was written into the cache and served to every visitor for at least a minute.** The symptom was sparklines and prices intermittently missing, which reads exactly like an upstream outage. It was not one — the database held all 675 of that session's rows the whole time.

So reads now either return rows or **throw**, through `src/lib/db-read.ts`: a bounded retry on a fresh `AbortSignal` per attempt, a 2s timeout where there had been none, and a row-count check that refuses to hand back a silently truncated page. Throwing is the mechanism, not the side effect — `unstable_cache` writes no entry for a rejected promise, so a wrong answer can no longer become a durable one. It must not "degrade gracefully" back to `[]`.

That check then caught a real one. PostgREST caps a response at 1000 rows; the News date picker was reading `published_at` from **every article in the table** just to collapse it into a list of days, and at 1402 rows it crossed the cap and took the page down visibly instead of quietly rendering a short picker. The fix was to stop reading rows to answer a question about days — a `news_days()` SQL function returns 8 rows instead of 1402, bounded by the retention window rather than by how busy the news day was.

### It survives its upstreams failing

Simulated by pointing the app at a dead Finnhub key so every request 401s. The refresh job returned HTTP 200 with `prices: 0, failed: [all 25]` — and, more importantly, **wrote nothing**: the cached prices and 1,346 intraday snapshots were untouched. All three pages still rendered the last good data. A total upstream outage cannot reach a visitor, because a visitor was never connected to an upstream.

The scheduled cleanup is guarded the same way. Supabase pauses a free-tier project after about a week of inactivity, and cron pauses with it — so on resume a naive 7-day prune would find *every* row older than the window and delete all of them. Each `DELETE` carries a guard that leaves the last surviving data in place, so the job trims history but can never empty a table.

## How it looks

One theme, dark, no daylight counterpart: **a midnight sky with frosted glass over it.** The background is an authored night sky — 313 stars, two fractal filters, occasional meteors — rendered as a server component so none of it ships as client JavaScript, and every panel above it is a translucent plate that samples it.

The face pairing is a newspaper's rather than a terminal's: Source Serif 4 for prose, Inter for the interface, JetBrains Mono for every number. That is a claim about what the product is — it does not tick, does not trade and does not advise; its output is written, edited prose after the close, and terminal typography would misrepresent it by implying something is still moving.

Arrival is sequenced in two phases — the room first, then the instruments draw themselves in the direction of the session they plot — which keeps peak concurrency to five animation families on Home instead of seven starting at once. `DESIGN.md` carries the tokens and the named rules the whole interface is built from.

## How it is built

| | |
|---|---|
| **Frontend + backend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 |
| **Database** | Supabase (Postgres) |
| **Scheduling** | Supabase Cron (`pg_cron` + `pg_net`) — Vercel Hobby caps cron at once per day, which cannot deliver 15-minute snapshots |
| **AI** | Gemini for Daily Summary; Groq for Stories; free Dots via OpenRouter for News |
| **Hosting** | Vercel (`sin1`), with Vercel Web Analytics |

**Data sources.** Finnhub for prices, company news and the earnings calendar; Yahoo Finance's chart endpoint for today's volume, intraday bars and the official closing print (Finnhub's free tier serves neither, and its quote drifts into after-hours trading once the bell has gone); Brandfetch's Logo CDN for company marks, hotlinked under its licence — the one upstream a browser touches, because it is a static-asset host that cannot starve a metered quota.

**Schedule.** Price and volume snapshots every 15 minutes while the market is open; news eight times a day; summaries after the close; a retention sweep nightly. Market hours are evaluated in `America/New_York`, so the schedule survives daylight saving without editing a cron expression.

**Retention is seven days, and that is the product, not a stopgap.** This is a daily-intelligence tool, not an archive. Old rows are physically deleted, and the News page additionally floors its own reads at a whole ET day anchored on the newest stored day — so the window can never open onto a partial day whose article count shrinks on every reload.

**Performance.** Server-side median page time is ~93ms, down from ~1,450ms. Almost none of that came from tuning queries: a query returning one row cost the same as one returning 840, because the price is per *request*. The two fixes were pinning the functions to the same region as the database (`iad1` 260ms → `sin1` 155ms per request) and caching the read helpers for 60 seconds, well inside the 15-minute ingestion cadence.

**Keyboard.** `g h`, `g n` and `g a` jump between the three routes; each nav item declares its own shortcut in `aria-keyshortcuts`, so a screen reader announces it with the link. The watchlist menus are real ARIA menus: they take focus when they open, move on the arrow keys, and jump to a ticker as you type it (`n`, `v` → NVDA).

**Accessibility.** WCAG 2.1 AA. Contrast is measured against the *worst-case composite* — the frosted panels are translucent, so each surface is a range rather than a value, and every text pair is checked at the brightest point that range reaches. `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast` each get a designed alternative rather than a blanket switch-off.

**Widths.** Laptop, iPad and phone are all designed targets. Below 600px the watchlist table becomes a two-line list carrying all eight fields from the same format helpers as the cells, the two five-card grids run two-up, and the nav card collapses to one row. Measured clean — `scrollWidth === innerWidth` on all three routes at 390 / 430 / 600 / 768 / 834 / 1024 / 1130 / 1280 / 1470 / 1920.

## Running it locally

```bash
npm install
npm run dev          # http://localhost:3000
```

You will need a `.env.local` with Supabase, Finnhub, Gemini, Groq and OpenRouter credentials, plus a `CRON_SECRET`. Pages read Supabase; missing AI credentials leave that provider's output pending.

```bash
npm run build        # production build
npm test             # 84 unit tests
npm run lint
npm run migrate      # apply SQL migrations
npm run setup-cron   # provision the Supabase Cron schedules (idempotent)
```

**A warning if you do run it:** local and deployed point at the *same* Supabase project and, by default, the same Gemini key. Triggering an ingestion job by hand writes production rows and spends production's daily AI quota.

## Where things are

```
src/app/          routes: Home, News, Today's Activity, and 4 API endpoints
src/components/   UI, server components unless a file says "use client"
src/lib/          upstream clients, queries, the significance rule, AI prompts
supabase/         SQL migrations
scripts/          migrate + cron provisioning
assets/           the two fonts the link-preview image is drawn with
```

Three documents carry the reasoning behind the code, and they divide cleanly:

- **`CLAUDE.md`** — the technical and content contract. What must exist on each page, what was explicitly cut, and every decision that was reversed mid-build *with the evidence that reversed it*. If something in the code looks wrong, the reason is usually in here.
- **`PRODUCT.md`** — durable product truth: who it is for, what it promises, what it must never claim.
- **`DESIGN.md`** — the visual contract: tokens, type, material, and the named rules the interface is built from.

## Honest limits

- The market index cards are **ETF proxies** (QQQ, SPY, DIA, XLK, VIXY), because the free tier rejects real index symbols. `VIXY` tracks VIX *futures*, not VIX spot, and the interface says so.
- The universe of 20 is a **fixed list**, not a live market-cap ranking — no free endpoint provides one.
- Today's volume comes from an **unofficial Yahoo endpoint**. A failure there means "volume unknown", never an error page.
- **Nothing on screen is live.** Snapshots land every 15 minutes and reads are cached for up to 60 seconds, so you are looking at a recent state of the world rather than a ticking one.
- **Only seven days of history exist**, by design. There is no archive to browse and no way to look up a past session.
- There are **no users, no track record and no financial-services standing**. This is a student project that holds no money and executes no trades. Nothing in it is investment advice.
