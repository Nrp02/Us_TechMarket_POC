# Project overview

## The problem

A person who follows US technology stocks sees prices change all day and hundreds of news headlines, but rarely gets a short, grounded answer to "what actually happened to this stock today, and does it look unusual?" Products in this space compete on predicting what comes next. This product does not.

## What it is

An AI daily-intelligence web app with three pages:

| Page | Route | Answers |
|---|---|---|
| Market | `/` | How did the tech market do? Indices (ETF proxies), breadth, top movers, a Market Story, a news teaser |
| Stocks | `/todays-activity/[symbol]` | What happened to this stock? Price and volume, intraday chart, timeline, a plain AI account ("What Happened Today"), and the eight-card Today's Story |
| News | `/news` | What was published that day, with an AI blurb per article, filterable by sector |

Every figure, story and chart describes exactly one **Session** (one US trading day, named by its New York date). Older Sessions are reachable through a date picker; seven days are retained.

## Who it is for

Individual readers who want a daily briefing on US tech stocks. There are no accounts and no personalisation: every visitor sees the same data.

## Scope

- **Universe.** 43 tracked stocks drive news, breadth, movers and sector averages. The **Top 20** among them also get deep analysis: Today's Story, fundamentals, SEC filings and peers. Six ETFs (QQQ, SPY, DIA, XLK, VIXY, SOXX) stand in for indices. See `src/lib/symbols.ts`.
- **Budget.** $0. Every external service is on a free tier; if a free endpoint cannot deliver something, the rule is to stop and flag it rather than pay.
- **Goal.** A working, presentable, deployable link — not scale. Live at `https://ustechmarket.vercel.app`, deployed from `main`.

## Deliberately out of scope

| Not built | Why |
|---|---|
| Predictions, price targets, advice | The product answers what happened, never what happens next ([ai-architecture.md](ai-architecture.md)) |
| User accounts, a watchlist | Built, then removed on 2026-09-26 ([ADR 0009](adr/0009-remove-the-watchlist.md)) |
| Live (streaming) prices | Snapshots land every 15 minutes and reads cache for 60 seconds |
| A history archive | Seven days only, by design ([data-architecture.md](data-architecture.md)) |
| News Topics labelling | Designed, nothing built: `history/phase-6-news-topics.md` |
| Any paid tier | Hard constraint |

## How it was built

Phases 1–3 (foundation, Home, news pipeline) were committed on 2026-08-14. The repository has 139+ commits from 2026-08-14. The reasoning behind each major decision, including those later reversed, is in [history/](history/) and summarised as ADRs in [adr/](adr/).
