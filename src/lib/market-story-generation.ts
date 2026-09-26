import { readMaybeOne, readRows } from "@/lib/db-read";
import { generateJson, GroqRateLimitError } from "@/lib/groq";
import { tradingDay } from "@/lib/market";
import {
  buildMarketStoryInput,
  type MarketStoryIndexClose,
  type MarketStoryInput,
} from "@/lib/market-story-input";
import { getDayTickers, getTickers } from "@/lib/queries";
import { db } from "@/lib/supabase";
import { INDEX_CARDS, INDEX_SYMBOLS, TOP_20_SYMBOLS } from "@/lib/symbols";
import { MARKET_ANALYSIS_GUIDELINE } from "@/lib/market-story-guideline";

// The end-of-day Market Story job — the whole-market counterpart to
// story-generation.ts, mirroring its shape exactly (one Groq call, same
// provider, same "skip and defer on a 429" behavior, same fixed-fallback-
// line discipline, same project-wide loosened causal-inference rule).
// Nothing here is ever triggered by a page view; it rides the same
// post-close schedule tick Today's Story uses (see /api/story/route.ts) —
// no new cron entry for one call.

/** Same tuning as story-generation.ts, re-measured against this larger input before trusting it — see the generateMarketStory doc comment. */
const REASONING_EFFORT = "low";
const MAX_COMPLETION_TOKENS = 4500;
const CALL_TIMEOUT_MS = 30_000;

export type MarketStorySections = {
  overallRead: string;
  standoutMovers: string;
  sectorLeadership: string;
  breadth: string;
  marketEvents: string;
  macroContext: string;
  volatilityContext: string;
  closingSynthesis: string;
};

type GroqModel = MarketStorySections;

const NO_EVENTS = "No market-relevant news stood out enough to cite today.";
const NO_MACRO = "No macro release or FOMC decision fell on this session.";

