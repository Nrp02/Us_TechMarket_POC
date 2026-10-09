# ADR 0010 — Add a sector-wide engine label

- **Status:** Accepted
- **Decided:** 2026-10-09 (commit `38690fe`)
- **Recorded:** 2026-10-10

## Context

Today's Story is handed an "engine label" for each stock, computed in code: `company-specific` when the stock is 2 or more points from SPY, otherwise `market-wide`. It compared with SPY only.

A review of the stories for 5–8 October found the label misleading when a whole group moved. On 2026-10-08 chip and AI stocks fell together (XLK −1.79%, SPY −0.42%). NVDA (−2.94%, 2.52 points from SPY but 1.15 from XLK and level with its peers) and AMD (−3.90%) were labelled company-specific, and the stories then searched for company-specific causes and wrote lines such as "no peer matched".

## Decision

`classifyMovement(vsMarket, vsSector, vsPeers)`:

| Condition | Label |
|---|---|
| gap to SPY unavailable | `unknown` |
| gap to SPY < 2 points | `market-wide` |
| gap to SPY ≥ 2, but gap to XLK or to the peer mean < 2 | `sector-wide` |
| otherwise | `company-specific` |

The rule text in the prompt (`story-generation.ts`) and the guideline (`story-guideline.ts`) were updated to match. It uses figures already computed, adds no AI calls, and does not rewrite existing stories.

Effect on the 80 reviewed stories: 7 moved from company-specific to sector-wide, including NVDA and AMD on 8 October.

## Consequences

- Group moves are described as group moves. Stocks that fall much further than their group (AVGO, INTC, MU, ORCL that day) stay company-specific, which is correct by the rule.
- The 2-point threshold is shared by all three comparisons and is a product judgment. A stock can be sector-wide against a small-peer mean by coincidence; the story's own `classification` card is asked to say whether the evidence confirms the label.
- The label is a threshold on gaps, not a finding about cause.
- Tests: `movement-classification.test.ts` (including the 2026-10-08 figures) and `story-input.test.ts`.
