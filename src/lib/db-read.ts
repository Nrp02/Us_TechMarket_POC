// Every read of a cached table goes through here.
//
// THE DEFECT THIS EXISTS TO CLOSE. lib/queries.ts used to destructure only
// `{ data }` from every Supabase read — the string "error" did not appear in the
// file. supabase-js reports a failure as `{ data: null, error }` rather than by
// rejecting, so a network blip, an aborted fetch or a PostgREST 5xx arrived as
// `data: null`, and every call site collapsed that to `[]` / `null` / an empty
// Map. A failed read was therefore indistinguishable from an empty table.
//
// That alone would be a bad afternoon. What made it a reported bug is the layer
// above: those reads are wrapped in `unstable_cache` at 60s, so ONE transient
// failure wrote an empty array into the Vercel Data Cache and it was served to
// EVERY visitor for at least a minute — and beyond that, stale, while a
// revalidation ran. Measured on the live site: six consecutive requests returned
// a Home page with zero sparklines and correct prices, then the seventh was
// clean. The database held all 675 of that session's rows the whole time.
//
// So the contract here is: a read either returns rows or THROWS. Never an empty
// array standing in for a failure. `unstable_cache` writes no entry for a
// rejected promise, which is the entire mechanism — throwing is what keeps a
// wrong answer out of the cache, and it is why this must not "degrade
// gracefully" by returning [] after the retries are spent.
//
// Deliberately imports nothing from lib/supabase. That module builds the client
// at module load and throws without env vars, so anything defined next to it
// cannot be loaded by the test runner at all — the same mechanical reason
// news-select.ts and watchlist.ts are separate modules. This file never learns
// what a Supabase client is; callers hand it a query builder instead.

/** The shape supabase-js resolves to. Declared locally so this module stays free of that import. */
export type QueryResult<T> = {
  data: T[] | null;
  error: { message: string; code?: string; details?: string | null } | null;
  count?: number | null;
};

export type SingleResult<T> = {
  data: T | null;
  error: { message: string; code?: string; details?: string | null } | null;
};

/** One try plus two retries. */
export const READ_ATTEMPTS = 3;

/**
 * One delay per retry, so `READ_RETRY_DELAYS_MS.length` is `READ_ATTEMPTS - 1`.
 *
 * Both sit well under the 155ms a Supabase request costs from `sin1` (measured;
 * see the serving-latency note in CLAUDE.md), which is the right unit: the cost
 * of this whole retry budget is roughly one extra query's worth of latency, paid
 * only when something is actually wrong.
 *
 * Two retries rather than more because the reproduced failure spanned seconds —
 * a fourth attempt would not have rescued it, and the visitor's own reload is a
 * cheaper retry than burning function time. More attempts would only push the
 * hang ceiling toward the function limit for a failure retries cannot fix.
 */
export const READ_RETRY_DELAYS_MS = [100, 300];

/**
 * Per-attempt timeout. This matters more than the retry count: nothing in the
 * read path had any timeout before, and a hung fetch is strictly worse than an
 * error — it burns the whole function and still returns nothing. 2s is ~13x the
 * healthy round trip, so it can only fire on a genuine stall.
 */
export const READ_TIMEOUT_MS = 2_000;

/** Read beyond PostgREST's row ceiling; fail rather than cache a partial result. */
export async function readAllRows<T>(
  label: string,
  build: (signal: AbortSignal, from: number, to: number) => PromiseLike<QueryResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  let expectedCount: number | null | undefined;
  for (let from = 0; ; from += pageSize) {
    const page = await readRowsWithCount(label, (signal) => build(signal, from, from + pageSize - 1));
    if (from === 0) expectedCount = page.count;
    else if (page.count !== expectedCount) throw new Error(`read ${label}: row count changed during pagination`);
    rows.push(...page.rows);
    if (page.count != null && rows.length >= page.count) return rows;
    if (page.rows.length < pageSize) {
      if (page.count != null && rows.length < page.count) throw new Error(`read ${label}: incomplete page`);
      return rows;
    }
  }
}

/** A successful read slower than this is the signal that precedes a failure. */
const SLOW_READ_MS = 1_000;

const sleepDefault = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Options = {
  /** Injected by tests so the backoff schedule is asserted without spending it. */
  sleep?: (ms: number) => Promise<void>;
};

function describe(error: { message: string; code?: string } | null): string {
  if (!error) return "unknown error";
  return `${error.code ?? "?"} ${error.message}`;
}

