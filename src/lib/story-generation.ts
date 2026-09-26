import { formatEtTime, formatPercent, formatPrice, formatRelVolume } from "@/lib/format";
import { generateJson, GroqRateLimitError } from "@/lib/groq";
import { dayWindow, tradingDay } from "@/lib/market";
import { computePeriodPerformance } from "@/lib/period-performance";
import { relativeVolume } from "@/lib/significance";
import { ANALYSIS_GUIDELINE } from "@/lib/story-guideline";
import { buildStoryInput, type StoryDailyClose, type StoryFundamentals, type StoryInput, type StoryNewsItem, type StorySecFiling } from "@/lib/story-input";
import { db } from "@/lib/supabase";
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

type PriceRow = {
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

function buildPrompt(
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
          "latest earnings period": story.fundamentals.latestEarningsPeriod ?? "not available",
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
   result in isolation. If fundamentals is null, write exactly:
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
- Every percent-change figure above already carries its own sign: a value
  with no minus sign is a GAIN, a value with a minus sign is a LOSS. Before
  writing any word like "up," "down," "gained," "fell," "slipped," "rose," or
  "declined," re-check it against that figure's actual sign. Describing a
  positive change as a decline (or a negative one as a gain) is treated the
  same as inventing a number — it is not allowed, however small the move.
- A section must not restate a conclusion an earlier section already reached
  — each takes its own angle on the same underlying data.
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
  const { data, error } = await db
    .from("daily_closes")
    .select("trading_day, close, change_percent")
    .eq("symbol", symbol)
    .lte("trading_day", day);
  if (error) throw new Error(`daily_closes read for ${symbol}: ${error.message}`);
  return (data ?? []).map((row) => ({
    tradingDay: row.trading_day as string,
    close: Number(row.close),
    changePercent: row.change_percent == null ? null : Number(row.change_percent),
  }));
}

async function loadFundamentals(symbol: string): Promise<StoryFundamentals | null> {
  const { data, error } = await db
    .from("fundamentals")
    .select(
      "eps_growth_quarterly_yoy, eps_growth_ttm_yoy, revenue_growth_quarterly_yoy, revenue_growth_ttm_yoy, latest_earnings_period, latest_earnings_surprise_percent",
    )
    .eq("symbol", symbol)
    .maybeSingle();
  if (error) throw new Error(`fundamentals read for ${symbol}: ${error.message}`);
  if (!data) return null;
  return {
    epsGrowthQuarterlyYoY: data.eps_growth_quarterly_yoy == null ? null : Number(data.eps_growth_quarterly_yoy),
    epsGrowthTtmYoY: data.eps_growth_ttm_yoy == null ? null : Number(data.eps_growth_ttm_yoy),
    revenueGrowthQuarterlyYoY: data.revenue_growth_quarterly_yoy == null ? null : Number(data.revenue_growth_quarterly_yoy),
    revenueGrowthTtmYoY: data.revenue_growth_ttm_yoy == null ? null : Number(data.revenue_growth_ttm_yoy),
    latestEarningsPeriod: data.latest_earnings_period,
    latestEarningsSurprisePercent:
      data.latest_earnings_surprise_percent == null ? null : Number(data.latest_earnings_surprise_percent),
  };
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

async function generateOneStory(
  symbol: string,
  day: string,
  prices: Map<string, PriceRow>,
): Promise<void> {
  const price = prices.get(symbol);
  if (!price) throw new Error(`${symbol}: no price_cache row`);

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
    loadFundamentals(symbol),
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

  const prompt = buildPrompt(
    symbol,
    storyInput,
    news,
    sectorChangePercent == null ? null : Number(sectorChangePercent),
    marketChangePercent == null ? null : Number(marketChangePercent),
  );
  const { data } = await generateJson<GroqModel>(prompt, {
    timeoutMs: CALL_TIMEOUT_MS,
    reasoningEffort: REASONING_EFFORT,
    maxCompletionTokens: MAX_COMPLETION_TOKENS,
  });

  const pickedNews =
    data.headline.newsIndex != null && news[data.headline.newsIndex]
      ? {
          headline: news[data.headline.newsIndex].headline,
          sourceUrl: news[data.headline.newsIndex].sourceUrl,
          publishedAt: news[data.headline.newsIndex].publishedAt,
        }
      : null;

  const sections: StorySections = {
    headline: { text: data.headline.text, news: pickedNews },
    comparison: data.comparison,
    classification: data.classification,
    unusualness: data.unusualness,
    explanation: data.explanation,
    fundamentals: data.fundamentals,
    peerSectorRelation: data.peerSectorRelation,
    ytdTakeaway: data.ytdTakeaway,
  };

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
