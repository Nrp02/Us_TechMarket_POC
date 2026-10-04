import { formatChange, formatEtTime, formatPercent, formatPrice, formatRelVolume, formatVolume } from "@/lib/format";
import { SAFETY_RULES } from "@/lib/gemini";
import { firedBranches, isSignificant } from "@/lib/significance";
import { NAME_BY_SYMBOL } from "@/lib/symbols";
import type { Ticker } from "@/lib/session";
import type { Snapshot } from "@/lib/timeline";

export const SUMMARY_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      symbol: { type: "STRING" },
      movement: { type: "STRING" },
      recap: { type: "STRING" },
      explanation: { type: "STRING" },
      bullets: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["symbol", "movement", "recap", "explanation", "bullets"],
  },
};

export type Model = {
  symbol: string;
  movement: string;
  recap: string;
  explanation: string;
  bullets: string[];
};

/** Exact wording required by the AI Safety rules when nothing explains a move. */
export const NO_EXPLANATION =
  "The available information does not establish a clear explanation for this movement.";

/**
 * The structured input for one stock.
 *
 * Every figure is handed over as a finished display string — "$265.13", "30.4M
 * shares", "0.51x the 10-day average" — rather than a bare number. Two reasons:
 * a model given raw numbers restates them raw (a first pass produced "a
 * change_percent of 1" and "38492546"), and a value that arrives already
 * written leaves nothing for it to derive, which is the actual safety rule. The
 * comparisons the reader wants are computed here for the same reason.
 */
export type SummaryInput = ReturnType<typeof buildInput>;

export function buildInput(args: {
  symbol: string;
  day: string;
  price: Ticker;
  snapshots: Snapshot[];
  news: { headline: string; summary: string | null; publishedAt: string }[];
  events: { type: string; date: string; note: string | null }[];
  sectorChange: number | null;
  marketChange: number | null;
}) {
  const { symbol, day, price, snapshots, news, events } = args;

  const changePercent = price.changePercent;
  const relVolume = price.relativeVolume;

  const prices = snapshots.map((s) => s.price);
  const extreme = (pick: (values: number[]) => number) =>
    prices.length ? formatPrice(pick(prices)) : null;

  // Which branch of the shared rule fired, named outright so the model can state
  // the reason without working it back out of the thresholds itself.
  const triggers = firedBranches(changePercent, relVolume);

  return {
    symbol,
    company: NAME_BY_SYMBOL.get(symbol) ?? symbol,
    trading_day: day,
    price: {
      // Key names double as fallback prose: the model occasionally narrates a
      // label verbatim despite being told not to, so these are worded to read
      // acceptably when it does ("a change of +3.01" rather than "a change in
      // dollars of +3.01").
      "closing price": formatPrice(price.price),
      "change": formatChange(price.change),
      "percent change": formatPercent(changePercent),
      "direction": changePercent >= 0 ? "up" : "down",
      "session open": extreme((v) => v[0]),
      "session high": extreme((v) => Math.max(...v)),
      "session low": extreme((v) => Math.min(...v)),
    },
    volume: {
      "shares traded today": price.volume ? `${formatVolume(price.volume)} shares` : null,
      "10-day average volume": price.avgVolume
        ? `${formatVolume(price.avgVolume)} shares`
        : null,
      "volume versus average": relVolume == null
        ? null
        : `${formatRelVolume(relVolume)} the 10-day average, which is ${
            relVolume >= 1 ? "above" : "below"
          } normal`,
    },
    "movement status": {
      verdict: isSignificant(changePercent, relVolume) ? "Significant" : "Normal",
      "rules triggered": triggers,
    },
    "market context": {
      "technology sector ETF (XLK)":
        args.sectorChange == null ? null : formatPercent(args.sectorChange),
      "S&P 500 ETF (SPY)":
        args.marketChange == null ? null : formatPercent(args.marketChange),
    },
    // Only the paraphrase written by the news pipeline is passed on where one
    // exists; the publisher's own headline is a last resort, and the prompt
    // requires it to be rewritten rather than repeated.
    "news today": news.map((item) => ({
      published: formatEtTime(item.publishedAt),
      reported: item.summary ?? item.headline,
    })),
    "upcoming events": events,
  };
}

export function buildPrompt(inputs: SummaryInput[]): string {
  return `You are writing the daily activity summary for each of several US technology
stocks on a stock-tracking dashboard. For every stock in the input, the reader
wants one account of what happened to it today — price, trading volume, news and
scheduled events together — so they never have to assemble it from separate
sections.

Return one entry per stock, each carrying the "symbol" it was given. Treat every
stock separately: never carry a fact, a figure or a news item from one stock's
entry into another's.

Each entry has four parts, which are joined into a single paragraph afterwards.

"movement" — 2 sentences. What that stock's price and trading volume did today,
and whether the day counts as significant. Mention no news here at all.

"recap" — 1-2 sentences. What was reported about this company today, from
"news today", each item in your own words, followed by one sentence naming the
next scheduled event and its date if "upcoming events" is not empty. If
"news today" is empty, write only: "No relevant news was recorded for this stock
today."
  - Never mention the share price here — not a price, not a gain or a loss, not
    a rise or a fall, not even one a report itself described. Those belong in
    "movement" and "explanation" only.
  - Where a report gives a projection, a valuation, a rating or an opinion,
    attribute it ("one report projected...", "an analyst note rated..."). Never
    restate an opinion as though it were established fact.

"explanation" — a single sentence, and the most tightly limited of the four.
Write exactly this and nothing else:
  "${NO_EXPLANATION}"
The one exception: a news item in the input explicitly says this company's share
price moved AND says what moved it. Only then may you write one sentence
attributing that claim to the report: "One report attributed the move to ..."
  - Test it literally. Point to the sentence in "news today" that says the share
    price moved and why. If you cannot, there is no exception and you write the
    fixed sentence.
  - A report that merely mentions the company, announces something notable,
    discloses a holding, or sounds important is NOT such a claim. Neither is a
    move in the same direction as the news sentiment, nor news and a price move
    landing on the same day.
  - Never write "one report attributed" about a report that made no such
    attribution. Inventing the attribution is as wrong as inventing the cause.
  - When in doubt, use the fixed sentence. It is the expected answer on most days.

"bullets" — exactly 5 short bullets. Together they should tell a reader who
skips the paragraph what mattered today, so make them count:
  - one on the price move, one on the volume, and the rest on distinct news
    items, or the next scheduled event if there is little news.
  - Never spend a bullet on a bare figure the paragraph already gave, such as
    "Session high was $496.10" or "The S&P 500 ETF changed by +0.70%". A bullet
    that only repeats a number is wasted.
  - The same limit as "explanation" applies: a bullet may not connect news to
    the price movement unless the report itself did.

Further rules:

1. Every figure is already written out for you in the input. Copy each one
   exactly as it appears, including its currency symbol, sign, percent sign and
   "M"/"B" suffix. Never restate a value in another form, and never work out a
   new one.

2. Write ordinary prose for a general reader. Never quote a label from the input,
   such as "percent change" or "10-day average volume", as if it were a phrase,
   and never use the words "verdict", "movement status", "categorized" or
   "registering" — say plainly that the day was significant, or that it was an
   ordinary one.

3. Rewrite each news item in your own words rather than repeating its wording.

${SAFETY_RULES}

Stocks:
${JSON.stringify(inputs, null, 2)}`;
}