function percentOrNull(value: number | null | undefined) {
  return value == null ? "not available" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function buildPrompt(input: MarketStoryInput): string {
  const promptInput = {
    "trading day": input.day,
    breadth: {
      advancers: input.breadth.advancers,
      decliners: input.breadth.decliners,
      unchanged: input.breadth.unchanged,
      "total tracked": input.breadth.total,
      "cleared the Significant Movement rule": input.breadth.significantCount,
    },
    "biggest movers among the tracked Top 20 stocks today": {
      "gainers, largest first": input.topMovers.gainers.map((m) => `${m.symbol} ${percentOrNull(m.changePercent)}`),
      "losers, largest first": input.topMovers.losers.map((m) => `${m.symbol} ${percentOrNull(m.changePercent)}`),
    },
    "index and sub-sector proxies": input.indices.map((i) => ({
      label: i.label,
      symbol: i.symbol,
      "percent change today": percentOrNull(i.changePercent),
      "how unusual vs. its own past year (percentile of |daily moves|; higher = more unusual)":
        i.volatilityPercentile == null ? "not available" : `${i.volatilityPercentile.toFixed(0)}th percentile`,
      "position in its own trailing ~52-week range": i.rangeLabel ?? "not available",
    })),
    "sector averages (mean percent change of the Top 20 stocks in each sector)": input.sectorAverages.map((s) => ({
      sector: s.sector,
      "average percent change": percentOrNull(s.averageChangePercent),
      "stocks in this sector tracked": s.count,
      "each stock's own percent change today, highest first": s.stocks.map(
        (st) => `${st.symbol} ${percentOrNull(st.changePercent)}`,
      ),
    })),
    macro: input.macro.length
      ? input.macro.map((m) => ({
          series: m.seriesLabel,
          "latest reading": m.latestValue == null ? "not available" : m.latestValue,
          "latest reading date": m.latestDate,
          "prior reading": m.priorValue == null ? "not available" : m.priorValue,
          "prior reading date": m.priorDate ?? "not available",
        }))
      : "no macro data available",
    fomc: {
      "is today a scheduled Fed rate-decision day": input.fomc.isDecisionDayToday,
      "most recent Fed rate-decision day this year": input.fomc.mostRecentDecisionDay ?? "none yet this year",
    },
    "market news today": input.news.map((item, index) => ({
      index,
      content: item.summary ?? item.headline,
      published: item.publishedAt,
    })),
  };

  return `You are writing "Market Story" for a stock-tracking dashboard's front
page — a whole-market daily briefing, distinct from the per-stock "Today's
Story" elsewhere in the product. The reader wants the shape of today's
session stated plainly: was it broad or narrow, which sector led, what macro
backdrop it sat in.

All figures below are already computed. Copy each one exactly as written —
never restate a number in another form, and never work out a new one.

${MARKET_ANALYSIS_GUIDELINE}

Return a JSON object with exactly these 8 keys, each a string:

1. "overallRead" — a short (roughly 1-2 sentences) "what happened today"
   overview: the overall tape's direction and scale, using the breadth and
   index figures.

2. "standoutMovers" — which index/sub-sector proxy AND which individual Top
   20 stock(s) moved most today, using the "index and sub-sector proxies"
   figures and the "biggest movers among the tracked Top 20 stocks" figures —
   name specific tickers, not just "some stocks."

3. "sectorLeadership" — which sector led or lagged today, using the "sector
   averages" figures — name the sector, not just "some sectors." Where a
   sector's own per-stock breakdown shows one member diverging from the rest
   of that sector, name it specifically rather than citing only the average.

4. "breadth" — whether today's move was broad-based or concentrated, using
   the breadth figures (advancers/decliners/significant count) directly.

5. "marketEvents" — the day's market-relevant news, using "market news
   today." If it is empty, write exactly:
   "${NO_EVENTS}"

6. "macroContext" — the macro backdrop this session sits in: any FRED
   release compared to its prior reading, and whether today is a scheduled
   FOMC decision day. CPI/GDP/unemployment release monthly or quarterly, so
   "latest reading date" will almost never equal the trading day — always
   state the release's own date rather than implying it landed today (e.g.
   "CPI's August reading" or "as of {latest reading date}"), and never
   describe a data point as "today's release" unless its date matches the
   trading day exactly. If "macro" is "no macro data available" and today is
   not a decision day, write exactly:
   "${NO_MACRO}"

7. "volatilityContext" — what the Volatility (VIXY) proxy's own move and its
   "how unusual vs. its own past year" figure, together with the day's
   breadth, say about how calm or turbulent the session was.

8. "closingSynthesis" — a closing "today's market story" that connects at
   least two of the above (e.g. breadth with sector leadership, or macro
   context with volatility) — not a restatement of "overallRead."

Length: keep "overallRead" to roughly 1-2 sentences. The other 7 sections
have no sentence-count limit — write as much as the grounded reasoning
actually needs, but never pad with restated numbers or a repeated conclusion.

Further rules:
- Every percent-change figure above already carries its own sign: a value
  with no minus sign is a GAIN, a value with a minus sign is a LOSS.
  Describing a positive change as a decline (or vice versa) is treated the
  same as inventing a number — it is not allowed, however small the move.
- A section must not restate a conclusion an earlier section already reached.
- Every claim must point to a specific figure or label present in the input
  above. No outside fact, cause, or event may be introduced.
- Never invent a fact, a number, a timestamp or a news item not in the input.
- Never calculate a new number — every figure above is already final.
- Never predict future prices, trends, or outcomes, anywhere.
- Never give investment advice or recommendations of any kind.
- Use only the input given. If it doesn't support a statement, don't make it.

Input:
${JSON.stringify(promptInput, null, 2)}`;
}

async function loadMarketNews(day: string) {
  const { data, error } = await db
    .from("news")
    .select("headline, source_url, published_at, news_summaries(summary)")
    .eq("related_symbols", "{}")
    .gte("published_at", `${day}T00:00:00Z`)
    .lt("published_at", `${day}T23:59:59Z`)
    .order("published_at", { ascending: false });
  if (error) throw new Error(`market news read: ${error.message}`);
  return (data ?? []).map((row) => ({
    headline: row.headline as string,
    summary: (row.news_summaries as unknown as { summary: string } | null)?.summary ?? null,
    sourceUrl: row.source_url as string,
    publishedAt: row.published_at as string,
  }));
}

/**
 * Every index/sub-sector proxy's own daily_closes history in one query
 * (INDEX_SYMBOLS is 6 symbols), mirroring story-generation.ts's
 * loadDailyCloses but batched across symbols rather than one call per
 * symbol — this is a whole-market job, so it reads the whole set at once
 * the same way loadMarketNews and the macro read already do.
 */
async function loadIndexDailyCloses(day: string): Promise<MarketStoryIndexClose[]> {
  const { data, error } = await db
    .from("daily_closes")
    .select("symbol, trading_day, close, change_percent")
    .in("symbol", INDEX_SYMBOLS)
    .lte("trading_day", day);
  if (error) throw new Error(`daily_closes read for indices: ${error.message}`);
  return (data ?? []).map((row) => ({
    symbol: row.symbol as string,
    tradingDay: row.trading_day as string,
    close: Number(row.close),
    changePercent: row.change_percent == null ? null : Number(row.change_percent),
  }));
}

export type MarketStoryResult =
  | { status: "already_done" }
  | { status: "generated" }
  | { status: "rate_limited" }
  | { status: "failed"; message: string };

/**
 * The most recent session that actually produced snapshots, as an ET date —
 * market-wide counterpart to queries.ts's getLatestSessionDay(symbol). Read
 * from the data rather than assumed from the clock: before the market opens
 * (or over a weekend), `tradingDay()` already names the new calendar day
 * while price_cache/intraday_snapshots still hold the last closed session's
 * figures — defaulting to the clock would write today's date on numbers that
 * describe yesterday. Caught by a real spot-check: a first pass of this job
 * did exactly that in pre-market hours and had to be re-run after this fix.
 *
 * Through readRows rather than a bare `{ data }` destructure — this
 * function exists specifically to not trust the clock over the data, so a
 * swallowed read failure here would silently reintroduce the exact bug it
 * was written to fix (falling back to tradingDay()). See CLAUDE.md's "A
 * transient read was cached as 'no data'" for why a failed read must throw
 * rather than degrade to an empty/default answer.
 */
async function latestMarketSessionDay(): Promise<string> {
  const rows = await readRows<{ snapshot_at: string }>(
    "market-story:latest-session-day",
    (signal) =>
      db
        .from("intraday_snapshots")
        .select("snapshot_at")
        .order("snapshot_at", { ascending: false })
        .limit(1)
        .abortSignal(signal),
  );
  return rows[0] ? tradingDay(new Date(rows[0].snapshot_at)) : tradingDay();
}

/**
 * `day` exists for manual triggers, mirroring story-generation.ts. The
 * schedule always runs on the current New York trading day — resolved from
 * the data, not the clock; see latestMarketSessionDay above.
 *
 * Reasoning effort/token ceiling reuse story-generation.ts's own "low"/4500
 * tuning. Measured live against production (real breadth/index/macro data,
 * no market news that day): 1,935 total tokens, 498 completion tokens —
 * comfortably inside both the completion ceiling and Groq's 8,000 TPM
 * budget alongside Today's Story's own calls in the same scheduled tick. A
 * busier news day will cost more (news content is passed through verbatim,
 * same as Today's Story), but has the same headroom to spend.
 */
export async function generateMarketStory(day?: string): Promise<MarketStoryResult> {
  const latestDay = await latestMarketSessionDay();
  const resolvedDay = day ?? latestDay;
  // A manually-triggered backfill for a day that isn't the current session:
  // price_cache holds only the single latest snapshot per symbol, so reading
  // it for an earlier day silently mislabels today's change% as that day's.
  // Confirmed live: on 2026-09-26, price_cache's SPY change_percent (today's
  // +0.54%) doesn't just differ in magnitude from 2026-09-22's real daily_closes
  // change_percent (-0.02%) — the sign flips. getDayTickers is the same fix
  // queries.ts already applies for Today's Activity's historical view
  // (queries.ts:876-880) — same Ticker shape, sourced from daily_closes/
  // intraday_snapshots instead of the live cache.
  const isHistorical = resolvedDay !== latestDay;
  const existing = await readMaybeOne<{ story_date: string }>(
    "market-story:existing",
    (signal) =>
      db
        .from("market_stories")
        .select("story_date")
        .eq("story_date", resolvedDay)
        .abortSignal(signal)
        .maybeSingle(),
  );
  if (existing) return { status: "already_done" };

  // getTickers, not a raw price_cache query: it already computes
  // `significant` correctly (relative volume vs. the shared threshold rule,
  // significance.ts) for every symbol. A prior version of this function
  // queried price_cache directly and hardcoded `significant: false` on every
  // row, which made computeBreadth's significantCount always report 0
  // regardless of the real figure — caught by comparing this section's
  // claim against SessionDigest's, which reads real tickers and disagreed
  // with it on the same page. Never reconstruct a Ticker by hand elsewhere;
  // this is the one place that already does it right.
  const [allTickers, macroRows, news, indexDailyCloses] = await Promise.all([
    isHistorical
      ? getDayTickers([...TOP_20_SYMBOLS, ...INDEX_SYMBOLS], resolvedDay)
      : getTickers([...TOP_20_SYMBOLS, ...INDEX_SYMBOLS]),
    readRows<{
      series_id: string;
      latest_date: string;
      latest_value: number | null;
      prior_date: string | null;
      prior_value: number | null;
    }>("market-story:macro", (signal) =>
      db
        .from("macro_indicators")
        .select("series_id, latest_date, latest_value, prior_date, prior_value")
        .abortSignal(signal),
    ),
    loadMarketNews(resolvedDay),
    loadIndexDailyCloses(resolvedDay),
  ]);

  const bySymbol = new Map(allTickers.map((t) => [t.symbol, t]));
  const top20 = TOP_20_SYMBOLS.flatMap((symbol) => {
    const ticker = bySymbol.get(symbol);
    return ticker ? [{ symbol, changePercent: ticker.changePercent, significant: ticker.significant }] : [];
  });
  const indices = INDEX_CARDS.flatMap((card) => {
    const ticker = bySymbol.get(card.symbol);
    return ticker
      ? [{ label: card.label, symbol: card.symbol, changePercent: ticker.changePercent, price: ticker.price }]
      : [];
  });
  // FOMC_DECISION_DAY is a stored boolean flag (refresh.ts), not a FRED
  // economic reading — excluded here so it doesn't show up in the model's
  // "macro" list looking like a bogus series value. The FOMC facts the
  // prompt actually uses (input.fomc, below) come from the pure calendar
  // check instead, same as before that row existed; the stored row exists
  // only to satisfy ticket 02's "stores ... whether today was an FOMC
  // decision day" as a persisted fact, not to feed this prompt.
  const macro = macroRows
    .filter((r) => r.series_id !== "FOMC_DECISION_DAY")
    .map((r) => ({
      seriesId: r.series_id,
      latestDate: r.latest_date,
      latestValue: r.latest_value == null ? null : Number(r.latest_value),
      priorDate: r.prior_date,
      priorValue: r.prior_value == null ? null : Number(r.prior_value),
    }));

  const input = buildMarketStoryInput({ day: resolvedDay, top20, indices, indexDailyCloses, macro, news });
  const prompt = buildPrompt(input);

  try {
    const { data } = await generateJson<GroqModel>(prompt, {
      timeoutMs: CALL_TIMEOUT_MS,
      reasoningEffort: REASONING_EFFORT,
      maxCompletionTokens: MAX_COMPLETION_TOKENS,
    });

    const sections: MarketStorySections = {
      overallRead: data.overallRead,
      standoutMovers: data.standoutMovers,
      sectorLeadership: data.sectorLeadership,
      breadth: data.breadth,
      marketEvents: data.marketEvents,
      macroContext: data.macroContext,
      volatilityContext: data.volatilityContext,
      closingSynthesis: data.closingSynthesis,
    };

    const { error } = await db.from("market_stories").upsert(
      { story_date: resolvedDay, sections, generated_at: new Date().toISOString() },
      { onConflict: "story_date" },
    );
    if (error) throw new Error(`market_stories upsert: ${error.message}`);

    return { status: "generated" };
  } catch (error) {
    if (error instanceof GroqRateLimitError) return { status: "rate_limited" };
    return { status: "failed", message: error instanceof Error ? error.message : "failed" };
  }
}
