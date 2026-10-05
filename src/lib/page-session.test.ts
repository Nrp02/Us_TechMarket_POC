import assert from "node:assert/strict";
import { test } from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";

// Next initializes this global when booting its server.
Object.assign(globalThis, { AsyncLocalStorage });

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://page-session-test.invalid";
process.env.SUPABASE_SECRET_KEY = "test-key";
const { readPageDay, readPageTickers } = await import("./session.ts");
// The day, then its figures, as the cached page reads in queries.ts compose them.
async function readPageSession(symbols: string[], requestedDate?: string, symbol?: string) {
  const day = await readPageDay(requestedDate, symbol);
  return { ...day, tickers: await readPageTickers(symbols, day, symbol) };
}
const { getMarketSession, getActivity } = await import("./queries.ts");

type Row = Record<string, string | number | null>;
const snapshots: Row[] = [
  { symbol: "NVDA", price: 200, volume: 2, snapshot_at: "2026-09-25T20:00:00Z" },
  { symbol: "AMD", price: 100, volume: 1, snapshot_at: "2026-09-24T20:00:00Z" },
  { symbol: "NVDA", price: 110, volume: 1, snapshot_at: "2026-09-24T20:00:00Z" },
];
const tables: Record<string, Row[]> = {
  activity_days: [{ day: "2026-09-25" }, { day: "2026-09-24" }],
  intraday_snapshots: snapshots,
  price_cache: [
    { symbol: "NVDA", price: 200, change: 2, change_percent: 1, volume: 20, avg_volume: 10, updated_at: "2026-09-25T20:15:00Z" },
    { symbol: "AMD", price: 999, change: 9, change_percent: 9, volume: 99, avg_volume: 11, updated_at: "2026-09-24T20:15:00Z" },
  ],
  daily_closes: [
    { symbol: "NVDA", trading_day: "2026-09-24", close: 110, change: 1, change_percent: 1, volume: 10, avg_volume: 5 },
    { symbol: "AMD", trading_day: "2026-09-24", close: 100, change: -1, change_percent: -1, volume: 20, avg_volume: 10 },
  ],
};

async function withRows<T>(run: (reads: string[]) => Promise<T>, fixture = tables, failTable?: string): Promise<T> {
  const original = globalThis.fetch;
  // Exercise Next's actual unstable_cache with a disposable in-memory cache.
  const runtime = globalThis as typeof globalThis & { __incrementalCache?: unknown };
  const originalCache = runtime.__incrementalCache;
  const entries = new Map<string, unknown>();
  runtime.__incrementalCache = {
    generateSimpleCacheKey: async (key: string) => key,
    get: async (key: string) => entries.has(key) ? { value: entries.get(key), isStale: false } : null,
    set: async (key: string, value: unknown) => { entries.set(key, value); },
  };
  const reads: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "page-session-test.invalid");
    const table = url.pathname.split("/").pop()!;
    reads.push(table);
    if (table === failTable) return new Response(JSON.stringify({ message: "read failed" }), { status: 500 });
    let rows = [...(fixture[table] ?? [])];
    for (const [column, filter] of url.searchParams) {
      if (filter.startsWith("eq.")) rows = rows.filter((r) => String(r[column]) === filter.slice(3));
      if (filter.startsWith("in.(")) rows = rows.filter((r) => filter.slice(4, -1).split(",").includes(String(r[column])));
      if (filter.startsWith("gte.")) rows = rows.filter((r) => String(r[column]) >= filter.slice(4));
      if (filter.startsWith("lt.")) rows = rows.filter((r) => String(r[column]) < filter.slice(3));
    }
    if (url.searchParams.get("order")?.startsWith("snapshot_at.desc")) {
      rows.sort((a, b) => String(b.snapshot_at).localeCompare(String(a.snapshot_at)));
    }
    const count = rows.length;
    if (url.searchParams.has("limit")) rows = rows.slice(0, Number(url.searchParams.get("limit")));
    return new Response(JSON.stringify(rows), { headers: {
      "content-type": "application/json", "content-range": `0-${rows.length - 1}/${count}`,
    } });
  };
  try { return await run(reads); } finally {
    globalThis.fetch = original;
    runtime.__incrementalCache = originalCache;
  }
}

test("a historical Market Session uses its own figures and stored volume average", async () => {
  await withRows(async (reads) => {
    const session = await readPageSession(["NVDA", "AMD"], "2026-09-24");
    assert.equal(session.day, "2026-09-24");
    assert.equal(session.defaultDay, "2026-09-25");
    assert.equal(session.isHistorical, true);
    assert.equal(session.tickers[0].price, 110);
    assert.equal(session.tickers[0].relativeVolume, 2);
    assert.ok(!reads.includes("price_cache"));
    assert.deepEqual(JSON.parse(JSON.stringify(session)), session);
  });
});

