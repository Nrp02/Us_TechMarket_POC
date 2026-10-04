import { readRows } from "@/lib/db-read";
import { loadDayDataBatch } from "@/lib/day-data";
import { fetchEvents } from "@/lib/finnhub-events";
import { generateJson } from "@/lib/gemini";
import { tradingDay } from "@/lib/market";
import { db } from "@/lib/supabase";
import { readSessionTickers, type Ticker } from "@/lib/session";
import { TOP_20_SYMBOLS } from "@/lib/symbols";
import { rebuildTimelines } from "@/lib/timeline-rebuild";
import { buildInput, buildPrompt, SUMMARY_SCHEMA, type Model, type SummaryInput } from "@/lib/daily-summary-prompt";

// The end-of-day batch job behind Today's Activity. For each of the Top 20 it
// refreshes the earnings calendar, rebuilds the day's timeline from stored
// snapshots, and writes one AI narrative covering everything that happened to
// that stock today — price, volume, news and events in a single account, so the
// reader never has to assemble it from separate sections.
//
// Runs once per stock per day. Nothing here is ever triggered by a page view.

/**
 * Stocks covered by one batched Gemini call, and so by one invocation of this
 * job. Four runs finish the Top 20; the schedule fires twelve times, and the
 * spare runs pick up anything that failed.
 *
 * The size is set by the free tier, which turned out to be the binding
 * constraint on this whole job — see the note in CLAUDE.md. The quota is 20
 * *requests per day* for this model (quotaId
 * GenerateRequestsPerDayPerProjectPerModel-FreeTier, read off a live 429, not
 * from the docs). One call per stock would spend the entire day's quota on this
 * job alone, leaving nothing for the news cycles, a failure, or a manual
 * trigger before a demo. Batched, all 20 stocks cost 4.
 *
 * Not larger than 5: the news pipeline already established that an oversized
 * batch truncates the model's JSON mid-string and loses every entry in it, and
 * a batch that spans the whole Top 20 would put the day's entire output on one
 * call.
 */
const BATCH_SIZE = 5;

/**
 * The route's own ceiling. Latency on the batched call is not just variable but
 * occasionally extreme — the same 5-stock batch measured 13s once and 75s
 * another time — and a call still running when the function is killed loses the
 * batch with nothing recorded. Aborting first turns that into a reported
 * failure with the symbols left pending for the next scheduled run.
 *
 * The Gemini budget is whatever remains of this once the run's own work is
 * done, not a fixed number: a timeline rebuild for every active stock plus the
 * calendar refresh happens first, and a constant ceiling silently stopped
 * covering the call as that preamble grew.
 */
const JOB_BUDGET_MS = 55_000;

/** Below this there is not enough time left to be worth starting a call. */
const MIN_CALL_BUDGET_MS = 15_000;

/**
 * When the timeline rebuilds stop, whatever is left of them.
 *
 * The rebuilds run before the call and grow with the number of stocks covered,
 * which makes them the one part of the preamble that can starve the thing the
 * job exists for. Left unbounded at 20 stocks they could consume the entire
 * budget, the call would never be attempted, and — because the preamble is
 * deterministic — every retry in the schedule would fail exactly the same way,
 * ending the day with no summaries at all.
 *
 * Set well below JOB_BUDGET_MS so the calendar refresh and MIN_CALL_BUDGET_MS
 * both still fit afterwards. Stocks in the current batch are exempt: their day
 * data is the call's input, so it is never the work that gets dropped.
 */
const TIMELINE_DEADLINE_MS = 25_000;

/** Index proxies quoted alongside the stock, for context in the stat cards. */
const SECTOR_SYMBOL = "XLK";
const MARKET_SYMBOL = "SPY";

export type DailySummaryResult = {
  tradingDay: string;
  /** Symbols that already had a summary for today and were left alone. */
  alreadyDone: number;
  generated: string[];
  /** Symbols whose timeline was rebuilt — every active one, summarised or not. */
  timelines: string[];
  /** Rebuilds abandoned to protect the Gemini call's share of the budget. */
  timelinesSkipped: string[];
  /** Milliseconds spent before the call was attempted. See TIMELINE_DEADLINE_MS. */
  preambleMs: number;
  /** Symbols whose price cache has not been refreshed today — a closed session. */
  stale: string[];
  geminiCalls: number;
  /** Cost and latency of the batched call, so a slow run can be attributed. */
  calls: { symbols: string[]; ms: number; tokens: number | undefined }[];
  failed: string[];
};

