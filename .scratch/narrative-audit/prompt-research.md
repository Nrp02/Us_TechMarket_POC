# Evidence-grounded story analysis

## Primary references

- [CFA Institute Standard V(A): Diligence and Reasonable Basis](https://www.cfainstitute.org/standards/professionals/code-ethics-standards/standards-of-practice-v-a): analysis needs an adequate research basis. Applied here as source-supported interpretations, not an inferred cause from a price label.
- [CFA Institute Standard V(B): Communication](https://www.cfainstitute.org/standards/professionals/code-ethics-standards/standards-of-practice-v-b): distinguish facts from opinions and disclose limitations. Applied as observations, qualified interpretation, alternatives and unresolved residuals. These standards do not establish our stock classifications or causal thresholds.
- [Groq Reasoning](https://console.groq.com/docs/reasoning): GPT-OSS supports low/medium/high effort; completion budget also bounds reasoning. Effort is tuned against actual full inputs, not assumed to improve quality on its own.
- [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs): GPT-OSS20B/120B support strict JSON schemas. Used to constrain output shape, not to claim factual correctness.

## Implementation decisions

The engine owns arithmetic, direction/threshold labels and session data. AI owns every published paragraph. Receipts identify source groups used for each published interpretation; they do not expose private model reasoning. A separate final-answer review checks meaning against all selected input. Deterministic checks also reject invented/re-rounded percentages, misplaced/missing Recent Trend facts and selected missing-data fallacies. None of these alone proves causation or guarantees narrative quality.

Stock prompts bound same-day evidence to six ranked articles, preserving original indices; prior context chooses four business-relevant items from the latest twelve within thirty days. This is retrieval selection, not an exhaustive source search. Provider snippets are retained privately for new articles; old rows cannot recover unretained source detail. No web facts are silently injected into historical trading-day stories.

## Experiments

- Legacy20B medium with full23 news/20 context:413 over8000TPM. Bound and simplify input.
-20B medium and120B medium with JSON object: missing/invalid evidence receipts, unsupported business claims. Do not publish.
- Strict receipt schema constrains structure; sample still falsely inferred no earnings release from missing fundamentals and asserted unsupported annual market comparison. Add targeted checks and strengthen independent review; structure success is not quality acceptance.
- Live request header confirmed8000 token/minute budget. One narrative attempt per cron tick, with a separate review model budget; correction feedback survives to the next tick. No rejected narrative is written to stories.

- Default story author: GPT-OSS120B, medium effort, strict JSON; independent reviewer: GPT-OSS20B, low effort. Medium review repeatedly returned invalid/truncated JSON at the measured budget, so effort was reduced after actual trials.
- Fixed review false positives: all selected sources must be visible, prior-session after-close news is available for the next session, generic longer-term YTD description is not the separate ten-day Recent Trend.
- Engine now supplies rounded coverage percentage; otherwise a legitimate 20/43 ≈47% inference was rejected by the no-new-percentages gate. Coverage is distinct from significant-movement count.
- NVDA25 sample passed structural and semantic gates, but manual reading found excessive ranking of prior ETF-allocation commentary. Tightened guideline/reviewer to require session-specific corroboration before calling that the preferred cause. No new narrative DB rewrite yet.
