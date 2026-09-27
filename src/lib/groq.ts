// Groq client, used only by the Today's Story narrative job. Separate from and
// unaffected by src/lib/gemini.ts, which handles AI Daily Summary —
// the two providers were split because Groq's binding constraint is
// tokens-per-minute (measured live: 8,000 TPM against a 1,000/day rolling
// request budget) rather than Gemini's per-day request cap, which is what
// makes a per-stock call viable here instead of Gemini's per-day quota
// forcing a multi-stock batch.

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export type GroqCallResult<T> = {
  data: T;
  tokens: number | undefined;
  /** Completion tokens alone — what `max_completion_tokens` actually bounds, unlike `tokens` (prompt+completion). */
  completionTokens: number | undefined;
};

/** Thrown on a 429 so the caller can skip the stock rather than retry or fail the run. */
export class GroqRateLimitError extends Error {}

type GroqResponse = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { total_tokens?: number; completion_tokens?: number };
  error?: { message: string };
};

/**
 * One structured-JSON chat completion. No built-in retry — a 429 here means
 * the caller's own pacing has to back off across scheduled runs, not spend a
 * second call chasing the same limit inside one.
 */
export async function generateJson<T>(
  prompt: string,
  {
    timeoutMs,
    reasoningEffort,
    maxCompletionTokens,
  }: {
    timeoutMs?: number;
    /** Groq's `reasoning_effort` param — this model only thinks before answering when it's set. */
    reasoningEffort?: "low" | "medium" | "high";
    /** Groq's `max_completion_tokens` — the backstop now that the prompt sets no sentence cap. */
    maxCompletionTokens?: number;
  } = {},
): Promise<GroqCallResult<T>> {
  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not configured");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(maxCompletionTokens ? { max_completion_tokens: maxCompletionTokens } : {}),
    }),
    cache: "no-store",
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });

  if (res.status === 429) {
    throw new GroqRateLimitError(`Groq 429: rate limited`);
  }

  const json = (await res.json()) as GroqResponse;
  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${json.error?.message ?? "request failed"}`);
  }

  const choice = json.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new Error("Groq completion exhausted its token budget; refusing partial analysis");
  }
  const text = choice?.message?.content;
  if (!text) {
    throw new Error(`Groq returned no content (finish_reason: ${choice?.finish_reason ?? "unknown"})`);
  }

  return {
    data: JSON.parse(text) as T,
    tokens: json.usage?.total_tokens,
    completionTokens: json.usage?.completion_tokens,
  };
}
