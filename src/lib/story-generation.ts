import { formatEtTime, formatPercent, formatPrice, formatRelVolume } from "@/lib/format";
import { generateJson, GroqRateLimitError } from "@/lib/groq";
import { dayWindow, isAtOrAfterClose, tradingDay } from "@/lib/market";
import { computePeriodPerformance } from "@/lib/period-performance";
import { relativeVolume } from "@/lib/significance";
import { ANALYSIS_GUIDELINE } from "@/lib/story-guideline";
import { buildStoryInput, type StoryDailyClose, type StoryInput, type StoryNewsItem, type StorySecFiling } from "@/lib/story-input";
import { db } from "@/lib/supabase";
import { loadStoryFundamentals } from "@/lib/story-fundamentals";
import { readAllRows } from "@/lib/db-read";
import { NAME_BY_SYMBOL, PEERS, TOP_20_SYMBOLS } from "@/lib/symbols";

// The end-of-day Today's Story job. For each of the Top 20, in a stock's own
// call, it assembles that day's computed inputs (ticket 03) and asks Groq for
// an 8-section narrative, then stores it. Nothing here is ever triggered by a
// page view — same posture as daily-summary.ts, which this file otherwise
// mirrors, split onto a second provider because Groq's binding constraint
// (tokens/minute) makes a per-stock call viable where Gemini's per-day request
// cap did not — see CLAUDE.md's AI call budget.

/**
 * Stocks covered by one invocation. One Groq call per stock (never a batch —
 * ticket 04's requirement, and the fix for the JSON-truncation failure mode
 * already seen twice with multi-stock batches), so this is also the call
 * count per run.
 *
 * 2 per run across the 12-tick daily-summaries window covers all 20 stocks in
 * 10 ticks, leaving 2 ticks of headroom for a run that skips a rate-limited
 * or failed stock.
 */
const STOCKS_PER_RUN = 2;

/** Groq's own latency is low; this is a generous ceiling, not a measured one. */
const CALL_TIMEOUT_MS = 30_000;

/**
 * Reasoning effort for the Groq call, now that the prompt's sentence cap is
 * gone and the model is expected to actually think before answering.
 * Measured live against production (NVDA/AAPL/MSFT, 2026-09-25): "high"
 * consumed its entire completion-token budget on reasoning before emitting
 * any JSON, failing outright; "medium" succeeded at 5,261 total tokens — over
 * half of Groq's 8,000 TPM budget on its own, too tight for two calls (this
 * job's STOCKS_PER_RUN) to land in the same scheduled tick; "low" succeeded
 * at 3,697 and 4,040, comfortably fitting two calls inside the per-minute
 * budget. See CLAUDE.md's AI call budget note for the full writeup.
 */
const REASONING_EFFORT = "low";

/**
 * Backstop now that the prompt sets no per-section sentence limit. This caps
 * *completion* tokens only, which is a much smaller number than the
 * total_tokens figures above (those include the prompt, which dominates the
 * total at this prompt's size) — measured directly on a second pass (NVDA
 * 429, AAPL 635 completion tokens at "low" effort), so 4,500 is generous
 * headroom over real usage, not a guess extrapolated from the total-token
 * figures.
 */
const MAX_COMPLETION_TOKENS = 4500;

const SECTOR_SYMBOL = "XLK";
const MARKET_SYMBOL = "SPY";

export type StoryGenerationResult = {
  tradingDay: string;
  /** Symbols that already had a story for today and were left alone. */
  alreadyDone: number;
  generated: string[];
  /** Symbols whose price cache has not been refreshed today — a closed session. */
  stale: string[];
  /** Rate-limited this run; a later run picks them up, per ticket 04. */
  skippedRateLimited: string[];
  failed: string[];
};

export type PriceRow = {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number | null;
  avg_volume: number | null;
  updated_at: string;
};

/**
 * The 8 sections, stored as-is and read back by the (later) page. `headline`
 * carries the picked article resolved server-side from the model's index pick
 * — never a URL or headline the model wrote itself, so it cannot invent one.
 */
