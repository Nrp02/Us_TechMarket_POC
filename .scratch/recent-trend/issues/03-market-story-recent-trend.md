# 03 — Market Story: VIXY Recent Trend in Volatility & Context

Status: resolved
Blocked by: 01

Wire Recent Trend for each existing proxy using its own loaded history.
Narrate only VIXY's trend in Volatility & Context; reserve other proxies'
trend figures for future work. Document the deferred sector aggregation.

## Acceptance

- Assembler tests verify separate proxy histories, today's close and
  unavailable short/empty history.
- Prompt/guideline explain VIXY's own confirmed closing-price trend as a
  VIX futures proxy, not spot VIX or a forecast.
- Rename the displayed closing card to Market Takeaway; retain the
  `closingSynthesis` instruction and existing XLK YTD chart.
- Real generation verifies trend reasoning stays in Volatility & Context.

## Comments

- Implementation complete: engine wiring, prompt, guideline, assembler
  cases, follow-up comment and heading rename. Browser verification showed
  Market Takeaway with the unchanged XLK YTD chart.
- Owner approved reusing the chart's paginated `getIndexDailyCloses` reader
  after the original query reproduced a 1000-row truncation excluding
  VIXY/XLK. Regression test restores both symbols' trend/volatility data.
- Full suite 184/184, TypeScript and changed-file lint passed. The existing
  `closingSynthesis` section instruction is byte-for-byte unchanged.
- Final live verification with `GROQ_API_TEST-KEY` passed for September 25:
  VIXY no-clear-trend, net -5.03%, unavailable reversal age and no directional
  comparison. Trend appeared only in volatilityContext, not closingSynthesis
  or other cards. Final post-input checks addressed observed indirect leaks
  and direction/net conflation. No DB writes; news/macro omitted from this
  sample. This is sampled verification, not guaranteed model compliance.
