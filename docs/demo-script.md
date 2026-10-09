# Demo script

About ten minutes. Open https://ustechmarket.vercel.app on a laptop; keep a phone or iPad ready for the responsive check. The point of each stop is the design decision it shows.

## 1. Market page (`/`) — 2 min

- Read the Session header: every figure on the page describes one trading day, named by its New York date.
- The index cards are **ETF proxies** (QQQ, SPY, DIA, XLK, VIXY); the free tier rejects real index symbols. Say so before being asked.
- Top Movers use the **single Significant Movement rule** (5%, 2.5x volume, or 3% with 1.5x).
- The Market Story: point at a section and show it names figures from the page, and the breadth line states coverage (for example 43 of 43).

*Decision shown:* ADR 0006 (one rule), pages read stored rows only.

## 2. A stock (`/todays-activity/NVDA`) — 3 min

- Switch symbols with the ticker menu; use the date picker to open an earlier Session.
- Walk the order: price and relative volume → intraday chart → timeline → **What Happened Today** (plain account, written by a different model) → **Today's Story** cards.
- In Today's Story, open "Company or Group Move": the engine label (market-wide, sector-wide, company-specific) is computed in code and handed to the AI; the card says whether the evidence confirms it.
- If a card shows an **"Automated check: …"** note, use it: drafts are published and checks are shown rather than hidden.

*Decisions shown:* ADR 0008 (publish, record checks), ADR 0010 (sector-wide), the closing price from the 16:00 bar (ADR 0005).

## 3. News (`/news`) — 1 min

- Change the day and the sector filter. Each blurb is stored once per article, never generated per visitor.
- Mention that ambiguous tickers (AI, F, ON, TEAM) are never matched as ordinary words.

## 4. Behind the scenes — 3 min

Open these files rather than slides:
1. `eslint.config.mjs` — the rule that stops pages importing upstream clients.
2. `src/lib/db-read.ts` — throw, never return `[]`; tell the cached-empty-read story from [performance-and-reliability.md](performance-and-reliability.md).
3. `scripts/setup-cron.mts` — the five schedules and why they live in Supabase.
4. A row in the `stories` table — `sections.checks` shows shown versus logged checks.
5. `npm test` — 268 tests.

## 5. Responsive and failure behaviour — 1 min

Resize or switch to phone/iPad to show the layout at the designed widths.

## Questions to expect

| Question | Answer |
|---|---|
| Does it predict? | No, by rule. The prompts forbid it; checks catch some violations, and a known gap is documented in the README |
| Is the AI quality good? | Honest answer: the numbers are right, the stories describe more than they analyse. The 80-story review and the fixes are in [ai-architecture.md](ai-architecture.md) |
| What does it cost? | $0; every service is on a free tier and quotas are budgeted per provider |
| What if an API is down? | Per-symbol failure isolation, "unknown" for volume, AI jobs defer to the next slot |
| Why not Vercel Cron? | Hobby allows once a day; snapshots need every 15 minutes ([ADR 0002](adr/0002-supabase-cron-not-vercel-cron.md)) |