export type StorySections = {
  headline: {
    text: string;
    news: { headline: string; sourceUrl: string; publishedAt: string } | null;
  };
  comparison: string;
  classification: string;
  unusualness: string;
  explanation: string;
  fundamentals: string;
  peerSectorRelation: string;
  ytdTakeaway: string;
};

type GroqModel = {
  headline: { text: string; newsIndex: number | null };
  comparison: string;
  classification: string;
  unusualness: string;
  explanation: string;
  fundamentals: string;
  peerSectorRelation: string;
  ytdTakeaway: string;
};

/** Every string-valued key `GroqModel` must carry — `headline.text` is checked separately, since it's nested. */
const REQUIRED_STRING_KEYS = [
  "comparison",
  "classification",
  "unusualness",
  "explanation",
  "fundamentals",
  "peerSectorRelation",
  "ytdTakeaway",
] as const satisfies readonly (keyof GroqModel)[];

/** Exact wording required when the given data doesn't support even an inferred read. */
const NO_EXPLANATION =
  "The available information does not establish a clear explanation for this movement.";
const NO_RELATION =
  "The available information does not establish a clear connection between this stock's move and its peers or sector.";
const NO_HEADLINE_NEWS = "No news from today stands out enough to headline this story.";
const NO_FUNDAMENTALS = "No fundamentals data is available yet for this company.";
const NO_COMPARISON = "Peer, sector and market comparison data is not available for this session.";
const NO_CLASSIFICATION =
  "There isn't enough sector or market data available to classify today's move.";
const NO_UNUSUALNESS =
  "There isn't enough price history for this stock yet to say whether today's move is unusual.";
const NO_YTD =
  "There isn't enough of this year's trading history yet to state a year-to-date trend.";

const percentOrNull = (value: number | null) => (value == null ? "not available" : formatPercent(value));
const relVolumeOrNull = (value: number | null) => (value == null ? "not available" : formatRelVolume(value));