/**
 * The narrative is generated in three separately-constrained parts and joined
 * into one paragraph before it is stored — the page still shows a single
 * account, as the content contract requires.
 *
 * Splitting it is what makes the no-causal-claims rule hold. Asked for one
 * narrative, the model reliably slipped a link in ("Apple's stock price
 * increased as Norway's sovereign wealth fund disclosed a position") no matter
 * how the banned wordings were listed, because deciding whether a source states
 * a link is a judgement call it makes generously. Split, `movement` has no news
 * to reach for, `recap` has no price to attach one to, and `explanation` is the
 * only field allowed to connect them — under a rule narrow enough to check.
 */

/** Refreshes the earnings calendar for one symbol and returns what is upcoming. */
async function syncEvents(symbol: string) {
  const events = await fetchEvents(symbol);

  if (events.length) {
    const { error } = await db.from("events").upsert(
      events.map((e) => ({
        symbol: e.symbol,
        event_type: e.eventType,
        event_at: e.eventAt.toISOString(),
        note: e.note,
        fetched_at: new Date().toISOString(),
      })),
      { onConflict: "symbol,event_type,event_at" },
    );
    if (error) throw new Error(`events upsert: ${error.message}`);
  }

  return events.map((e) => ({
    type: e.eventType === "earnings_call" ? "earnings call" : "earnings date",
    date: tradingDay(e.eventAt),
    note: e.note,
  }));
}

/**
 * `day` exists for manual triggers; omitted, it is the newest session the
 * snapshots record. Only the live session is summarised — a past day has no
 * price cache to read — so a backfill for another day reports every stock
 * stale rather than pairing one day's date with another day's prices.
 */