/**
 * Runs `build` until it succeeds or the attempt budget is spent.
 *
 * `build` is a CALLBACK TAKING THE SIGNAL, not a pre-built query, and that is
 * not a style choice. A PostgrestFilterBuilder is a thenable that executes
 * exactly once — awaiting the same object a second time does not re-run the
 * query, it resolves to the first result again. A retry loop therefore has to
 * reconstruct the query per attempt, and passing the signal in is what lets each
 * attempt carry its own fresh `AbortSignal.timeout`. A reused signal would
 * already be aborted on attempt 2, making every retry a no-op while every unit
 * test still passed.
 */
async function attempt<R extends { error: unknown }>(
  label: string,
  build: (signal: AbortSignal) => PromiseLike<R>,
  { sleep = sleepDefault }: Options = {},
): Promise<R> {
  const startedAt = Date.now();
  let last = "unknown error";

  for (let n = 1; n <= READ_ATTEMPTS; n++) {
    const attemptStartedAt = Date.now();
    try {
      // A fresh signal per attempt — see the note above.
      const result = await build(AbortSignal.timeout(READ_TIMEOUT_MS));
      if (!result.error) {
        const ms = Date.now() - attemptStartedAt;
        if (ms > SLOW_READ_MS) {
          console.warn(`[read] ${label} succeeded slowly in ${ms}ms`);
        }
        return result;
      }
      last = describe(result.error as { message: string; code?: string });
    } catch (error) {
      // A rejection is an aborted fetch or a network failure. Treated exactly
      // like an `error` field, because the caller cannot act on the difference
      // and conflating them is what keeps the retry loop one branch.
      last = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    }

    if (n < READ_ATTEMPTS) {
      console.warn(
        `[read] ${label} attempt ${n}/${READ_ATTEMPTS} failed in ${Date.now() - attemptStartedAt}ms: ${last}`,
      );
      await sleep(READ_RETRY_DELAYS_MS[n - 1]);
    }
  }

  const total = Date.now() - startedAt;
  console.error(
    `[read] ${label} FAILED after ${READ_ATTEMPTS} attempts (${total}ms total): ${last}`,
  );
  throw new Error(
    `read ${label} failed after ${READ_ATTEMPTS} attempts: ${last}`,
  );
}

/**
 * A read that returns rows alongside the exact count, for a caller that would
 * rather *report* a short reply than fail on it — a background job, which can
 * finish its work and carry the problem out in its response. Pages have no such
 * report, so they use `readRows` and take the throw.
 */
export async function readRowsWithCount<T>(
  label: string,
  build: (signal: AbortSignal) => PromiseLike<QueryResult<T>>,
  options?: Options,
): Promise<{ rows: T[]; count: number | null }> {
  const result = await attempt(label, build, options);
  return { rows: result.data ?? [], count: result.count ?? null };
}

/**
 * A read that returns rows, and refuses to return a short answer.
 *
 * PostgREST caps a response at its max-rows setting (1000 on this project,
 * measured — an unbounded select on a 3,375-row table returned exactly 1000 with
 * `error: null`) and says nothing when it does. The reply is simply short.
 * Comparing the returned rows against the exact count turns that into a raised
 * failure, which is right on a page's read path: there is no job report to
 * collect a warning into, and rendering from partial data is the failure this
 * module exists to stop.
 *
 * ONLY ASK FOR `{ count: "exact" }` WHEN THE QUERY'S `.limit()` IS THE CEILING,
 * never when it is an intentional smaller cap. PostgREST counts every matching
 * row, ignoring `limit`, so a deliberately capped query would report a shortfall
 * on every healthy read. A missing count skips the check entirely, which is what
 * a read with a natural small bound wants.
 */
export async function readRows<T>(
  label: string,
  build: (signal: AbortSignal) => PromiseLike<QueryResult<T>>,
  options?: Options,
): Promise<T[]> {
  const { rows, count } = await readRowsWithCount(label, build, options);

  if (count != null && count > rows.length) {
    const message = `${label}: row cap hit — ${rows.length} of ${count} rows returned, so the page would render from partial data`;
    console.error(`[read] ${message}`);
    throw new Error(message);
  }

  return rows;
}

/** A read of at most one row, where absent is a normal answer rather than a failure. */
export async function readMaybeOne<T>(
  label: string,
  build: (signal: AbortSignal) => PromiseLike<SingleResult<T>>,
  options?: Options,
): Promise<T | null> {
  const result = await attempt(label, build, options);
  return result.data ?? null;
}