export function buildStoryPrompt(
  symbol: string,
  story: StoryInput,
  news: StoryNewsItem[],
  sectorChangePercent: number | null,
  marketChangePercent: number | null,
): string {
  const company = NAME_BY_SYMBOL.get(symbol) ?? symbol;

  const input = {
    company,
    symbol,
    "trading day": story.sessionDay,
    price: {
      "closing price": formatPrice(story.price.price),
      "percent change": formatPercent(story.price.changePercent),
      "movement verdict": story.significance.significant ? "Significant" : "Normal",
      "relative volume (today's volume vs its 10-day average)": relVolumeOrNull(story.price.relativeVolume),
    },
    "peer comparison": {
      "peer tickers": story.peers.symbols.length ? story.peers.symbols.join(", ") : "none configured",
      // The average alone can't say *which* peer moved differently — this is
      // what lets the model name a specific peer instead of only the group.
      "each peer's own percent change today": story.peers.breakdown.length
        ? story.peers.breakdown.map((p) => `${p.symbol} ${formatPercent(p.changePercent)}`).join(", ")
        : "no peer prices available",
      "peer average percent change today": percentOrNull(story.peers.peerAveragePercent),
      "this stock's percent change MINUS the peer average (positive = outperformed peers)":
        percentOrNull(story.peers.vsPeersPercent),
    },
    // Both the sector/market's OWN move and this stock's DIVERGENCE from it are
    // given, and deliberately kept apart: a negative divergence only means this
    // stock moved less than the sector/market, not that the sector/market fell —
    // it can still be positive. Read the two independently.
    "sector/market divergence": {
      "technology sector ETF (XLK) percent change today": percentOrNull(sectorChangePercent),
      "S&P 500 ETF (SPY) percent change today": percentOrNull(marketChangePercent),
      "this stock's percent change MINUS the sector's (positive = outperformed sector)":
        percentOrNull(story.divergence.vsSectorPercent),
      "this stock's percent change MINUS the market's (positive = outperformed market)":
        percentOrNull(story.divergence.vsMarketPercent),
      "direction vs sector (same/opposite = moved the same/opposite way as the sector, regardless of who moved more)":
        story.divergence.vsSectorDirection ?? "not available",
      "direction vs market (same/opposite = moved the same/opposite way as the market, regardless of who moved more)":
        story.divergence.vsMarketDirection ?? "not available",
    },
    "movement classification": story.movementClassification,
    "volatility vs own history": {
      "percentile of today's move size among this stock's past daily moves":
        story.volatility.percentile == null
          ? "not available"
          : `${Math.round(story.volatility.percentile)}th percentile`,
      "position within the trailing ~52-week high/low range":
        story.volatility.rangePosition == null
          ? "not available"
          : `${Math.round(story.volatility.rangePosition * 100)}% of the way from the low to the high`,
      "range label": story.volatility.rangeLabel ?? "not available",
    },
    "recent trend (trailing 10 trading days)": story.recentTrend.direction == null
      ? "not available"
      : {
          direction: story.recentTrend.direction,
          "today vs supplied direction (precomputed; not vs net window change)": story.recentTrend.direction === "no-clear-trend"
            ? "no clear directional trend to compare against"
            : story.price.changePercent === 0
              ? "unchanged today"
              : (story.price.changePercent > 0) === (story.recentTrend.direction === "uptrend")
                ? "moves in the same direction as the recent trend"
                : "moves against the recent trend",
          "net change from window start to today": percentOrNull(story.recentTrend.windowChangePercent),
          "trading days since the most recent confirmed reversal inside this window": story.recentTrend.reversalDaysAgo,
        },
    "period performance": {
      "year-to-date": percentOrNull(story.periodPerformance.ytdPercent),
      "month-to-date": percentOrNull(story.periodPerformance.mtdPercent),
    },
    fundamentals: story.fundamentals
      ? {
          "EPS growth, quarterly YoY": percentOrNull(story.fundamentals.epsGrowthQuarterlyYoY),
          "EPS growth, trailing twelve months YoY": percentOrNull(story.fundamentals.epsGrowthTtmYoY),
          "revenue growth, quarterly YoY": percentOrNull(story.fundamentals.revenueGrowthQuarterlyYoY),
          "revenue growth, trailing twelve months YoY": percentOrNull(story.fundamentals.revenueGrowthTtmYoY),
          "latest earnings fiscal period (not announcement date)": story.fundamentals.latestEarningsPeriod ?? "not available",
          "business facts first observed by this application": story.fundamentals.knownAt ?? "not available",
          "latest earnings surprise": percentOrNull(story.fundamentals.latestEarningsSurprisePercent),
          "earnings result": story.fundamentals.earningsSurprise,
          "EPS growth trend": story.fundamentals.epsGrowthTrend,
          "revenue growth trend": story.fundamentals.revenueGrowthTrend,
        }
      : null,
    "news today": news.map((item, index) => ({
      index,
      // The AI paraphrase already generated once by the news pipeline, when
      // one exists yet — real article content to reason from, not just a
      // title. Falls back to the bare headline for an article that hasn't
      // been summarised yet, same as every other reader of this table does.
      content: item.summary ?? item.headline,
      published: formatEtTime(item.publishedAt),
      "published after regular-session close": isAtOrAfterClose(new Date(item.publishedAt)),
      "about this company specifically, or the wider industry": item.relatedSymbols.length <= 1 ? "company-specific" : "shared with other companies",
    })),
    // Structured metadata only — form type and SEC's own item codes, never
    // the filing's body text (this project never fetches or stores that).
    // No item-code allow-list: the model judges relevance itself, same as
    // every other input here.
    "SEC filing(s) today": story.secFilings.length
      ? story.secFilings.map((f) => ({ form: f.form, "SEC item codes": f.itemCodes || "none listed" }))
      : "none",
  };

  return `You are writing "Today's Story" for one US technology stock on a stock-tracking
dashboard. The reader wants a briefing that reads top-to-bottom as one coherent
analysis, not a grid of disconnected facts restating numbers they can already
see elsewhere on the page.

All figures below are already computed. Copy each one exactly as written —
never restate a number in another form, and never work out a new one.

${ANALYSIS_GUIDELINE}

Return a JSON object with exactly these 8 keys:

1. "headline" — an object { "text": string, "newsIndex": number | null }. A
   short "What Happened" overview (roughly 1-2 sentences): today's price move,
   plus whichever ONE item from "news today" most deserves a reader's
   attention and why — grounded only in that article's own content or
   metadata, never a claim that it caused the price move (that is
   "explanation"'s job). If "SEC filing(s) today" is not "none", you may
   mention that the company filed one (form and item codes only — never guess
   at its contents). This is the summary lede; the 7 sections below it do the
   actual analysis. Set "newsIndex" to that item's index. If "news today"
   is empty, set "newsIndex" to null and describe only the price move, or if
   there is truly nothing to say, use exactly:
   "${NO_HEADLINE_NEWS}"

2. "comparison" — how this stock's move compares to its peer average, its
   sector and the market, using the "peer comparison" and "sector/market
   divergence" figures. Establish what the peers/sector/market did before
   drawing any conclusion about this stock specifically. If every one of
   those figures is "not available", write exactly:
   "${NO_COMPARISON}"

3. "classification" — state the "movement classification" value and reason
   through the divergence figures that produced it — don't just translate the
   label into a sentence. If the value is "unknown", write exactly:
   "${NO_CLASSIFICATION}"

4. "unusualness" — whether today's move is unusual for this stock, using the
   volatility percentile and 52-week range position, and whether that lines up
   with or contradicts what the other sections describe (e.g. an unusual move
   with no clear driver, or an unusual move that peers also had). An unusual
   day describes today, not a forecast for tomorrow. If both percentile and
   range position are "not available", write exactly:
   "${NO_UNUSUALNESS}"
   Otherwise, when "recent trend (trailing 10 trading days)" is available,
   connect today's move to that backward-looking trend: does it continue,
   move against, or sit within the recent direction? State the supplied net
   window change, and state the confirmed reversal age when it is non-null.
   Null reversal age means
   no confirmed reversal age is available for this read, not zero days ago.
   Null does not prove that no swings or reversals occurred in the window.
   "no-clear-trend" means no directional trend was established; do not call
   it an uptrend or downtrend based on the net window change alone.
   The supplied direction reads confirmed swing structure (or the latest
   leg); net window change covers the whole window and may have the opposite
   sign. Compare today's move with DIRECTION: a gain against "downtrend" or
   a decline against "uptrend" moves against that trend, even if the window's
   net change shares today's sign. Use the precomputed "today vs supplied
   direction" label as the authoritative comparison; never contradict it.
   Never call a move against the trend a continuation. A reversal
   needs two later trading days to confirm, so never assert a reversal today
   or yesterday. If recent trend is "not available", say the recent-trend
   read is unavailable and still reason from the available volatility data.
   Keep this recent-trend reasoning in "unusualness" only, never a forecast.

5. "explanation" — the fullest analytical read of why this stock moved today,
   drawing on any of the input: news, peers/sector/market divergence,
   fundamentals, volatility, and a same-day SEC filing if one is listed under
   "SEC filing(s) today" (cite only its form and item codes — never speculate
   about what the filing says beyond that). State plainly which part of the
   day's data the explanation accounts for and which part (if any) it
   doesn't. If nothing in the input plausibly explains the move, write
   exactly:
   "${NO_EXPLANATION}"

6. "fundamentals" — whether today's price/peer/sector performance is
   consistent or inconsistent with the company's earnings/growth trend, using
   the "fundamentals" figures alongside the day's price action — this is the
   one section that must connect the two, not just restate the earnings
   result in isolation. These are the latest known periodic results, not a
   new daily event. Compare quarterly YoY growth with TTM YoY growth, then
   reconcile that business trend with today's relative performance. Old
   results can frame alignment or tension but cannot establish today's cause.
   A fiscal period is not an announcement date. Never say results were
   released today without an explicit same-day news record saying so.
   If fundamentals is null, use available company news to explain the
   business context and its relationship to relative performance, identifying
   what the article supports and what it does not quantify. State that a
   numerical earnings/growth comparison is unavailable for this session.
   Only if neither business news nor fundamentals supports a read, use:
   "${NO_FUNDAMENTALS}"

7. "peerSectorRelation" — whether today's move relates to peers or the sector
   moving the same way, using the divergence direction and peer figures. If a
   divergence exists, say whether anything else in the input (volume, news,
   fundamentals) corroborates it as company-specific, or state plainly that
   nothing does. If direction vs sector and vs market are both "not
   available", write exactly:
   "${NO_RELATION}"

8. "ytdTakeaway" — what the year-to-date and month-to-date returns tell the
   reader about the stock's trajectory this year, in light of today's move —
   plain language, not a restatement of the raw percentages. If "year-to-date"
   is "not available", write exactly:
   "${NO_YTD}"

Length: keep "headline" to roughly 1-2 sentences. The 7 analytical sections
(2-8) have no sentence-count limit — write as much as the grounded reasoning
actually needs, but never pad with restated numbers or a repeated conclusion.

Further rules:
- Recent Trend fields may be used ONLY in "unusualness", never in any other
  section. In "unusualness", explicitly include the supplied direction,
  net window percent change, confirmed reversal age if non-null (in trading
  days), and precomputed today-vs-direction comparison. These are required,
  not optional detail. Moving against a trend does not by itself make the
  day's magnitude unusual; keep the volatility percentile read separate.
  Do not summarize this as "usual/unusual in direction": state only the
  supplied same-direction/against-trend/unclear comparison, without adding
  a second directional verdict that could contradict it.
- Every percent-change figure above already carries its own sign: a value
  with no minus sign is a GAIN, a value with a minus sign is a LOSS. Before
  writing any word like "up," "down," "gained," "fell," "slipped," "rose," or
  "declined," re-check it against that figure's actual sign. Describing a
  positive change as a decline (or a negative one as a gain) is treated the
  same as inventing a number — it is not allowed, however small the move.
- A section must not restate a conclusion an earlier section already reached
  — each takes its own angle on the same underlying data.
- News published after the regular-session close cannot explain an earlier
  regular-session price move. It may be identified as after-close context.
- Distinguish an observed association from a plausible explanation and from
  confirmed causation. Where a driver is unconfirmed, still explain what the
  peer/market/volume evidence suggests and which residual remains unexplained;
  do not replace all analysis with a generic causation disclaimer.
- Every claim must point to a specific figure or label present in the input
  above. No outside fact, cause, or event may be introduced.
- Never invent a fact, a number, a timestamp or a news item not in the input.
- Never calculate a new number — every figure above is already final.
- Never predict future prices, trends, or outcomes, anywhere.
- Never give investment advice or recommendations of any kind, including
  "a good entry point", "investors should", or buy/sell/hold language.
- Use only the input given. If it doesn't support a statement, don't make it.

Input:
${JSON.stringify(input, null, 2)}`;
}

