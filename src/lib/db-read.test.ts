import assert from "node:assert/strict";
import { test } from "node:test";

import {
  READ_ATTEMPTS,
  READ_RETRY_DELAYS_MS,
  readMaybeOne,
  readRows,
  type QueryResult,
} from "./db-read.ts";

// These tests exist because the bug they cover was invisible: a failed Supabase
// read resolved to `{ data: null }`, every call site read that as an empty
// table, and `unstable_cache` then served the empty result to every visitor for
// a minute. The property that matters is therefore not "returns rows" but
// "REJECTS rather than resolving to []" — everything downstream, including the
// cache declining to store an entry, follows from the rejection.
//
// Loadable by the test runner only because db-read.ts imports nothing from
// lib/supabase, which constructs its client at module load. Keep it that way.

/** Silences the module's console output, which is deliberate in production and noise here. */
function quiet<T>(run: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  const error = console.error;
  console.warn = () => {};
  console.error = () => {};
  return run().finally(() => {
    console.warn = warn;
    console.error = error;
  });
}

const ok = <T,>(data: T[], count?: number): QueryResult<T> => ({
  data,
  error: null,
  count,
});
const fail = <T,>(message: string, code?: string): QueryResult<T> => ({
  data: null,
  error: { message, code },
  count: null,
});

/** Records every attempt so the budget and the signals can be asserted. */
function spy<T>(results: Array<QueryResult<T> | Error>) {
  const signals: AbortSignal[] = [];
  const build = (signal: AbortSignal) => {
    signals.push(signal);
    const next = results[signals.length - 1];
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  };
  return { build, signals, get calls() { return signals.length; } };
}

const noSleep = async () => {};

test("a successful read passes its rows through and queries once", async () => {
  const s = spy([ok([1, 2, 3])]);
  const rows = await readRows("t", s.build, { sleep: noSleep });

  assert.deepEqual(rows, [1, 2, 3]);
  assert.equal(s.calls, 1);
});

test("a transient failure is retried and recovers", async () => {
  // The reproduced bug's happy ending: one blip no longer costs anyone a blank
  // page, because the second attempt answers before the render needs the data.
  const s = spy([fail("connection reset"), ok([7])]);
  const rows = await quiet(() => readRows("t", s.build, { sleep: noSleep }));

  assert.deepEqual(rows, [7]);
  assert.equal(s.calls, 2);
});

test("a persistent failure THROWS rather than resolving to an empty array", async () => {
  // The regression test for the whole defect. Asserting the rejection is the
  // point: `unstable_cache` stores nothing for a rejected promise, so this is
  // what keeps a wrong answer from being served to the next sixty seconds of
  // visitors. A version of this function that returned [] here would pass every
  // other test in this file and reinstate the bug exactly.
  const s = spy([fail("down"), fail("down"), fail("down")]);

  await quiet(() =>
    assert.rejects(
      () => readRows("sparklines", s.build, { sleep: noSleep }),
      (error: Error) => {
        assert.match(error.message, /sparklines/);
        assert.match(error.message, /down/);
        return true;
      },
    ),
  );
});

test("a rejected promise is treated exactly like an error field", async () => {
  // supabase-js reports most failures in `error`, but an aborted fetch rejects.
  // Both are the same event to a caller, so both must feed the same retry loop.
  const s = spy([
    new DOMException("signal timed out", "TimeoutError") as unknown as Error,
    ok([1]),
  ]);
  const rows = await quiet(() => readRows("t", s.build, { sleep: noSleep }));

  assert.deepEqual(rows, [1]);
  assert.equal(s.calls, 2);
});

test("the attempt budget is exactly READ_ATTEMPTS, with the declared backoff", async () => {
  // Guards the budget from silently growing: each attempt can burn up to
  // READ_TIMEOUT_MS, so an extra one moves the worst case toward the function
  // limit for a failure mode that retrying does not fix.
  const s = spy([fail("a"), fail("b"), fail("c"), ok([99])]);
  const slept: number[] = [];

  await quiet(() =>
    assert.rejects(() =>
      readRows("t", s.build, {
        sleep: async (ms) => {
          slept.push(ms);
        },
      }),
    ),
  );

  assert.equal(s.calls, READ_ATTEMPTS);
  assert.deepEqual(slept, READ_RETRY_DELAYS_MS);
  assert.equal(slept.length, READ_ATTEMPTS - 1);
});

test("every attempt gets a fresh signal that is not already aborted", async () => {
  // The trap this catches would make retries useless in production while every
  // other test here still passed: an AbortSignal.timeout reused across attempts
  // is already aborted by the time attempt 2 runs, so attempt 2 dies instantly.
  const s = spy([fail("first"), ok([1])]);
  await quiet(() => readRows("t", s.build, { sleep: noSleep }));

  assert.equal(s.signals.length, 2);
  assert.notEqual(s.signals[0], s.signals[1]);
  assert.equal(s.signals[1].aborted, false);
});

test("a truncated response throws instead of rendering partial data", async () => {
  // PostgREST caps at 1000 rows and reports success. Measured on this project:
  // an unbounded select on a 3,375-row table returned exactly 1000 with a null
  // error, so the count comparison is the only thing that can detect it.
  const s = spy([ok(Array.from({ length: 1000 }, (_, i) => i), 3375)]);

  await quiet(() =>
    assert.rejects(
      () => readRows("sparklines", s.build, { sleep: noSleep }),
      (error: Error) => {
        assert.match(error.message, /row cap hit/);
        assert.match(error.message, /1000 of 3375/);
        return true;
      },
    ),
  );
});

test("an exact count that matches, or no count at all, does not throw", async () => {
  const matching = spy([ok([1, 2], 2)]);
  assert.deepEqual(await readRows("t", matching.build, { sleep: noSleep }), [1, 2]);

  // Reads with a natural small bound do not ask for a count; a missing one must
  // not be read as a shortfall against zero.
  const uncounted = spy([ok([1, 2])]);
  assert.deepEqual(await readRows("t", uncounted.build, { sleep: noSleep }), [1, 2]);
});

test("readMaybeOne returns null for an absent row without throwing", async () => {
  // The stories lookup: no row is a normal answer for a stock that has
  // not been summarised yet, and must stay distinguishable from a failed read.
  const rows = await readMaybeOne<{ id: number }>(
    "summary",
    () => Promise.resolve({ data: null, error: null }),
    { sleep: noSleep },
  );
  assert.equal(rows, null);

  await quiet(() =>
    assert.rejects(() =>
      readMaybeOne(
        "summary",
        () => Promise.resolve({ data: null, error: { message: "down" } }),
        { sleep: noSleep },
      ),
    ),
  );
});
