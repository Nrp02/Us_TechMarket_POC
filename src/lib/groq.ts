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
  rateLimitTokens: number | null;
  remainingTokens: number | null;
};

/**
 * The request never produced a model answer: network failure, timeout, 413 or
 * 5xx. A scheduling problem for a later tick, never feedback for the model.
 */
export class GroqTransportError extends Error {}

/** Thrown on a 429 so the caller can skip the stock rather than retry or fail the run. */
export class GroqRateLimitError extends GroqTransportError {}

/** Provider-rejected output is diagnostic data, never an accepted narrative. */
export class GroqOutputError extends Error {
  failedGeneration: string;
  constructor(message: string, failedGeneration: string) { super(message); this.failedGeneration = failedGeneration; }
}

type GroqResponse = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { total_tokens?: number; completion_tokens?: number };
  error?: { message: string; failed_generation?: string };
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
    schema,
    model: requestedModel,
  }: {
    timeoutMs?: number;
    schema?: Record<string, unknown>;
    model?: string;
    /** Groq's `reasoning_effort` param — this model only thinks before answering when it's set. */
    reasoningEffort?: "none" | "low" | "medium" | "high";
    /** Groq's `max_completion_tokens` — the backstop now that the prompt sets no sentence cap. */
    maxCompletionTokens?: number;
  } = {},
): Promise<GroqCallResult<T>> {
  const model = requestedModel ?? process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not configured");

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        reasoning_format: "hidden",
        response_format: schema ? { type: "json_schema", json_schema: { name: "story_analysis", strict: true, schema } } : { type: "json_object" },
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        ...(maxCompletionTokens ? { max_completion_tokens: maxCompletionTokens } : {}),
      }),
      cache: "no-store",
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });
  } catch (error) {
    throw new GroqTransportError(`Groq request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (res.status === 429) {
    const rejected = await res.json() as GroqResponse;
    throw new GroqRateLimitError(`Groq 429: ${rejected.error?.message ?? "rate limited"}`);
  }

  // A gateway 5xx can answer with an HTML page; an unparseable body must not
  // surface as a SyntaxError that reads like a model defect.
  const json = (await res.json().catch(() => ({}))) as GroqResponse;
  if (!res.ok) {
    if (json.error?.failed_generation) throw new GroqOutputError(`Groq ${res.status}: ${json.error.message}`, json.error.failed_generation);
    const message = `Groq ${res.status}: ${json.error?.message ?? "request failed"}`;
    throw res.status === 413 || res.status >= 500 ? new GroqTransportError(message) : new Error(message);
  }

  const choice = json.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new Error(`Groq ${model} completion exhausted its token budget (${json.usage?.completion_tokens ?? "?"} tokens); refusing partial analysis`);
  }
  const text = choice?.message?.content;
  if (!text) {
    throw new Error(`Groq returned no content (finish_reason: ${choice?.finish_reason ?? "unknown"})`);
  }

  return {
    data: JSON.parse(text) as T,
    tokens: json.usage?.total_tokens,
    completionTokens: json.usage?.completion_tokens,
    rateLimitTokens: res.headers.has("x-ratelimit-limit-tokens") ? Number(res.headers.get("x-ratelimit-limit-tokens")) : null,
    remainingTokens: res.headers.has("x-ratelimit-remaining-tokens") ? Number(res.headers.get("x-ratelimit-remaining-tokens")) : null,
  };
}