async function loadDailyCloses(symbol: string, day: string): Promise<StoryDailyClose[]> {
  const rows = await readAllRows<{ trading_day: string; close: number; change_percent: number | null }>(
    `story-closes:${symbol}`, (signal, start, end) => db.from("daily_closes")
      .select("trading_day,close,change_percent", { count: "exact" }).eq("symbol", symbol)
      .lte("trading_day", day).order("trading_day").range(start, end).abortSignal(signal));
  return rows.map((row) => ({ tradingDay: row.trading_day, close: Number(row.close),
    changePercent: row.change_percent == null ? null : Number(row.change_percent) }));
}

/** Today's news for one symbol, in the shape story-input.ts needs. */
async function loadNews(symbol: string, day: string): Promise<StoryNewsItem[]> {
  const { from, to } = dayWindow(day);
  const { data, error } = await db
    .from("news")
    .select("headline, source_url, related_symbols, published_at, news_summaries(summary)")
    .contains("related_symbols", [symbol])
    .gte("published_at", from)
    .lt("published_at", to)
    .order("published_at", { ascending: false });
  if (error) throw new Error(`news read for ${symbol}: ${error.message}`);
  return (data ?? [])
    .filter((row) => tradingDay(new Date(row.published_at as string)) === day)
    .map((row) => ({
      headline: row.headline as string,
      // news_id is news_summaries' primary key, so PostgREST embeds a single
      // object here even though the client's inferred type says array — same
      // shape day-data.ts and queries.ts already read this join as.
      summary: (row.news_summaries as unknown as { summary: string } | null)?.summary ?? null,
      sourceUrl: row.source_url as string,
      publishedAt: row.published_at as string,
      relatedSymbols: (row.related_symbols as string[] | null) ?? [],
    }));
}

