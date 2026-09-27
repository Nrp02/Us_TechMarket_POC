/** Public reasoning requirements; model self-citations cannot establish factual truth. */
export function analysisContract(sections: readonly string[], critical: readonly string[]): string {
  return `Every section (${sections.join(", ")}) needs a distinct interpretation,
not just observations. For ${critical.join(", ")}, weigh an evidence-grounded
alternative, explain why the preferred reading fits or fails, and state the
unresolved component. Business context must reconcile with relative price
performance. Do not invent a cause to fill a section.`;
}

/** Output shape is constrained; independent source review checks meaning. */
export function analysisSchema(sections: readonly string[], headline = false, newsIds: string[] = []) {
  const text = { type: "string" };
  const properties: Record<string, unknown> = Object.fromEntries(sections.map((section) => [section, text]));
  for (const section of ["overallRead", "standoutMovers", "sectorLeadership", "breadth", "marketEvents", "macroContext", "closingSynthesis"]) {
    if (sections.includes(section)) properties[section] = { type: "string",
      description: "Analyze this session only. Never mention recent trend, uptrend, downtrend, window change or reversal; those belong only in volatilityContext." };
  }
  if (sections.includes("volatilityContext")) properties.volatilityContext = { type: "string",
    description: "Include VIXY exact supplied trend direction, signed net window change, confirmed reversal age and today's comparison. Interpret with daily breadth; this is the ONLY field for recent trend." };
  if (headline) properties.headline = { type: "object", additionalProperties: false, required: ["text", "newsId"],
    properties: { text, newsId: { type: ["string", "null"], enum: [...newsIds, null] } } };
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

/** An unsigned positive percentage is still positive; preserve negative signs. */
export function hasSuppliedPercent(text: string, value: number): boolean {
  const digits = Math.abs(value).toFixed(2).replace(".", "\\.");
  return new RegExp(`${value < 0 ? "-" : "(?<![-\\d.])\\+?"}${digits}\\s*%`)
    .test(text.replace(/[−–]/g, "-"));
}

/** Catches invented/re-rounded percentages; does not establish causal truth. */
export function validatePublishedFigures(data: Record<string, unknown>, prompt: string): void {
  const marker = "\nInput:\n";
  if (!prompt.includes(marker)) throw new Error("No structured input for figure validation");
  const input = prompt.slice(prompt.lastIndexOf(marker) + marker.length).replace(/[−–]/g, "-");
  const known = new Set([...input.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].map((m) => Math.abs(Number(m[1])).toFixed(2)));
  for (const [section, value] of Object.entries(data)) {
    const text = typeof value === "string" ? value : section === "headline" ? (value as { text?: string })?.text : null;
    if (!text) continue;
    for (const match of text.replace(/[−–]/g, "-").matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)) {
      if (!known.has(Math.abs(Number(match[1])).toFixed(2))) throw new Error(`${section}: percentage ${match[0]} is not supplied in the input`);
    }
    if (/\b(?:news|business)(?::|\s+)\d+\b/i.test(text)) throw new Error(`${section}: internal evidence ID leaked into published text; name the source topic or publisher instead of News 0/business:0`);
  }
}

/**
 * Runs every check and throws once with all failures joined, so a rejected
 * draft's feedback names every defect rather than just the first.
 */
export function runAllChecks(checks: (() => void)[]): void {
  const failures: string[] = [];
  for (const check of checks) {
    try { check(); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  if (failures.length) throw new Error(failures.join("; "));
}
