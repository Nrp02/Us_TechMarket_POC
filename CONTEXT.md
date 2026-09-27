# US TechMarket

A daily intelligence app for US technology stocks that answers, per stock, "what happened to this stock today?"

## Language

### News

**Category**:
Which News page tab an article belongs to for a given visitor — company (touches their watchlist), industry (another Top 20 stock), or market (the general feed with no tickers). Derived per visitor, never stored.
_Avoid_: Topic, type

**Topic**:
What an article is about, such as Earnings or Product. One per article, assigned by the AI from a fixed set, and the same for every visitor.
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

**Recent Trend**:
The direction (uptrend/downtrend/no-clear-trend) and most recent confirmed
reversal point of a symbol's closing price over the trailing 10 trading
days — never a forecast of what happens next.
_Avoid_: Short-Term Trend, momentum, signal
