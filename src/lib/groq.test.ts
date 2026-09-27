import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { generateJson, GroqOutputError, GroqRateLimitError, GroqTransportError } from "./groq.ts";

const realFetch = globalThis.fetch;
beforeEach(() => { process.env.GROQ_API_KEY = "test"; });
afterEach(() => { globalThis.fetch = realFetch; });

function respond(status: number, body: unknown) {
  globalThis.fetch = (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as typeof fetch;
}

test("429 is a rate limit, which is also a transport failure", async () => {
  respond(429, { error: { message: "slow down" } });
  await assert.rejects(generateJson("p"), (e) => e instanceof GroqRateLimitError && e instanceof GroqTransportError);
});

test("413 and 5xx are transport failures, even with an HTML body", async () => {
  for (const [status, body] of [[413, { error: { message: "too large" } }], [502, "<html>bad gateway</html>"]] as const) {
    respond(status, body);
    await assert.rejects(generateJson("p"), GroqTransportError);
  }
});

test("a network failure or timeout is a transport failure", async () => {
  globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  await assert.rejects(generateJson("p"), GroqTransportError);
  globalThis.fetch = (async () => { throw new DOMException("aborted", "TimeoutError"); }) as typeof fetch;
  await assert.rejects(generateJson("p"), GroqTransportError);
});

test("model defects are not transport failures", async () => {
  respond(400, { error: { message: "schema", failed_generation: "{bad" } });
  await assert.rejects(generateJson("p"), (e) => e instanceof GroqOutputError && !(e instanceof GroqTransportError));
  respond(400, { error: { message: "bad request" } });
  await assert.rejects(generateJson("p"), (e) => !(e instanceof GroqTransportError));
  respond(200, { choices: [{ finish_reason: "length", message: { content: "{" } }] });
  await assert.rejects(generateJson("p"), (e) => !(e instanceof GroqTransportError));
});

test("a complete answer parses", async () => {
  respond(200, { choices: [{ finish_reason: "stop", message: { content: '{"a":1}' } }], usage: { total_tokens: 5 } });
  const { data, tokens } = await generateJson<{ a: number }>("p");
  assert.deepEqual(data, { a: 1 });
  assert.equal(tokens, 5);
});
