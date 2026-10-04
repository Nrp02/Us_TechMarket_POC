import { generateJson } from "./groq.ts";
import { type AnalysisPrompt, renderAnalysisPrompt } from "./story-analysis-quality.ts";

/** One model call; warnings are computed locally by the caller, with no review call. */
export async function generateAnalysis<T extends object>(
  prompt: AnalysisPrompt, schema: Record<string, unknown>,
): Promise<T> {
  const { data } = await generateJson<T>(renderAnalysisPrompt(prompt), {
    model: process.env.STORY_ANALYSIS_MODEL ?? "openai/gpt-oss-120b",
    schema, timeoutMs: 30_000,
    reasoningEffort: "medium", maxCompletionTokens: 4500,
  });
  return data;
}