/** This symbol's own Form 8-K filing(s) dated today, if any (see migration 0013). */
async function loadFilings(symbol: string, day: string): Promise<StorySecFiling[]> {
  const { data, error } = await db
    .from("sec_filings")
    .select("form, item_codes")
    .eq("symbol", symbol)
    .eq("filing_date", day);
  if (error) throw new Error(`sec_filings read for ${symbol}: ${error.message}`);
  return (data ?? []).map((row) => ({
    form: row.form as string,
    itemCodes: row.item_codes as string,
  }));
}

/**
 * Exported (was module-private) so a one-off manual regeneration script can
 * call the exact same pipeline `generateStories` uses per symbol, without
 * going through its price-freshness gate — useful for re-running a single
 * stock whose stored story came out thin/degenerate without touching the
 * others. Not called from any route; `generateStories` is still the only
 * scheduled entry point.
 */
export async function generateOneStory(
  symbol: string,
  day: string,
  prices: Map<string, PriceRow>,
): Promise<void> {
  const price = prices.get(symbol);
  if (!price) throw new Error(`${symbol}: no price row`);
  if (tradingDay(new Date(price.updated_at)) !== day) {
    throw new Error(`${symbol}: price row belongs to another session, not ${day}`);
  }

  const peerSymbols = PEERS[symbol] ?? [];
  // Paired with its own symbol, not just collected into a bare number list —
  // a peer missing from price_cache is simply absent, same as before.
  const peerBreakdown = peerSymbols.flatMap((peerSymbol) => {
    const peer = prices.get(peerSymbol);
    return peer ? [{ symbol: peerSymbol, changePercent: Number(peer.change_percent) }] : [];
  });
  const sectorChangePercent = prices.get(SECTOR_SYMBOL)?.change_percent;
  const marketChangePercent = prices.get(MARKET_SYMBOL)?.change_percent;

  const [dailyCloses, fundamentals, news, secFilings] = await Promise.all([
    loadDailyCloses(symbol, day),
    loadStoryFundamentals(symbol, day),
    loadNews(symbol, day),
    loadFilings(symbol, day),
  ]);

  const changePercent = Number(price.change_percent);
  const relVolume = relativeVolume(price.volume, price.avg_volume);

  const periodPerformance = computePeriodPerformance(
    dailyCloses.map((c) => ({ tradingDay: c.tradingDay, close: c.close })),
    day,
  );

  const storyInput = buildStoryInput({
    symbol,
    sessionDay: day,
    price: Number(price.price),
    changePercent,
    relativeVolume: relVolume,
    peerSymbols,
    peerBreakdown,
    sectorChangePercent: sectorChangePercent == null ? null : Number(sectorChangePercent),
    marketChangePercent: marketChangePercent == null ? null : Number(marketChangePercent),
    dailyCloses,
    periodPerformance,
    fundamentals,
    news,
    secFilings,
  });

  const sections = await generateStorySections(storyInput,
    sectorChangePercent == null ? null : Number(sectorChangePercent),
    marketChangePercent == null ? null : Number(marketChangePercent));

  const { error } = await db.from("stories").upsert(
    {
      symbol,
      story_date: day,
      sections,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "symbol,story_date" },
  );
  if (error) throw new Error(`stories upsert for ${symbol}: ${error.message}`);
}

