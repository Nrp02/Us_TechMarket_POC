import { generateJson, GroqTransportError } from "./groq.ts";
import { reviewStoryAnalysis } from "./story-analysis-review.ts";
import { db } from "./supabase.ts";

export class StoryAnalysisError extends Error {
  candidate: object | null;
  constructor(message: string, candidate: object | null) { super(message); this.candidate = candidate; }
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

/** A rejected answer stays pending, with feedback available on the next tick. */
export async function generateReviewedAnalysis<T extends object>(
  key: string, prompt: string, schema: Record<string, unknown>, validate: (data: T) => void,
): Promise<T> {
  const { data: prior, error } = await db.from("story_analysis_attempts").select("issues").eq("attempt_key", key).maybeSingle();
  if (error) throw new Error(`analysis feedback read: ${error.message}`);
  const feedback = prior?.issues && !legacySchedulingIssue(prior.issues) ? `Previous attempt failed review. Correct these specific errors without inventing replacement facts:\n${prior.issues.slice(-1600)}\n\n` : "";
  let candidate: T | null = null;
  try {
    const requestPrompt = feedback ? prompt.replace("\nInput:\n", `\n${feedback}Input:\n`) : prompt;
    const model = process.env.STORY_ANALYSIS_MODEL ?? "openai/gpt-oss-120b";
    const { data } = await generateJson<T>(requestPrompt, {
      model, schema, timeoutMs: 30_000,
      reasoningEffort: "medium", maxCompletionTokens: 4500,
    });
    const normalized = data;
    candidate = normalized;
    let validationError: Error | null = null;
    try { validate(normalized); } catch (error) {
      validationError = error instanceof Error ? error : new Error(String(error));
      if (/Missing analytical sections|Market Story missing section/.test(validationError.message)) throw validationError;
    }
    // Review a complete draft even when a numeric/scope check fails, so the
    // next attempt gets the factual and reasoning defects together.
    try { await reviewStoryAnalysis(prompt, normalized as Record<string, unknown>); }
    catch (error) {
      if (!validationError) throw error;
      if (!schedulingFailure(error)) {
        throw new Error(`${validationError.message}; ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (validationError) throw validationError;
    if (prior) {
      const { error } = await db.from("story_analysis_attempts").delete().eq("attempt_key", key);
      if (error) throw new Error(`analysis feedback clear: ${error.message}`);
    }
    return normalized;
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
