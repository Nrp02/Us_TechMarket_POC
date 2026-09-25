import { NextResponse } from "next/server";

import { isMarketOpen } from "@/lib/market";
import { generateStories } from "@/lib/story-generation";

// End-of-day Today's Story generation, on the same schedule window as
// /api/daily-summary (see scripts/setup-cron.mts) but a second, independent
// cron entry — each tick here does at most 2 Groq calls (STOCKS_PER_RUN),
// against the Gemini job's up-to-5-stock batch.
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
    return NextResponse.json(await generateStories(day));
  } catch (error) {
    const message = error instanceof Error ? error.message : "story job failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
