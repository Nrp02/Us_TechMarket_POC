// News blurbs only. Paid models and automatic provider/model fallback are excluded.
export const NEWS_MODEL = "dots-studio/dots-3-note-preview:free";

export async function generateNewsJson(
  prompt: string,
  { timeoutMs }: { timeoutMs: number },
): Promise<{ data: unknown; tokens: number | undefined }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  if (timeoutMs <= 0) throw new Error("News job has no AI time remaining");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: NEWS_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 8192,
      reasoning: { enabled: false },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "news_summaries", strict: true,
          schema: {
            type: "object", additionalProperties: false,
            properties: { summaries: { type: "array", items: {
              type: "object", additionalProperties: false,
              properties: { id: { type: "string" }, summary: { type: "string" } },
              required: ["id", "summary"],
            } } },
            required: ["summaries"],
          },
        },
      },
      provider: { require_parameters: true, allow_fallbacks: false },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json();
  if (!res.ok) {
    const metadata = json.error?.metadata;
    const source = [metadata?.provider_name, metadata?.limit_source].filter(Boolean).join(" / ");
    throw new Error(`OpenRouter ${res.status}: ${json.error?.message ?? "request failed"}${source ? ` (${source})` : ""}`);
  }
  const choice = json.choices?.[0];
  if (choice?.finish_reason !== "stop" || !choice.message?.content) {
    throw new Error(`OpenRouter incomplete reply: ${choice?.finish_reason ?? "unknown"}`);
  }
  return { data: JSON.parse(choice.message.content), tokens: json.usage?.total_tokens };
}
