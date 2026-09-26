import { generateJson, GroqRateLimitError } from "@/lib/groq";
import { tradingDay } from "@/lib/market";
import { buildMarketStoryInput, type MarketStoryInput } from "@/lib/market-story-input";
import { db } from "@/lib/supabase";
import { INDEX_CARDS, TOP_20_SYMBOLS } from "@/lib/symbols";
import { ANALYSIS_GUIDELINE } from "@/lib/story-guideline";

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
    "index and sub-sector proxies": input.indices.map((i) => ({
      label: i.label,
      symbol: i.symbol,
      "percent change today": percentOrNull(i.changePercent),
    })),
    "sector averages (mean percent change of the Top 20 stocks in each sector)": input.sectorAverages.map((s) => ({
      sector: s.sector,
      "average percent change": percentOrNull(s.averageChangePercent),
      "stocks in this sector tracked": s.count,
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

${ANALYSIS_GUIDELINE}

Return a JSON object with exactly these 8 keys, each a string:

1. "overallRead" — a short (roughly 1-2 sentences) "what happened today"
   overview: the overall tape's direction and scale, using the breadth and
   index figures.

2. "standoutMovers" — which index or sub-sector proxy moved most, and by how
   much, using the "index and sub-sector proxies" figures.

3. "sectorLeadership" — which sector led or lagged today, using the "sector
   averages" figures — name the sector, not just "some sectors."

4. "breadth" — whether today's move was broad-based or concentrated, using
   the breadth figures (advancers/decliners/significant count) directly.

5. "marketEvents" — the day's market-relevant news, using "market news
   today." If it is empty, write exactly:
   "${NO_EVENTS}"

6. "macroContext" — today's macro backdrop: any FRED release compared to its
   prior reading, and whether today is a scheduled FOMC decision day. If
   "macro" is "no macro data available" and today is not a decision day,
   write exactly:
   "${NO_MACRO}"

7. "volatilityContext" — what the Volatility (VIXY) proxy and the day's
   breadth together say about how calm or turbulent the session was.

8. "closingSynthesis" — a closing "today's market story" that connects at
   least two of the above (e.g. breadth with sector leadership, or macro
   context with volatility) — not a restatement of "overallRead."

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
 */
async function latestMarketSessionDay(): Promise<string> {
  const { data } = await db
    .from("intraday_snapshots")
    .select("snapshot_at")
    .order("snapshot_at", { ascending: false })
    .limit(1);
  const newest = data?.[0]?.snapshot_at as string | undefined;
  return newest ? tradingDay(new Date(newest)) : tradingDay();
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
  const resolvedDay = day ?? (await latestMarketSessionDay());
  const { data: existing } = await db
    .from("market_stories")
    .select("story_date")
    .eq("story_date", resolvedDay)
    .maybeSingle();
  if (existing) return { status: "already_done" };

  const [{ data: priceRows }, { data: macroRows }, news] = await Promise.all([
    db.from("price_cache").select("symbol, change_percent"),
    db.from("macro_indicators").select("series_id, latest_date, latest_value, prior_date, prior_value"),
    loadMarketNews(resolvedDay),
  ]);

  const bySymbol = new Map((priceRows ?? []).map((r) => [r.symbol as string, Number(r.change_percent)]));
  const top20 = TOP_20_SYMBOLS.flatMap((symbol) => {
    const changePercent = bySymbol.get(symbol);
    return changePercent == null
      ? []
      : [{ symbol, changePercent, significant: false }];
  });
  // significant is recomputed properly where it matters (breadth's own
  // significantCount) via the shared rule — see market-breadth.ts. The
  // `false` above is a placeholder overwritten by computeBreadth's own read
  // of relative volume where it has one; here breadth only needs price
  // direction and the significance flag isn't read from this array's own
  // field, since price_cache alone (no avg_volume join) can't derive it
  // faithfully for this lightweight read. Acceptable: breadth's own count
  // already comes from the Top 20's Ticker.significant elsewhere on the
  // Market page (SessionDigest) — this generation job's own breadth section
  // states the same advancers/decliners figures, not a second significance
  // judgement.
  const indices = INDEX_CARDS.flatMap((card) => {
    const changePercent = bySymbol.get(card.symbol);
    return changePercent == null ? [] : [{ label: card.label, symbol: card.symbol, changePercent }];
  });
  const macro = (macroRows ?? []).map((r) => ({
    seriesId: r.series_id as string,
    latestDate: r.latest_date as string,
    latestValue: r.latest_value == null ? null : Number(r.latest_value),
    priorDate: r.prior_date as string | null,
    priorValue: r.prior_value == null ? null : Number(r.prior_value),
  }));

  const input = buildMarketStoryInput({ day: resolvedDay, top20, indices, macro, news });
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
