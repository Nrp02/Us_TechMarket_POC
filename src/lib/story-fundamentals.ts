import { dayWindow } from "./market.ts";
import type { StoryFundamentals } from "./story-input.ts";
import { db } from "./supabase.ts";

/** Latest business facts observed by the application by this ET session's close. */
export async function loadStoryFundamentals(symbol: string, day: string): Promise<StoryFundamentals | null> {
  const { from } = dayWindow(day);
  const close = new Date(new Date(from).getTime() + 16 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from("fundamentals_history")
    .select("known_at,facts").eq("symbol", symbol).lte("known_at", close)
    .order("known_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`fundamentals history for ${symbol}: ${error.message}`);
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
