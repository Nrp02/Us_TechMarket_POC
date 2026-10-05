import { NextResponse } from "next/server";

import { getMarketSession } from "@/lib/queries";
import { getNewsDates } from "@/lib/queries-news";
import { TOP_20_SYMBOLS } from "@/lib/symbols";

// Opens every page a date picker links to, so the first visitor to a day does
// not pay the uncached read (~1-1.5s, against ~0.3s cached). Each deployment
// starts with an empty data cache, and a new Session turns yesterday's link
// from no `?date=` into one with it — a new cache key (measured 2026-10-05).
// Driven after each production deploy (.github/workflows/warm-cache.yml) and
// once a session by Supabase Cron (scripts/setup-cron.mts). It fetches the
// pages themselves, so the keys are exactly the ones a visitor's render uses;
// it reads only Supabase, never an upstream API or an AI model.
export const maxDuration = 60;

// Enough to finish ~180 pages well inside maxDuration without a burst the
// database would notice.
const CONCURRENCY = 12;

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

  const origin = new URL(request.url).origin;
  const [{ availableDates }, newsDates] = await Promise.all([getMarketSession(), getNewsDates()]);
  const dated = (path: string, dates: string[]) => [path, ...dates.map((d) => `${path}?date=${d}`)];
  const paths = [
    ...dated("/", availableDates),
    ...TOP_20_SYMBOLS.flatMap((symbol) => dated(`/todays-activity/${symbol}`, availableDates)),
    ...dated("/news", newsDates),
  ];

  const started = Date.now();
  const failed: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const path = paths[next++];
      try {
        const response = await fetch(origin + path, { cache: "no-store" });
        // Read to the end: the render, and so its cache writes, finishes with
        // the stream.
        await response.text();
        if (!response.ok) failed.push(`${path} ${response.status}`);
      } catch (error) {
        failed.push(`${path} ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return NextResponse.json(
    { warmed: paths.length - failed.length, failed, ms: Date.now() - started },
    { status: failed.length ? 502 : 200 },
  );
}
