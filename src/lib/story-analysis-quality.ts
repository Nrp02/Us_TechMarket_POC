// The pure half of the Story analysis job: prompt rendering, the output schema
// and every published-text check. No database or provider import, so the rules
// that decide whether a draft is published can be tested directly.

import type { RecentTrend } from "./trend-detection.ts";

/**
 * A prompt as its two halves. The structured input is kept apart from the
 * instructions so the checks can read the supplied figures directly, and so
 * retry feedback always lands just before the input.
 */
export type AnalysisPrompt = { instructions: string; input: unknown };

export function renderAnalysisPrompt({ instructions, input }: AnalysisPrompt, feedback = ""): string {
  return `${instructions}\n${feedback}Input:\n${JSON.stringify(input)}`;
}

/** Output shape is constrained; `descriptions` narrows what a section may cover. */
export function analysisSchema(
  sections: readonly string[],
  options: { headlineSources?: string[]; descriptions?: Record<string, string> } = {},
) {
  const text = { type: "string" };
  const properties: Record<string, unknown> = Object.fromEntries(sections.map((section) => {
    const description = options.descriptions?.[section];
    return [section, description ? { type: "string", description } : text];
  }));
  if (options.headlineSources) properties.headline = { type: "object", additionalProperties: false, required: ["text", "sourceHeadline"],
    properties: { text, sourceHeadline: { type: ["string", "null"], enum: [...options.headlineSources, null] } } };
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

/** Every named section must be non-empty prose; `headline.text` when the story has one. */
export function requireSections(data: Record<string, unknown>, sections: readonly string[], label: string, headline = false): void {
  const missing: string[] = sections.filter((key) => typeof data[key] !== "string" || !(data[key] as string).trim());
  if (headline) {
    const text = (data.headline as { text?: unknown } | undefined)?.text;
    if (typeof text !== "string" || !text.trim()) missing.push("headline.text");
  }
  if (missing.length) throw new Error(`${label}: ${missing.join(", ")}`);
}

/** The model writes non-breaking hyphens and U+2212; every check reads them as "-". */
export function normalizeDashes(text: string): string {
  return text.replace(/[\u2010-\u2015\u2212]/g, "-");
}

/**
 * Bounds prompt size: the `limit` best-scoring items, back in their original
 * order. `index` always refers to the full list.
 */
export function selectTopArticles<T>(items: T[], score: (item: T) => number, limit = 6): { item: T; index: number }[] {
  return items.map((item, index) => ({ item, index }))
    .sort((a, b) => score(b.item) - score(a.item) || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index);
}

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/**
 * The one section allowed to discuss Recent Trend must state its direction,
 * signed net window change and, when known, the latest swing point's age.
 */
export function validateTrendStated(
  text: string,
  trend: RecentTrend,
  errors: { direction: string; age: string },
): void {
  if (trend.direction == null) return;
  const normalized = normalizeDashes(text);
  const direction = trend.direction === "no-clear-trend" ? /no[- ]clear(?:[- ]directional)?[- ]trend/i : new RegExp(trend.direction, "i");
  if (!direction.test(normalized) || (trend.windowChangePercent != null && !hasSuppliedPercent(normalized, trend.windowChangePercent))) {
    throw new Error(errors.direction);
  }
  const age = trend.reversalDaysAgo;
  if (age != null && !new RegExp(`(?:${age}|${COUNT_WORDS[age] ?? age})\\s+(?:trading[- ]?)?days?`, "i").test(normalized)) {
    throw new Error(errors.age);
  }
}

/** An unsigned positive percentage is still positive; preserve negative signs. */
export function hasSuppliedPercent(text: string, value: number): boolean {
  const digits = Math.abs(value).toFixed(2).replace(".", "\\.");
  return new RegExp(`${value < 0 ? "-" : "(?<![-\\d.])\\+?"}${digits}\\s*%`)
    .test(normalizeDashes(text));
}

/** Catches invented/re-rounded percentages; does not establish causal truth. */
export function validatePublishedFigures(data: Record<string, unknown>, supplied: unknown): void {
  const input = normalizeDashes(JSON.stringify(supplied));
  const known = new Set([...input.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].map((m) => Math.abs(Number(m[1])).toFixed(2)));
  for (const [section, value] of Object.entries(data)) {
    const text = typeof value === "string" ? value : section === "headline" ? (value as { text?: string })?.text : null;
    if (!text) continue;
    for (const match of normalizeDashes(text).matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)) {
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

const FLAT = String.raw`(?:flat|unchanged|little[- ]changed|did not move|didn't move|barely budged)`;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A nonzero named move is never "flat". The reviewer model passed "AMD's flat
 * move" at +0.22%. Matched only when the flat word follows the name closely
 * with no clause break, so "AMD rose while the index was flat" stays valid.
 */
export function validateNoFlatMoves(
  data: Record<string, unknown>,
  moves: { names: string[]; changePercent: number | null }[],
): void {
  const failures: string[] = [];
  for (const [section, value] of Object.entries(data)) {
    const text = typeof value === "string" ? value : (value as { text?: string } | null)?.text;
    if (!text) continue;
    for (const { names, changePercent } of moves) {
      if (changePercent == null || Math.abs(changePercent) < 0.1) continue;
      const near = new RegExp(`\\b(?:${names.map(escape).join("|")})\\b(?:(?!\\b(?:while|but|whereas|as|and|than)\\b)(?:[^.;,]|\\.(?=\\d))){0,30}?\\b${FLAT}\\b`, "i");
      if (near.test(text)) failures.push(`${section}: ${names[0]} moved ${changePercent.toFixed(2)}%, so it is not flat/unchanged`);
    }
  }
  if (failures.length) throw new Error(failures.join("; "));
}
