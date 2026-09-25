// Reconciling the live quote against the session's official closing print.
//
// Finnhub's /quote `c` is the last price it knows about, not the day's official
// close, and by the time the closing-window tick runs it has already picked up
// after-hours trading on the liquid names. Measured against ET day 2026-08-21,
// where price_cache was written at 16:15 ET: 19 of 20 stocks matched the
// official close exactly, but NVDA — the most actively traded after hours —
// read $214.75 against an official $214.72. The header and the AI summary both
// call that figure the closing price, so the app was stating something untrue.
//
// Yahoo's 16:00 bar is the closing print itself: it matched the official daily
// close on 20 of 20 symbols. `range=1d` does not include pre/post-market bars
// (verified — a Sunday fetch returns 27 bars ending at 16:00), so the bar is
// the auction result and does not keep drifting as after-hours trades land.
//
// Pure and free of any database import on purpose, the same reason news-select
// and watchlist keep their rules in their own modules: lib/supabase builds its
// client at module load and throws without env vars, so a rule defined beside
// it cannot be loaded by the test runner at all.

import { isAtOrAfterClose } from "@/lib/market";
import type { Quote } from "@/lib/finnhub";
import type { Bar } from "@/lib/yahoo";

/**
 * Returns the quote to store, preferring the official close once the session
 * has produced one.
 *
 * Self-gating: only a bar at or after 16:00 ET can stand in for the close, and
 * during the session no such bar exists, so a mid-session call returns the live
 * quote untouched. Before the closing print publishes the same is true — which
 * is why the closing window has to stay open long enough for a later tick to
 * find it (see CLOSING_WINDOW_MINUTES).
 *
 * `change` and `changePercent` are re-derived rather than carried over, so the
 * three figures continue to describe one another. Finnhub quotes the change
 * against the previous close, so that baseline is recovered from the pair it
 * already sent rather than fetched again.
 */
/** The same closing-bar search reconcileClose uses internally, exposed so a caller can ask "did it actually substitute?" without reconcileClose's return shape having to carry that flag. */
function pickClosingBar(bars: Bar[]): Bar | null {
  let closingBar: Bar | null = null;
  for (const bar of bars) {
    if (!isAtOrAfterClose(bar.at)) continue;
    if (!closingBar || bar.at > closingBar.at) closingBar = bar;
  }
  return closingBar;
}

export function reconcileClose(quote: Quote, bars: Bar[]): Quote {
  const closingBar = pickClosingBar(bars);
  if (!closingBar) return quote;

  // Left alone rather than half-applied: a baseline this shape means the quote
  // itself is malformed, and correcting the price while leaving the change to
  // describe a different one would trade a small error for a contradiction.
  const previousClose = quote.price - quote.change;
  if (!(previousClose > 0)) return quote;

  const change = closingBar.price - previousClose;
  return {
    price: closingBar.price,
    change,
    changePercent: (change / previousClose) * 100,
  };
}

/**
 * True only when reconcileClose would actually substitute the official
 * closing print for `quote` — i.e. a closing bar exists AND the quote's own
 * baseline is well-formed. A bar at/after the bell is not enough on its own:
 * reconcileClose falls back to the raw (possibly after-hours-drifted or
 * malformed) quote when the baseline check fails, and a caller that only
 * checked for a closing bar would then treat that unswapped quote as the
 * day's official close. Unlike price_cache, daily_closes has no next tick to
 * self-correct on — it is written once per trading day and kept — so writing
 * it needs this stronger check, not the bar-presence check reconcileClose
 * itself starts from.
 */
export function hasReliableClose(quote: Quote, bars: Bar[]): boolean {
  const closingBar = pickClosingBar(bars);
  if (!closingBar) return false;
  return quote.price - quote.change > 0;
}
