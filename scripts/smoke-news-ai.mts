// Provider-only smoke test: fictional inputs, no ingestion or database writes.
// Run with --env-file=.env.local and --import ./scripts/test-resolve.mts.
import { buildNewsPrompt } from "../src/lib/news-ingest.ts";
import { generateNewsJson, NEWS_MODEL } from "../src/lib/openrouter.ts";
import { validateNewsSummaries } from "../src/lib/news-summary-response.ts";

const fixtures = [
  ["Example Devices reports revenue", "Revenue was $12 million versus $10 million a year earlier. No forecast was provided."],
  ["Example Cloud appoints CFO", "Jordan Lee was named CFO effective October 1. Lee previously worked at Sample Systems."],
  ["Example Motors opens factory", "A Texas assembly plant opened on Tuesday with 200 employees."],
  ["Example Software releases update", "Version 4 of its accounting application includes a new invoice search feature."],
  ["Example Chips signs supply agreement", "It signed a three-year agreement with Sample Hardware. Financial terms were not disclosed."],
  ["Example Retail recalls chargers", "It recalled 500 chargers after overheating reports. Customers were told to stop using affected units."],
  ["Example Telecom shares close lower", "Shares closed 2% lower on Monday. The report did not establish a reason for the change."],
  ["Example Media schedules quarterly results", ""],
  ["Example Storage postpones launch", "The drive launch moved from November to December for additional testing."],
  ["Example Analytics responds to lawsuit", "It denied allegations in a lawsuit filed Friday. The case has not been decided."],
];
const articles = Array.from({ length: 50 }, (_, index) => {
  const [headline, snippet] = fixtures[index % fixtures.length];
  return {
    finnhubId: index + 1, headline, snippet, sourceUrl: "https://example.invalid",
    imageUrl: null, relatedSymbols: [], publishedAt: new Date("2026-09-25T18:00:00Z"),
  };
});
const started = Date.now();
const reply = await generateNewsJson(buildNewsPrompt(articles), { timeoutMs: 28_000 });
const summaries = validateNewsSummaries(reply.data, articles.map(article => String(article.finnhubId)));
console.log(JSON.stringify({ model: NEWS_MODEL, articles: summaries.size, elapsedMs: Date.now() - started,
  tokens: reply.tokens, summaries: [...summaries] }, null, 2));
