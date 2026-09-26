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

### Analysis

**Recent Trend**:
The direction (uptrend/downtrend/no-clear-trend) and most recent confirmed
reversal point of a symbol's closing price over the trailing 10 trading
days — never a forecast of what happens next.
_Avoid_: Short-Term Trend, momentum, signal
