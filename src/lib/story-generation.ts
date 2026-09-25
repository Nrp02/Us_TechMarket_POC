import { formatEtTime, formatPercent, formatPrice } from "@/lib/format";
import { generateJson, GroqRateLimitError } from "@/lib/groq";
import { dayWindow, tradingDay } from "@/lib/market";
import { computePeriodPerformance } from "@/lib/period-performance";
import { relativeVolume } from "@/lib/significance";
import { buildStoryInput, type StoryDailyClose, type StoryFundamentals, type StoryInput, type StoryNewsItem } from "@/lib/story-input";
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
    },
    "peer comparison": {
      "peer tickers": story.peers.symbols.length ? story.peers.symbols.join(", ") : "none configured",
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
    "movement classification (already computed, state it, do not re-derive it)": story.movementClassification,
    "volatility vs own history": {
      "percentile of today's move size among this stock's past daily moves":
        story.volatility.percentile == null
          ? "not available"
          : `${Math.round(story.volatility.percentile)}th percentile`,
      "position within the trailing ~52-week high/low range":
        story.volatility.rangePosition == null
          ? "not available"
          : `${Math.round(story.volatility.rangePosition * 100)}% of the way from the low to the high`,
      "range label (already computed, state it, do not re-derive it)": story.volatility.rangeLabel ?? "not available",
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
          "earnings result (already computed, state it, do not re-derive it)": story.fundamentals.earningsSurprise,
          "EPS growth trend (already computed, state it, do not re-derive it)": story.fundamentals.epsGrowthTrend,
          "revenue growth trend (already computed, state it, do not re-derive it)": story.fundamentals.revenueGrowthTrend,
        }
      : null,
    "news today": news.map((item, index) => ({
      index,
      headline: item.headline,
      published: formatEtTime(item.publishedAt),
      "about this company specifically, or the wider industry": item.relatedSymbols.length <= 1 ? "company-specific" : "shared with other companies",
    })),
  };

  return `You are writing "Today's Story" for one US technology stock on a stock-tracking
dashboard. The reader wants a briefing that reads top-to-bottom as one coherent
account, not a grid of disconnected facts.

All figures below are already computed. Copy each one exactly as written —
never restate a number in another form, and never work out a new one.

Return a JSON object with exactly these 8 keys, each a short string (1-3
sentences) unless noted otherwise:

1. "headline" — an object { "text": string, "newsIndex": number | null }.
   Pick the ONE item from "news today" that most deserves a reader's
   attention, and say why in "text", grounded only in that article's own
   content or metadata (its topic, how recent it is, whether it is
   company-specific or shared with the industry) — never a claim that it
   caused the price move; that is the "explanation" section's job only.
   Set "newsIndex" to that item's index. If "news today" is empty, set
   "newsIndex" to null and "text" to exactly:
   "${NO_HEADLINE_NEWS}"

2. "comparison" — how this stock's move compares to its peer average, its
   sector and the market, using the "peer comparison" and "sector/market
   divergence" figures. If every one of those figures is "not available",
   write exactly:
   "${NO_COMPARISON}"

3. "classification" — state the already-computed "movement classification"
   value in plain prose (company-specific / market-wide / unknown) and
   ground it in the divergence figures that produced it. If the value is
   "unknown", write exactly:
   "${NO_CLASSIFICATION}"

4. "unusualness" — whether today's move is unusual for this stock, using the
   volatility percentile and 52-week range position. If both are
   "not available", write exactly:
   "${NO_UNUSUALNESS}"

5. "explanation" — a plausible, data-grounded account of why this stock moved
   today. Unlike the other sections, you MAY infer a plausible connection
   between today's news, peer/sector movement and the price move even if no
   source explicitly states that link — but only when the data given
   actually supports it. Still NEVER predict future prices or trends, and
   NEVER give investment advice or buy/sell/hold framing. If nothing in the
   input plausibly explains the move, write exactly:
   "${NO_EXPLANATION}"

6. "fundamentals" — how the underlying business has been performing (earnings
   result, EPS/revenue growth trend), using the "fundamentals" figures. If
   fundamentals is null, write exactly:
   "${NO_FUNDAMENTALS}"

7. "peerSectorRelation" — whether today's move relates to peers or the sector
   moving the same way. Like "explanation", you may infer a plausible
   connection from the divergence direction and peer figures without a
   source stating it explicitly, but never predict future prices or give
   investment advice. If direction vs sector and vs market are both "not
   available", write exactly:
   "${NO_RELATION}"

8. "ytdTakeaway" — what the year-to-date return tells the reader, in plain
   language rather than restating the raw percentage. If "year-to-date" is
   "not available", write exactly:
   "${NO_YTD}"

Further rules:
- Never invent a fact, a number, a timestamp or a news item not in the input.
- Never calculate a new number — every figure above is already final.
- Outside of "explanation" and "peerSectorRelation", never claim one thing
  caused another.
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
    .select("headline, source_url, related_symbols, published_at")
    .contains("related_symbols", [symbol])
    .gte("published_at", from)
    .lt("published_at", to)
    .order("published_at", { ascending: false });
  if (error) throw new Error(`news read for ${symbol}: ${error.message}`);
  return (data ?? [])
    .filter((row) => tradingDay(new Date(row.published_at as string)) === day)
    .map((row) => ({
      headline: row.headline as string,
      sourceUrl: row.source_url as string,
      publishedAt: row.published_at as string,
      relatedSymbols: (row.related_symbols as string[] | null) ?? [],
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
  const peerChangePercents = peerSymbols.flatMap((peerSymbol) => {
    const peer = prices.get(peerSymbol);
    return peer ? [Number(peer.change_percent)] : [];
  });
  const sectorChangePercent = prices.get(SECTOR_SYMBOL)?.change_percent;
  const marketChangePercent = prices.get(MARKET_SYMBOL)?.change_percent;

  const [dailyCloses, fundamentals, news] = await Promise.all([
    loadDailyCloses(symbol, day),
    loadFundamentals(symbol),
    loadNews(symbol, day),
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
    peerChangePercents,
    sectorChangePercent: sectorChangePercent == null ? null : Number(sectorChangePercent),
    marketChangePercent: marketChangePercent == null ? null : Number(marketChangePercent),
    dailyCloses,
    periodPerformance,
    fundamentals,
    news,
  });

  const prompt = buildPrompt(
    symbol,
    storyInput,
    news,
    sectorChangePercent == null ? null : Number(sectorChangePercent),
    marketChangePercent == null ? null : Number(marketChangePercent),
  );
  const { data } = await generateJson<GroqModel>(prompt, { timeoutMs: CALL_TIMEOUT_MS });

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
