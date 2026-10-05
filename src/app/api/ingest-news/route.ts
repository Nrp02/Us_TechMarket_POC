import { NextResponse } from "next/server";

import { ingestNews } from "@/lib/news-ingest";

// News ingestion. Same guard as /api/refresh: driven only by the Supabase Cron
// schedule, never by a page or a visitor. No market-hours gate here — news
// arrives outside the session too.

// A cold cycle summarising ~40 new articles measured 42s end to end, which
// overruns Vercel's 10s Hobby default. Steady-state cycles finish in ~1s
// because dedup leaves almost nothing to summarise, but the first run after a
// quiet period is the one that would silently fail without this.
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

  try {
    const result = await ingestNews();
    // A cycle whose AI call produced no blurb must not read as success in
    // net._http_response; the articles are still stored and stay queued.
    const aiFailed = result.aiCalls > 0 && result.summarised === 0;
    return NextResponse.json(result, { status: aiFailed ? 502 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ingest failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
