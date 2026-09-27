import { readMaybeOne, readRows } from "./db-read.ts";
import { generateJson, GroqTransportError } from "./groq.ts";
import { type AnalysisPrompt, renderAnalysisPrompt } from "./story-analysis-quality.ts";
import { db } from "./supabase.ts";

export class StoryAnalysisError extends Error {
  candidate: object | null;
  constructor(message: string, candidate: object | null) { super(message); this.candidate = candidate; }
}

/** What an analysis is about; its attempt row is keyed on this and nothing else. */
export type AnalysisSubject = { kind: "stock"; day: string; symbol: string } | { kind: "market"; day: string };

function attemptKey(subject: AnalysisSubject): string {
  return subject.kind === "stock" ? `stock:${subject.day}:${subject.symbol}` : `market:${subject.day}`;
}

/** Transport failures are for a later tick; only model defects become feedback. */
function schedulingFailure(error: unknown): boolean {
  return error instanceof GroqTransportError;
}

// Rows written before GroqTransportError existed may still hold a transport
// message; never replay one to the model as a correction.
function legacySchedulingIssue(issues: string): boolean {
  return /^Groq (?:429|413|5\d\d):|fetch failed/.test(issues);
}

/**
 * When each stock last had a draft rejected on `day`, by symbol. A stock with
 * no rejection is absent, so sorting on this puts untried stocks first and a
 * repeatedly rejected one cannot consume every tick and starve the others.
 */
export async function stockAttemptTimes(day: string): Promise<Map<string, string>> {
  const prefix = attemptKey({ kind: "stock", day, symbol: "" });
  const rows = await readRows<{ attempt_key: string; updated_at: string }>("story-attempt-times", (signal) =>
    db.from("story_analysis_attempts").select("attempt_key,updated_at").like("attempt_key", `${prefix}%`).abortSignal(signal));
  return new Map(rows.map((r) => [r.attempt_key.slice(prefix.length), r.updated_at]));
}

/** A rejected answer stays pending, with feedback available on the next tick. */
export async function generateValidatedAnalysis<T extends object>(
  subject: AnalysisSubject, prompt: AnalysisPrompt, schema: Record<string, unknown>, validate: (data: T) => void,
): Promise<T> {
  const key = attemptKey(subject);
  const prior = await readMaybeOne<{ issues: string | null }>("analysis-feedback", (signal) =>
    db.from("story_analysis_attempts").select("issues").eq("attempt_key", key).abortSignal(signal).maybeSingle());
  const feedback = prior?.issues && !legacySchedulingIssue(prior.issues) ? `Previous attempt failed validation. Correct these specific errors without inventing replacement facts:\n${prior.issues.slice(-1600)}\n\n` : "";
  let candidate: T | null = null;
  try {
    const model = process.env.STORY_ANALYSIS_MODEL ?? "openai/gpt-oss-120b";
    const { data } = await generateJson<T>(renderAnalysisPrompt(prompt, feedback), {
      model, schema, timeoutMs: 30_000,
      reasoningEffort: "medium", maxCompletionTokens: 4500,
    });
    candidate = data;
    validate(data);
    if (prior) {
      const { error } = await db.from("story_analysis_attempts").delete().eq("attempt_key", key);
      if (error) throw new Error(`analysis feedback clear: ${error.message}`);
    }
    return data;
  } catch (error) {
    // Rate limits are scheduling constraints, not instructions for the model.
    if (!schedulingFailure(error)) {
      const current = error instanceof Error ? error.message : "Analysis validation failed";
      // Keep the current complete diagnostic, not a growing list of obsolete
      // errors which crowds out sources and can reintroduce corrected claims.
      const issues = current.slice(-2000);
      const { error: writeError } = await db.from("story_analysis_attempts")
        .upsert({ attempt_key: key, issues, updated_at: new Date().toISOString() });
      if (writeError) throw new Error(`${issues}; feedback persistence failed: ${writeError.message}`);
    }
    if (candidate && error instanceof Error) throw new StoryAnalysisError(error.message, candidate);
    throw error;
  }
}
