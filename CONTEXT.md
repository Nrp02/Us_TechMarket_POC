# US TechMarket

A daily intelligence app for US technology stocks that answers, per stock, "what happened to this stock today?"

## Language

### Universe

**Top 20**:
The 20 stocks that get deep analysis: Today's Story, fundamentals, SEC
filings and peers. `TOP_20_SYMBOLS` in `src/lib/symbols.ts`.

**Tracked stocks**:
The 43 stocks (`TRACKED_STOCK_SYMBOLS`, the Top 20 plus 23 more) used for
news, breadth, top movers and sector averages. Six ETF proxies (QQQ, SPY,
DIA, XLK, VIXY, SOXX) stand in for indices and are refreshed alongside them.
_Avoid_: watchlist (removed), portfolio

**Significant Movement**:
The one shared rule for whether a move is unusual: |change| ≥ 5%, or
relative volume ≥ 2.5x, or |change| ≥ 3% with relative volume ≥ 1.5x.
Defined once in `src/lib/significance.ts`.
_Avoid_: big move, notable, alert

### News

**Category**:
Which News page tab an article belongs to: Stock (tagged with any tracked
ticker) or Market (the general feed, which carries no tickers). Derived from
the article's tags, never stored. Stock News can be narrowed by one sector.
_Avoid_: Topic, type

**Topic** (planned, not built):
What an article is about, such as Earnings or Product. One per article,
assigned by the AI from a fixed set. See `docs/history/phase-6-news-topics.md`.
_Avoid_: Category, news type, kind, tag

### Sessions

**Session**:
One US trading day (Monday to Friday, market open), named by its New York
date. Every figure, story and chart describes exactly one Session. A weekend
or holiday is never a Session: news published then is kept as prior context
for the next Session, but prices and closes are never dated to it. The News
page is the one place that lists every calendar day, weekends included; every
other page offers Sessions only.
_Avoid_: trading day (for a weekend date), today

**Live Session**:
The newest Session the stored data records — not the calendar date. Before
the open, over a weekend or on a holiday, the Live Session is still the last
one that traded.
_Avoid_: current day, today's date

### Analysis

**Today's Story**:
The per-stock AI analysis of one Session (Top 20 only), written once after
the close by one Groq call per stock and stored in `stories`.

**Market Story**:
The AI analysis of the whole tracked market for one Session, one Groq call,
stored in `market_stories`.

**AI Daily Summary**:
The plain per-stock account shown as "What Happened Today", written by
Gemini in batches of five and stored in `daily_summaries`. Describes; does
not interpret.
_Avoid_: Today's Story (a different card)

**Engine label**:
The pre-computed classification of a stock's move handed to Today's Story:
market-wide (within 2 points of SPY), sector-wide (2+ points from SPY but
within 2 of XLK or the peer mean), otherwise company-specific. A threshold
on gaps, not a finding about cause. `src/lib/movement-classification.ts`.
_Avoid_: driver, cause

**Recent Trend**:
The direction (uptrend/downtrend/no-clear-trend) and most recent confirmed
reversal point of a symbol's closing price over the trailing 10 trading
days — never a forecast of what happens next.
_Avoid_: Short-Term Trend, momentum, signal
