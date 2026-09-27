throw new Error("Retired: analytical sections must be generated and reviewed from engine evidence via scripts/backfill-story-analysis.mts --ai");
// Assemble the agent's 100 individually authored explanations/business reads
// with the production engines' numerical context. No provider or DB calls.
import { readFileSync, writeFileSync } from "node:fs";
import { formatPercent, formatPrice } from "../../src/lib/format.ts";
import type { StoryInput } from "../../src/lib/story-input.ts";

type Note = { newsIndex: number; explanation: string; business: string };
const root = new URL("./", import.meta.url);
const inputs = JSON.parse(readFileSync(new URL("historical-inputs.json", root), "utf8"));
const notes = new Map<string, Note>();
for (const line of readFileSync(new URL("editorial-notes.txt", root), "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const [day, symbol, index, explanation, business] = line.split("|");
  const id = `${day}/${symbol}`;
  if (notes.has(id) || !explanation || !business) throw new Error(`Invalid editorial note ${id}`);
  notes.set(id, { newsIndex: Number(index), explanation, business });
}
const percent = (n: number | null) => n == null ? "unavailable" : formatPercent(n);
const points = (n: number | null) => n == null ? "unavailable" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)} percentage points`;

function comparison(s: StoryInput, indices: { symbol: string; changePercent: number }[]) {
  const sector = indices.find((i) => i.symbol === "XLK")!.changePercent;
  const market = indices.find((i) => i.symbol === "SPY")!.changePercent;
  const peer = s.peers.peerAveragePercent;
  const positive = s.price.changePercent > 0;
  const relative = s.peers.vsPeersPercent!;
  const read = relative > 0
    ? positive ? "The stock captured more upside than its selected peer mean" : "The stock held up better than its selected peer mean despite finishing lower"
    : positive ? "A positive close did not translate into peer leadership" : "The stock's loss was deeper than its selected peer mean";
  return `The selected peers averaged ${percent(peer)}, while Technology (XLK) returned ${percent(sector)} and the market (SPY) ${percent(market)}. Against that backdrop, ${s.symbol} returned ${percent(s.price.changePercent)}: ${points(relative)} versus peers, ${points(s.divergence.vsSectorPercent)} versus Technology and ${points(s.divergence.vsMarketPercent)} versus the market. ${read}; absolute direction and relative strength answer different questions.`;
}

function classification(s: StoryInput) {
  const gap = s.divergence.vsMarketPercent;
  const opposite = s.divergence.vsMarketDirection === "opposite";
  return s.movementClassification === "company-specific"
    ? `This reads as company-specific relative performance: the ${points(gap)} stock-to-market gap is large enough to distinguish it from broad-market tracking. ${opposite ? "The stock and broad market moved in opposite directions, strengthening the descriptive distinction." : "The stock and market shared a direction, but their magnitudes were materially different."} This identifies a return pattern; the company evidence in Why It Moved is needed before attributing the gap to a business event.`
    : `This reads as broadly market-wide relative performance: the stock-to-market gap of ${points(gap)} is comparatively limited. ${opposite ? "The small stock and market moves had opposite signs, so this label should not be read as identical direction." : "The shared direction is compatible with a common backdrop."} The label does not establish a cause, and the peer comparison can still reveal stock selection inside that backdrop.`;
}

function unusualness(s: StoryInput) {
  const p = s.volatility.percentile;
  const magnitude = p == null ? "Historical move magnitude cannot be ranked from the available history."
    : `Today's absolute move is around the ${p.toFixed(0)}th percentile of this stock's own past daily magnitudes. ${p >= 90 ? "The magnitude is unusually large relative to that history" : p <= 25 ? "The magnitude is small relative to that history" : "The magnitude is below the most extreme historical moves"}; this is independent of whether the stock beat its peers.`;
  const range = s.volatility.rangeLabel === "near-high"
    ? "The close remains in the upper part of the stored trailing range; price position and the size of today's move are separate observations."
    : s.volatility.rangeLabel === "near-low"
      ? "The close is in the lower part of the stored trailing range; a positive day would not by itself undo that weak price position."
      : "The close is in the middle of the stored trailing range, which is a different question from today's move magnitude.";
  const t = s.recentTrend;
  const relation = t.direction === "no-clear-trend" ? "There is no established directional trend to compare today's move against; the signed window total does not establish one."
    : (s.price.changePercent > 0) === (t.direction === "uptrend")
      ? "Today's move is in the same direction as the supplied trend."
      : "Today's move goes against the supplied trend, rather than continuing it.";
  const age = t.reversalDaysAgo == null ? "No confirmed reversal age is available for this read; that does not prove no swings occurred."
    : `The most recent qualifying confirmed reversal is ${t.reversalDaysAgo} trading days old.`;
  return `${magnitude} ${range} The trailing 10-trading-day direction is ${t.direction}, with net window change ${percent(t.windowChangePercent)}. ${age} ${relation} A same-direction or opposing day describes the past/current relationship, not a forecast or a new confirmed reversal.`;
}

function peerRelation(s: StoryInput) {
  const peers = [...s.peers.breakdown].sort((a, b) => b.changePercent - a.changePercent);
  const high = peers[0];
  const low = peers.at(-1)!;
  const mixed = high.changePercent > 0 && low.changePercent < 0;
  const text = mixed ? "The peer set is split, so the average hides opposing stock responses."
    : "The peer set shares a direction, but its strongest and weakest members still show unequal participation.";
  const stance = s.price.changePercent > high.changePercent ? "The stock exceeded every selected peer, making its relative strength more specific than a favorable average alone."
    : s.price.changePercent < low.changePercent ? "The stock trailed every selected peer, making its relative weakness more specific than an unfavorable average alone."
      : "The stock falls inside the peer span, so the average alone overstates how uniformly it differed from other companies.";
  return `${high.symbol} returned ${percent(high.changePercent)}, versus ${low.symbol} at ${percent(low.changePercent)}. ${text} ${stance} ${s.symbol === "TSLA" ? "These are technology-adjacent comparisons rather than direct automotive peers. " : ""}Historical relative-volume confirmation is unavailable, so price dispersion alone cannot establish a company-specific cause.`;
}

function ytd(s: StoryInput) {
  const { ytdPercent: y, mtdPercent: m } = s.periodPerformance;
  const context = y! > 0 && m! > 0 ? "The month and the year are both positive, placing today's session within a still-positive broader price record."
    : y! > 0 ? "The year remains positive while the month is negative: recent weakness has not erased the full-year gain."
      : m! > 0 ? "The month is positive while the year remains negative: a recovery within a weak year is different from full-year leadership."
        : "Both the month and the year are negative, so the wider price record remains weak rather than being explained by this session alone.";
  const daily = (s.price.changePercent > 0) === (m! > 0)
    ? "Today's direction aligns with the month's sign, but one session cannot establish the business reason for the longer-period result."
    : "Today's direction opposes the month's sign; that interruption does not by itself erase the longer-period result.";
  return `Year-to-date through this session is ${percent(y)}, with month-to-date ${percent(m)}. ${context} ${daily} These are price returns, not a substitute for revenue or earnings growth.`;
}

const stocks = inputs.flatMap((day: { day: string; stocks: StoryInput[]; market: { indices: { symbol: string; changePercent: number }[] } }) => day.stocks.map((s) => {
  const note = notes.get(`${day.day}/${s.symbol}`);
  if (!note) throw new Error(`No authored analysis for ${day.day}/${s.symbol}`);
  const news = note.newsIndex < 0 ? null : s.news[note.newsIndex];
  if (note.newsIndex >= 0 && !news) throw new Error("Invalid selected news index");
  const first = note.explanation.split(/(?<=\.) /)[0];
  return { symbol: s.symbol, story_date: day.day, sections: {
    headline: { text: `${s.symbol} closed at ${formatPrice(s.price.price)}, ${s.price.changePercent >= 0 ? "up" : "down"} ${Math.abs(s.price.changePercent).toFixed(2)}%. ${first}`,
      news: news ? { headline: news.headline, sourceUrl: news.sourceUrl, publishedAt: news.publishedAt } : null },
    comparison: comparison(s, day.market.indices), classification: classification(s), unusualness: unusualness(s),
    explanation: note.explanation,
    fundamentals: `${note.business} The retained record does not include numerical earnings figures known by this session's close, so a quarterly-versus-TTM growth comparison remains unavailable.`,
    peerSectorRelation: peerRelation(s), ytdTakeaway: ytd(s),
  } };
}));
const market = JSON.parse(readFileSync(new URL("market-editorial.json", root), "utf8"));
if (notes.size !== 100 || stocks.length !== 100 || market.length !== 5) throw new Error("Editorial coverage incomplete");
writeFileSync(new URL("authored-draft.json", root), JSON.stringify({ stocks, market }, null, 2));
console.log(JSON.stringify({ stocks: stocks.length, market: market.length, authoredInterpretations: notes.size }));
