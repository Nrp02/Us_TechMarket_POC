// Offline replay of the captured DB evidence. No network or database writes.
import { readFileSync } from "node:fs";

const snapshot = JSON.parse(readFileSync(new URL("./db-snapshot.json", import.meta.url), "utf8"));
const script = readFileSync(new URL("../recent-trend/backfill-manual-analysis.mts", import.meta.url), "utf8");
const literal = script.match(/const fundamentals = "([^"]+)";/)?.[1];
if (!literal) throw new Error("Backfill fundamentals signature not found");
const stories = snapshot.stories;
const result = {
  stockRows: stories.length,
  exactBackfillFundamentalsMatches: stories.filter((r: any) => r.sections.fundamentals === literal).length,
  stockHeadlinesWithTrendOutsideAllowedSection: stories.filter((r: any) => r.sections.headline.text.includes("Recent Trend:")).length,
  templateExplanations: stories.filter((r: any) => /^(Stored same-day related headline:|No same-day symbol-related news record)/.test(r.sections.explanation)).length,
  marketRows: snapshot.market_stories.length,
  templateMarketEvents: snapshot.market_stories.filter((r: any) => /^(Market-relevant stored headlines:|No retained market-level headline passed)/.test(r.sections.marketEvents)).length,
  fundamentalRowsAvailableNow: snapshot.fundamentals.length,
};
console.log(JSON.stringify(result, null, 2));
if (result.stockRows !== 100 || result.exactBackfillFundamentalsMatches !== 100 || result.templateExplanations !== 100 || result.marketRows !== 5 || result.templateMarketEvents !== 5) {
  throw new Error("Captured evidence no longer reproduces the audited backfill signatures");
}