export async function generateDailySummaries(
  requestedDay?: string,
): Promise<DailySummaryResult> {
  const startedJobAt = Date.now();

  const session = await readSessionTickers([...TOP_20_SYMBOLS, SECTOR_SYMBOL, MARKET_SYMBOL], requestedDay);
  const day = session.day;
  const prices = session.isLive ? session.tickers : new Map<string, Ticker>();

  // Through readRows, not bare `{ data }`: a failed read must throw rather
  // than arrive as an empty done-set (re-spending AI calls on finished stocks).
  const doneRows = await readRows<{ symbol: string }>("daily-summary-done", (signal) =>
    db.from("daily_summaries").select("symbol").eq("summary_date", day).abortSignal(signal).retry(false),
  );
  const done = new Set(doneRows.map((r) => r.symbol));

  const result: DailySummaryResult = {
    tradingDay: day,
    alreadyDone: done.size,
    generated: [],
    timelines: [],
    timelinesSkipped: [],
    preambleMs: 0,
    stale: [],
    geminiCalls: 0,
    calls: [],
    failed: [],
  };

  const sectorChange = prices.get(SECTOR_SYMBOL)?.changePercent ?? null;
  const marketChange = prices.get(MARKET_SYMBOL)?.changePercent ?? null;

  // Every Top 20 stock, not just a watchlist. The watchlist is per-visitor now,
  // so at generation time the server cannot know which stocks anyone will ask
  // for — the same reasoning that already makes ingestion fetch all 20, so that
  // adding a stock never triggers a fetch. Here it means adding a stock never
  // lands on a page with no summary on it.
  const active: string[] = [];
  for (const symbol of TOP_20_SYMBOLS) {
    // readSessionTickers leaves out any symbol not refreshed since this
    // session opened, so a quote left over from an earlier session is never
    // dated to this one.
    if (!prices.has(symbol)) {
      result.stale.push(symbol);
      continue;
    }
    active.push(symbol);
  }

  const batch = active.filter((symbol) => !done.has(symbol)).slice(0, BATCH_SIZE);
  const inBatch = new Set(batch);

  // The timeline is rebuilt for every active stock on every run, not just the
  // ones being summarised. It is derived entirely from stored snapshots and news
  // by threshold rules — no AI call and no upstream request — so repeating it is
  // free, and keeping it off the summary's critical path means a change to the
  // rules can be rolled out by re-running this job without spending any of the
  // day's Gemini quota re-writing narratives that were already correct.
  //
  // This is no longer the only place the timeline is built — the intraday
  // refresh route rebuilds it every 15 minutes so the page is useful during the
  // session (see lib/timeline-rebuild.ts). The rebuild here is kept anyway: this
  // job already has to load the same day data for the prompt below, so it costs
  // one extra pure loop, and it is the backstop for a day whose refresh ticks
  // failed. Both paths write the same rows from the same rules.
  //
  // Free of quota, but not free of time. Every active stock's day data is read
  // in one batched pass, so the two reads below are the whole I/O cost of the
  // rebuild no matter how many stocks it covers — the loop itself is then pure
  // arithmetic and a plain sequential pass, with no reason to run it through a
  // worker pool. The deadline is kept as cheap insurance rather than because
  // the loop is slow: it is what stops a pathological run from spending the
  // budget here instead of on the call. The batch goes first so that if the
  // deadline does bite, what gets dropped is a rebuild nobody is waiting on.
  const ordered = [...batch, ...active.filter((symbol) => !inBatch.has(symbol))];
  const dayDataBatch = await loadDayDataBatch(ordered, day);
  const dayData = dayDataBatch.bySymbol;
  const rebuilt = await rebuildTimelines(ordered, day, {
    data: dayDataBatch,
    skip: (symbol) => !inBatch.has(symbol) && Date.now() - startedJobAt > TIMELINE_DEADLINE_MS,
  });
  result.timelines.push(...rebuilt.timelines);
  result.timelinesSkipped.push(...rebuilt.skipped);
  result.failed.push(...rebuilt.failed);

  if (!batch.length) return result;

  // Calendar refresh and prompt assembly — still no AI. The calendar lookups go
  // out together rather than one after another: they are the slowest part of the
  // preamble, and every second here is a second taken off the Gemini budget
  // computed below. Five parallel requests sit far inside Finnhub's 60/min.
  const calendars = await Promise.all(
    batch.map(async (symbol) => {
      try {
        return { symbol, events: await syncEvents(symbol) };
      } catch (error) {
        result.failed.push(
          `${symbol}: ${error instanceof Error ? error.message : "failed"}`,
        );
        return null;
      }
    }),
  );

  const inputs: SummaryInput[] = [];
  for (const entry of calendars) {
    if (!entry) continue;
    const data = dayData.get(entry.symbol);
    if (!data) continue;

    inputs.push(
      buildInput({
        symbol: entry.symbol,
        day,
        price: prices.get(entry.symbol)!,
        snapshots: data.snapshots,
        news: data.news,
        events: entry.events,
        sectorChange,
        marketChange,
      }),
    );
  }

  if (!inputs.length) return result;

  // One Gemini call for the whole batch.
  //
  // No in-call retries, unlike the news pipeline. This model returns 503 "high
  // demand" often enough to matter, and each retry costs another full call —
  // two of them pushed a measured run past the 60s function limit, so the retry
  // was the thing most likely to lose the batch. Retrying is the schedule's job:
  // a symbol that fails keeps no summary row, stays pending, and a later run
  // picks it up.
  const remaining = JOB_BUDGET_MS - (Date.now() - startedJobAt);
  result.preambleMs = Date.now() - startedJobAt;
  if (remaining < MIN_CALL_BUDGET_MS) {
    // The preamble ate the run. Everything before this point is already stored,
    // so the next scheduled run starts with less to do and gets the call in.
    result.failed.push(
      `batch ${inputs.map((i) => i.symbol).join(",")}: only ${remaining}ms left in the run`,
    );
    return result;
  }

  const startedAt = Date.now();
  let summaries: Model[];
  try {
    const { data, tokens } = await generateJson<Model[]>(
      buildPrompt(inputs),
      SUMMARY_SCHEMA,
      { retries: 0, timeoutMs: remaining },
    );
    summaries = data;
    result.geminiCalls = 1;
    result.calls.push({
      symbols: inputs.map((i) => i.symbol),
      ms: Date.now() - startedAt,
      tokens,
    });
  } catch (error) {
    result.failed.push(
      `batch ${inputs.map((i) => i.symbol).join(",")}: ${
        error instanceof Error ? error.message : "failed"
      }`,
    );
    return result;
  }

  // Matched back by symbol rather than by position: a short or reordered reply
  // then costs only the stocks actually missing from it, which stay pending for
  // the next run, instead of silently pairing one stock's numbers with another's
  // narrative.
  const bySymbol = new Map(summaries.map((s) => [s.symbol, s]));

  const rows = inputs.flatMap((input) => {
    const written = bySymbol.get(input.symbol);
    if (!written) {
      result.failed.push(`${input.symbol}: missing from the batch reply`);
      return [];
    }

    // Joined back into the one narrative the page shows. The parts are a
    // constraint on how it was written, not a structure the reader sees.
    const narrative = [written.movement, written.recap, written.explanation]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ");

    result.generated.push(input.symbol);
    return [
      {
        symbol: input.symbol,
        summary_date: day,
        summary: narrative,
        bullets: written.bullets ?? [],
        generated_at: new Date().toISOString(),
      },
    ];
  });

  if (rows.length) {
    const { error } = await db
      .from("daily_summaries")
      .upsert(rows, { onConflict: "symbol,summary_date" });
    if (error) throw new Error(`daily_summaries upsert: ${error.message}`);
  }

  return result;
}