/** The same narrative call for scheduled generation and reviewed historical replay. */
export async function generateStorySections(
  storyInput: StoryInput,
  sectorChangePercent: number | null,
  marketChangePercent: number | null,
): Promise<StorySections> {
  const prompt = buildStoryPrompt(
    storyInput.symbol,
    storyInput,
    storyInput.news,
    sectorChangePercent,
    marketChangePercent,
  );
  const { data } = await generateJson<GroqModel>(prompt, {
    timeoutMs: CALL_TIMEOUT_MS,
    reasoningEffort: REASONING_EFFORT,
    maxCompletionTokens: MAX_COMPLETION_TOKENS,
  });

  // Groq's response_format:json_object only guarantees valid JSON, not that
  // every requested key is present — a call can return a syntactically
  // complete object holding just one of the 8 keys (observed live: AMD
  // 2026-09-25 stored a sections row containing only "headline"). Without
  // this check that partial object gets upserted as a finished story, which
  // permanently blocks the retry path since `done` treats any existing row
  // as complete. Fail loudly instead so the caller's catch routes this
  // symbol into `failed` and a later scheduled run retries it.
  const missingKeys: string[] = REQUIRED_STRING_KEYS.filter((key) => (typeof data[key] !== "string" || !data[key].trim()));
  if (typeof data.headline?.text !== "string" || !data.headline.text.trim()) missingKeys.push("headline.text");
  if (missingKeys.length > 0) {
    throw new Error(`${storyInput.symbol}: Groq response missing section(s): ${missingKeys.join(", ")}`);
  }

  const pickedNews =
    data.headline.newsIndex != null && storyInput.news[data.headline.newsIndex]
      ? {
          headline: storyInput.news[data.headline.newsIndex].headline,
          sourceUrl: storyInput.news[data.headline.newsIndex].sourceUrl,
          publishedAt: storyInput.news[data.headline.newsIndex].publishedAt,
        }
      : null;

  return {
    headline: { text: data.headline.text, news: pickedNews },
    comparison: data.comparison,
    classification: data.classification,
    unusualness: data.unusualness,
    explanation: data.explanation,
    fundamentals: data.fundamentals,
    peerSectorRelation: data.peerSectorRelation,
    ytdTakeaway: data.ytdTakeaway,
  };
}

