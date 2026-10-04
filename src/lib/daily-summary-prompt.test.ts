import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://daily-summary-prompt-test.invalid";
process.env.SUPABASE_SECRET_KEY = "test-key";
const { buildInput, buildPrompt, NO_EXPLANATION } = await import("./daily-summary-prompt.ts");
const { SAFETY_RULES } = await import("./gemini.ts");

const price = {
  symbol: "NVDA", name: "NVIDIA", price: 100, change: 2, changePercent: 2, volume: 2000, relativeVolume: 2,
  avgVolume: 1000, significant: true, score: 3,
} as unknown as Parameters<typeof buildInput>[0]["price"];

test("the summary prompt carries the safety rules, the fallback line and the stock's own supplied figures", () => {
  const input = buildInput({
    symbol: "NVDA", day: "2026-09-25", price, snapshots: [], news: [], events: [],
    sectorChange: 1, marketChange: 0.5,
  });
  const prompt = buildPrompt([input]);
  assert.ok(prompt.includes(SAFETY_RULES));
  assert.ok(prompt.includes(NO_EXPLANATION));
  assert.ok(prompt.includes('"symbol": "NVDA"'));
  assert.ok(prompt.includes('"closing price": "$100.00"'));
  assert.ok(prompt.includes('"technology sector ETF (XLK)": "+1.00%"'));
});
