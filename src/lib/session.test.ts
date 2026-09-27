import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://session-test.invalid";
process.env.SUPABASE_SECRET_KEY = "test-key";
const { readSessionTickers } = await import("./session.ts");

type Tables = Record<string, Record<string, unknown>[]>;

/** Serves each table's rows whole; the module's own filters decide the answer. */
async function withTables<T>(tables: Tables, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const table = new URL(String(input)).pathname.split("/").pop()!;
    const rows = tables[table] ?? [];
    return new Response(JSON.stringify(rows), {
      headers: { "content-type": "application/json", "content-range": `0-${rows.length - 1}/${rows.length}` },
    });
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const price = (symbol: string, updatedAt: string) => ({
  symbol, price: 100, change: 1, change_percent: 1, volume: 5, avg_volume: 10, updated_at: updatedAt,
});
// Friday 2026-09-25's last bar; the newest session on record.
const friday = { intraday_snapshots: [{ snapshot_at: "2026-09-25T20:00:00Z" }] };

test("the live session is the newest one the snapshots record, not the calendar day", async () => {
  const session = await withTables(
    { ...friday, price_cache: [price("NVDA", "2026-09-25T20:15:00Z")] },
    () => readSessionTickers(["NVDA"]),
  );
  assert.equal(session.day, "2026-09-25");
  assert.equal(session.isLive, true);
  assert.equal(session.tickers.get("NVDA")?.relativeVolume, 0.5);
  assert.deepEqual(session.stale, []);
});

// Regression: a refresh forced on Saturday 2026-09-26 stamped every row with
// Saturday's date, and the old "written on `day`'s date" rule then marked
// every Friday stock stale.
test("a refresh forced after the session still describes it", async () => {
  const session = await withTables(
    { ...friday, price_cache: [price("NVDA", "2026-09-26T17:53:00Z")] },
    () => readSessionTickers(["NVDA"], "2026-09-25"),
  );
  assert.ok(session.tickers.has("NVDA"));
});

test("a symbol not refreshed since the session opened is stale, not carried over", async () => {
  const session = await withTables(
    { ...friday, price_cache: [price("NVDA", "2026-09-25T15:00:00Z"), price("AMD", "2026-09-24T20:15:00Z")] },
    () => readSessionTickers(["NVDA", "AMD", "INTC"], "2026-09-25"),
  );
  assert.deepEqual([...session.tickers.keys()], ["NVDA"]);
  assert.deepEqual(session.stale, ["AMD", "INTC"]);
});