/**
 * `day` exists for manual triggers, mirroring daily-summary.ts. The schedule
 * always runs on the current New York trading day.
 */
export async function generateStories(day: string = tradingDay()): Promise<StoryGenerationResult> {
  const [{ data: doneRows }, { data: priceRows }] = await Promise.all([
    db.from("stories").select("symbol").eq("story_date", day),
    db
      .from("price_cache")
      .select("symbol, price, change, change_percent, volume, avg_volume, updated_at"),
  ]);

  const done = new Set((doneRows ?? []).map((r) => r.symbol as string));
  const prices = new Map(
    (priceRows ?? []).map((r) => [r.symbol as string, r as unknown as PriceRow]),
  );

  const result: StoryGenerationResult = {
    tradingDay: day,
    alreadyDone: done.size,
    generated: [],
    stale: [],
    skippedRateLimited: [],
    failed: [],
  };

  const active: string[] = [];
  for (const symbol of TOP_20_SYMBOLS) {
    const price = prices.get(symbol);
    if (!price || tradingDay(new Date(price.updated_at)) !== day) {
      result.stale.push(symbol);
      continue;
    }
    active.push(symbol);
  }

  const batch = active.filter((symbol) => !done.has(symbol)).slice(0, STOCKS_PER_RUN);

  for (const symbol of batch) {
    try {
      await generateOneStory(symbol, day, prices);
      result.generated.push(symbol);
    } catch (error) {
      if (error instanceof GroqRateLimitError) {
        result.skippedRateLimited.push(symbol);
      } else {
        result.failed.push(`${symbol}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
  }

  return result;
}
