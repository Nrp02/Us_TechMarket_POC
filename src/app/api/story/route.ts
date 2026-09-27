import { NextResponse } from "next/server";

import { isMarketOpen } from "@/lib/market";
import { generateMarketStory } from "@/lib/market-story-generation";
import { generateStories } from "@/lib/story-generation";

// End-of-day Today's Story generation, on the same schedule window as
// /api/daily-summary (see scripts/setup-cron.mts) but a second, independent
// cron entry — each tick handles one stock (generation plus evidence review),
// against the Gemini job's up-to-5-stock batch.
//
// Market Story's one-call-a-day generation rides this same tick rather than
// getting its own cron entry, per the spec's explicit "no new cron entry for
// one call" — generateMarketStory is idempotent (checks for an existing row
// first), so calling it on every tick costs nothing once the day is done.
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Same inverse-of-refresh gate as /api/daily-summary: this job describes a
  // finished session.
  const params = new URL(request.url).searchParams;
  const force = params.get("force") === "1";
  if (!force && isMarketOpen()) {
    return NextResponse.json({ skipped: "market still open" });
  }

  // `?day=YYYY-MM-DD` backfills/re-triggers a past session, behind the same
  // secret as everything else.
  const day = params.get("day") ?? undefined;

  try {
    // Reserve two ticks/hour for market retries so rejected stocks cannot
    // indefinitely postpone the market story. Existing market rows are no-ops.
    if (new Date().getUTCMinutes() % 30 === 0) {
      const marketStory = await generateMarketStory(day);
      if (["generated", "failed", "rate_limited"].includes(marketStory.status)) {
        return NextResponse.json({ marketStory });
      }
    }
    const stories = await generateStories(day);

    // Keep one narrative attempt per request: generation and review share the
    // 60s wall-time budget. Once stocks are done, market uses a later tick.
    if (stories.generated.length || stories.failed.length || stories.skippedRateLimited.length) {
      return NextResponse.json({ ...stories, marketStory: { status: "deferred" } });
    }

    // Its own try/catch: a Market Story failure must not mark the per-stock
    // job's own result as failed too — the two are independent Groq calls.
    let marketStory: unknown;
    try {
      marketStory = await generateMarketStory(day);
    } catch (error) {
      marketStory = { status: "failed", message: error instanceof Error ? error.message : "failed" };
    }

    return NextResponse.json({ ...stories, marketStory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "story job failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