test("absent and invalid dates use the stored Live Session, independent of the calendar", async () => {
  await withRows(async () => {
    for (const requested of [undefined, "invalid", "2026-09-26", "2025-01-01", "2026-09-25"]) {
      const session = await readPageSession(["NVDA"], requested);
      assert.equal(session.day, "2026-09-25");
      assert.equal(session.isHistorical, false);
      assert.equal(session.tickers[0].price, 200);
      assert.deepEqual(session.tickers[0].spark, [200]);
    }
  });
});

test("a stock missing the latest Session uses its last Session for stock and peers", async () => {
  await withRows(async (reads) => {
    const session = await readPageSession(["AMD", "NVDA"], undefined, "AMD");
    assert.equal(session.day, "2026-09-24");
    assert.equal(session.defaultDay, session.day);
    assert.equal(session.isHistorical, true);
    assert.deepEqual(session.tickers.map((t) => t.price), [100, 110]);
    assert.ok(!reads.includes("price_cache"));
    const selectedLive = await readPageSession(["AMD", "NVDA"], "2026-09-25", "AMD");
    assert.equal(selectedLive.day, "2026-09-25");
    assert.deepEqual(selectedLive.tickers.map((t) => t.symbol), ["NVDA"]);
  });
});

test("before the first Session, the result is empty rather than invented figures", async () => {
  await withRows(async () => {
    const session = await readPageSession(["NVDA"]);
    assert.equal(session.hasSession, false);
    assert.deepEqual(session.availableDates, []);
    assert.deepEqual(session.tickers, []);
  }, {});
});

test("a failed Session read throws instead of yielding a cacheable empty result", async () => {
  await withRows(async () => {
    await assert.rejects(readPageSession(["NVDA"]), /activity-dates.*read failed/);
  }, tables, "activity_days");
});

test("cached Market and stock reads keep the selected Session and provenance together", async () => {
  await withRows(async (reads) => {
    const market = await getMarketSession("2026-09-24");
    assert.equal(market.day, "2026-09-24");
    assert.equal(market.trackedStocks.find((t) => t.symbol === "NVDA")?.price, 110);
    const activity = await getActivity("NVDA", "2026-09-24");
    assert.equal(activity?.sessionDay, market.day);
    assert.equal(activity?.ticker.price, 110);
    assert.equal(activity?.isHistorical, true);
    const before = reads.length;
    assert.deepEqual(await getActivity("NVDA", "2026-09-24"), activity);
    assert.deepEqual(await getMarketSession("2026-09-24"), market);
    assert.equal(reads.length, before, "cache hits retain the complete Session payload");
    const live = await getActivity("NVDA", "invalid");
    assert.equal(live?.sessionDay, "2026-09-25");
    assert.equal(live?.ticker.price, 200);
    const missingLatest = await getActivity("AMD");
    assert.equal(missingLatest?.sessionDay, "2026-09-24");
    assert.equal(missingLatest?.isHistorical, true);
    assert.equal(missingLatest?.ticker.price, 100);
  });
});

test("a failed cached Session read is retried on the next request", async () => {
  await withRows(async () => {
    const healthyFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => new URL(String(input)).pathname.endsWith("/activity_days")
      ? new Response(JSON.stringify({ message: "temporary outage" }), { status: 500 })
      : healthyFetch(input, init);
    await assert.rejects(getMarketSession("2026-09-24"), /temporary outage/);
    globalThis.fetch = healthyFetch;
    const recovered = await getMarketSession("2026-09-24");
    assert.equal(recovered.trackedStocks.find((t) => t.symbol === "NVDA")?.price, 110);
  });
});

test("a failing intraday read on a page is attempted three times, not multiplied by the client's retries", async () => {
  const original = globalThis.fetch;
  const attempts: Record<string, number> = {};
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!;
    attempts[table] = (attempts[table] ?? 0) + 1;
    if (table === "intraday_snapshots") return new Response(JSON.stringify({ message: "upstream timeout" }), { status: 503 });
    return Response.json(tables[table] ?? [], { headers: { "content-range": `0-0/${(tables[table] ?? []).length}` } });
  };
  try {
    await assert.rejects(readPageSession(["NVDA", "AMD"], "2026-09-25"), /newest-snapshot/);
    assert.equal(attempts.intraday_snapshots, 3);
  } finally {
    globalThis.fetch = original;
  }
});
