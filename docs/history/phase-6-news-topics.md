> Moved verbatim from CLAUDE.md on 2026-09-29 (commit 1dbde83). History and reasoning, not a summary of current behaviour: where this and the code disagree, the code wins.

## Phase 6 — News Topics: IN DESIGN, NOTHING BUILT

**Read this first if you are picking work back up.** The owner and Claude are partway through a design interview (grilling session, started 2026-09-13) for a new AI feature. No code, schema or prompt has changed yet. Resume the interview from "Still open" below rather than starting to build.

**Why it exists.** The owner asked whether the app's AI use is really worth it, and the honest answer was: not much. The news call mostly paraphrases (for copyright), the Daily Summary's `movement` restates figures the stat cards already show, and `explanation` is the fixed fallback line on ~7 of 10 stocks. The AI Safety rules correctly forbid causation and prediction, which left the model only re-telling. This feature gives it a job that is useful *and* inside those rules: **organising** the day's news (Filter → Understand), never judging its effect on price.

**Decided:**

- **The term is `Topic`** — what an article is about (e.g. Earnings, Product). Never call it "category": `category` already means the company / industry / market split on the News page. See `CONTEXT.md`.
- **Scope of the first build:** one Topic label per article, plus a per-stock breakdown on Today's Activity that counts articles by Topic **in code**. The AI does **not** group articles into "stories" (same event, several outlets) in this build — that needs a stable story identity across cycles and days, and is deferred until labels prove useful.
- **Zero extra Gemini calls.** Topic is added as a field to the existing news-summary call's schema (`src/lib/news-ingest.ts`), so the budget stays 12/20 per day.

- **Placement: one card, not two.** The breakdown goes **inside the AI Daily Summary card, above the narrative** — the owner rejected a separate card as clutter. Bonus: that card currently reads "No summary for this session yet" all day until the close, and the breakdown fills it from the first news cycle. Three conditions agreed with it:
  1. **Each half states its own time** ("News by topic · updated 2:00 PM ET" / "Summary · written after the close") — they come from different jobs and must not read as one refresh.
  2. **The narrative's news part (`recap`) gets thinner in the same change**, or the card tells the day's news twice. How thin is still open.
  3. **The breakdown is bounded in size** so the card does not push the chart off an iPad or phone screen.
- **The card counts "12 articles in 3 Topics", never "3 stories"** — no story grouping exists in this build. **A row's text is the newest headline in that Topic**, not an AI gist of the group; nothing produces a per-group gist without another call.

**Still open (ask these next, in this order):**

1. *(settled — see Placement above)*
2. The fixed Topic set. Draft: Earnings · Product · Deal · Regulatory & Legal · Analyst View · Market Wrap · Other. `Analyst View` stays separate because it is the one Topic whose content is opinion.
3. Passing mentions: per article (fold into `Market Wrap`) vs per article × symbol. Claude recommended per article.
4. ~1,400 already-summarised articles have no Topic, and `selectForSummary` never re-sends a summarised article. Recommended: no backfill run; spare slots in each cycle's 25-article batch label old articles, and the breakdown shows an explicit "n not yet labelled" count rather than silently undercounting.
5. Report tone/sentiment: recommended **not** to build — beside a price chart it reads as causation.
6. After those: the per-row text on the card, a Topic filter on the News page, schema/migration, prompt wording.

**Do not re-derive:** there is no numeric "importance/impact score" in this design, for the same reason the Confidence Score was cut — an LLM grading itself is a weak signal; a Topic label is checkable by reading the article.

---

