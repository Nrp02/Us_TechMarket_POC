# Recent Trend — Scrutinize review

## Intent and smaller alternative

Give both existing narratives deterministic recent closing-price context
without adding a display surface, data source or prediction. Existing
volatility/period-performance engines do not detect closing-price swings;
the small pure engine is warranted. Reusing the existing paginated chart
reader is smaller and more consistent than building a second reader.

## Findings addressed

### Major: Market generation omitted VIXY and XLK history

The original `.in(INDEX_SYMBOLS).lte(day)` query returned exactly 1000 rows
with no error: DIA 251, QQQ 251, SOXX 251, SPY 247; VIXY/XLK absent. The
generation job now calls `getIndexDailyCloses` in
`src/lib/market-story-generation.ts`, sharing the reader already used by
charts in `src/lib/queries.ts:567`. It retains complete history through
`readAllRows`, deterministic ordering and count verification. This fixes a
real wiring failure, not an absent-history fallback. The owner approved
extra DB page reads; no schema, upstream call or schedule changed.

### Major: direction and signed net window change could be conflated

For September 25, NVDA's engine output was downtrend, +6.69% net over the
window, age 3 trading days; today's move was +0.22%. Several live responses
called that a continuation of an upward swing despite local instructions.
The prompt assemblers now supply a qualitative sign-comparison label and
make it authoritative. The engine's researched rules/output are unchanged.
The next live stock response correctly called today a move against the
downtrend; global requirements were then added to prevent omitted metadata
and use in other sections.

### Major: null age did not imply that no swing existed

Multiple swings without both same-kind pairs produce no-clear-trend and
no qualifying reversal age. Prompts now explain null as unavailable age,
not proof there were no swings/reversals, and distinguish unclear structure
from flat prices. This avoids a stronger claim than the engine supports.

## Traced paths and checks

- Stock: `generateStories` remains Top-20-only → `generateOneStory` loads
  existing history → `buildStoryInput` at `src/lib/story-input.ts:158` →
  engine → private production prompt → unchanged stories output fields →
  existing Unusual vs. History card. Percentile still excludes today's row;
  trend includes it. `NO_UNUSUALNESS` and its condition are unchanged.
- Market: resolved session → existing paginated history reader →
  `buildMarketStoryInput` at `src/lib/market-story-input.ts:115` filters per
  symbol → engine → per-proxy prompt metadata, VIXY-only narration →
  existing volatilityContext field/card. The closingSynthesis instruction
  is unchanged; only its displayed heading changed at
  `src/components/market-story.tsx:220`.
- Engine: `src/lib/trend-detection.ts:29` sorts a copy, takes ten rows,
  detects strict two-sided swings, compares same-kind pairs, reads a single
  leg, or uses the named no-swing threshold. Conflicts, equality and partial
  pairs remain unclear; reversals need at least two later trading days.
- 184/184 tests passed, including V/inverted-V, conflicting structures,
  tie rejection, two-day confirmation, immutability, short history,
  per-symbol wiring and the 1000-row pagination regression.
- TypeScript, changed-file ESLint and diff whitespace checks passed.
  Full lint had zero errors; warnings were in pre-existing skill files.
- Browser showed Market Takeaway and its original XLK chart. No layout,
  chart, stored narrative, schema, cron or deployment was changed.

## Verification limit and rerun

The manual script extracts actual private prompt/read functions and uses
the production Groq client with real cached numeric data. It omits
news/macro/fundamentals for these samples, performs no DB writes and does
not test scheduled persistence. Missing-history serialization was also
checked directly. It is a manual harness, not a new production test seam.

The old test account exhausted its daily token allowance. The owner supplied
`GROQ_API_TEST-KEY`; the harness maps it to GROQ_API_KEY only within its own
process. Production configuration, model, effort and token ceiling unchanged.

Final sampled outputs passed Recent Trend checks for September 25:

- Stock: downtrend, +6.69% net, age 3 trading days, today against trend;
  confined to unusualness (3607 total tokens).
- Market: VIXY no-clear-trend, -5.03% net, unavailable age and unavailable
  directional comparison; confined to volatilityContext (4817 total tokens).
  closingSynthesis used only today's VIXY decline, not recent trend.

Several earlier outputs violated these rules; final post-input Market JSON
checks and the stock directional-verdict restriction address those observed
failures. A successful sample is not a guarantee of future LLM compliance.
Unrelated ranking contradictions remain in the market sample: standoutMovers
calls QQQ +0.46% the largest index move despite DIA +0.94%, and sectorLeadership
calls semiconductors +1.30% leader despite hardware +1.65%. No broad narrative
ranking fix was made as part of these Recent Trend tickets.

For repeat verification, set the dedicated test variable and run from the
repo root, pacing calls for the account:

```sh
node --experimental-strip-types --env-file=.env.local --import ./scripts/test-resolve.mts .scratch/recent-trend/smoke-generation.mts stock
node --experimental-strip-types --env-file=.env.local --import ./scripts/test-resolve.mts .scratch/recent-trend/smoke-generation.mts market
```

Read the output: require correct direction comparison, net change and
non-null age in trading days, no prediction, and Recent Trend only in the
designated section. LLM grounding is not guaranteed by a passing engine
test or a correct input label.

Verdict: Recent Trend tickets verified and resolved; no deployment or stored
story regeneration performed. Broader narrative ranking reliability remains
a separate follow-up, and sampled LLM output is not a deterministic guarantee.
