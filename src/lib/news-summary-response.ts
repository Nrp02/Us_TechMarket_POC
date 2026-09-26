/** Validate the whole batch before any summary can be persisted. */
export function validateNewsSummaries(data: unknown, ids: string[]): Map<string, string> {
  if (!data || typeof data !== "object" || !("summaries" in data) || !Array.isArray(data.summaries)) {
    throw new Error("News reply must contain a summaries array");
  }
  const expected = new Set(ids);
  const result = new Map<string, string>();
  for (const item of data.summaries) {
    if (!item || typeof item.id !== "string" || typeof item.summary !== "string" ||
        !expected.has(item.id) || result.has(item.id) || !item.summary.trim()) {
      throw new Error("News reply has an invalid, duplicate, or unexpected entry");
    }
    result.set(item.id, item.summary.trim());
  }
  if (result.size !== expected.size) throw new Error("News reply is missing articles");
  return result;
}
