import { sessionDayTimes } from "./market.ts";
import type { StoryFundamentals } from "./story-input.ts";
import { db } from "./supabase.ts";
import { readMaybeOne } from "./db-read.ts";

/** Latest business facts observed by the application by this ET session's close. */
export async function loadStoryFundamentals(symbol: string, day: string): Promise<StoryFundamentals | null> {
  const { close } = sessionDayTimes(day);
  const data = await readMaybeOne<{ known_at: string; facts: Record<string, unknown> }>(
    `fundamentals-history:${symbol}`, (signal) =>
      db.from("fundamentals_history")
        .select("known_at,facts").eq("symbol", symbol).lte("known_at", close)
        .order("known_at", { ascending: false }).limit(1).abortSignal(signal).retry(false).maybeSingle(),
  );
  if (!data) return null;
  const facts = data.facts as Record<string, unknown>;
  const number = (key: string) => facts[key] == null ? null : Number(facts[key]);
  return {
    epsGrowthQuarterlyYoY: number("eps_growth_quarterly_yoy"),
    epsGrowthTtmYoY: number("eps_growth_ttm_yoy"),
    revenueGrowthQuarterlyYoY: number("revenue_growth_quarterly_yoy"),
    revenueGrowthTtmYoY: number("revenue_growth_ttm_yoy"),
    latestEarningsPeriod: facts.latest_earnings_period as string | null,
    latestEarningsSurprisePercent: number("latest_earnings_surprise_percent"),
    knownAt: data.known_at as string,
  };
}
