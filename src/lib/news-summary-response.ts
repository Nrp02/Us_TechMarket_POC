/**
 * Keep every usable summary in the batch. An id is only ever accepted if it was
 * sent, so a summary can attach only to the article it was written for. Entries
 * that are invented, duplicated or empty are dropped individually; the rest of
 * the batch is still stored. A reply with nothing usable is an error.
 */
export function validateNewsSummaries(data: unknown, ids: string[]): Map<string, string> {
  if (!data || typeof data !== "object" || !("summaries" in data) || !Array.isArray(data.summaries)) {
    throw new Error("News reply must contain a summaries array");
  }
  const expected = new Set(ids);
  const result = new Map<string, string>();
  for (const item of data.summaries) {
    if (!item || typeof item.id !== "string" || typeof item.summary !== "string") continue;
    const summary = item.summary.trim();
    if (!expected.has(item.id) || result.has(item.id) || !summary) continue;
    result.set(item.id, summary);
  }
  if (!result.size) throw new Error("News reply has no usable summaries");
  return result;
}
