import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatProxyError, requestChatCompletion, runOptionalSearchWithDeadline } from "../api/_chatProxy.js";

const complete = { choices: [{ finish_reason: "stop", message: { content: "Fixture complete answer." } }] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const expectedError = (status: number, code: string) => (error: unknown) => {
  assert.ok(error instanceof ChatProxyError);
  assert.equal(error.status, status);
  assert.equal(error.code, code);
  return true;
};

test("chat proxy enforces its complete JSON protocol without mutating caller input", async () => {
  const payload = { model: "fixture", stream: true, stream_options: { include_usage: true }, messages: [] };
  const result = await requestChatCompletion(payload, "fixture-key", { fetchImpl: async (_input, init) => {
    const forwarded = JSON.parse(String(init?.body));
    assert.equal(forwarded.stream, false);
    assert.equal("stream_options" in forwarded, false);
    assert.ok(init?.signal instanceof AbortSignal);
    return json(complete);
  } });
  assert.equal(payload.stream, true);
  assert.deepEqual(result, { status: 200, data: complete });
});

test("chat deadline includes waiting for upstream headers", async () => {
  let upstreamSignal: AbortSignal | undefined;
  await assert.rejects(requestChatCompletion({}, "fixture-key", { timeoutMs: 15, fetchImpl: (_input, init) => {
    upstreamSignal = init?.signal as AbortSignal;
    return new Promise<Response>(() => {});
  } }), expectedError(504, "AI_UPSTREAM_TIMEOUT"));
  assert.equal(upstreamSignal?.aborted, true);
});

test("chat deadline remains active while consuming the entire response body", async () => {
  const unfinished = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"choices":[')); } });
  await assert.rejects(requestChatCompletion({}, "fixture-key", { timeoutMs: 15, fetchImpl: async () => new Response(unfinished) }), expectedError(504, "AI_UPSTREAM_TIMEOUT"));
});

test("a caller cancellation stops upstream waiting promptly", async () => {
  const caller = new AbortController();
  let upstreamSignal: AbortSignal | undefined;
  const result = requestChatCompletion({}, "fixture-key", { signal: caller.signal, timeoutMs: 1000, fetchImpl: (_input, init) => {
    upstreamSignal = init?.signal as AbortSignal;
    return new Promise<Response>(() => {});
  } });
  caller.abort();
  await assert.rejects(result, expectedError(499, "REQUEST_CANCELLED"));
  assert.equal(upstreamSignal?.aborted, true);
});

test("an already cancelled request never calls the upstream", async () => {
  const caller = new AbortController();
  caller.abort();
  await assert.rejects(requestChatCompletion({}, "fixture-key", { signal: caller.signal, fetchImpl: async () => {
    assert.fail("cancelled requests must not call the provider");
  } }), expectedError(499, "REQUEST_CANCELLED"));
});

test("provider rate limits retain their status and original JSON error", async () => {
  const error = { error: { message: "Fixture rate limit", type: "rate_limit" } };
  const result = await requestChatCompletion({}, "fixture-key", { fetchImpl: async () => json(error, 429) });
  assert.deepEqual(result, { status: 429, data: error });
});

test("provider authentication and billing failures cannot impersonate user account or energy errors", async () => {
  for (const status of [401, 403, 402]) {
    for (const jsonBody of [true, false]) {
      await assert.rejects(requestChatCompletion({}, "fixture-key", { fetchImpl: async () => jsonBody
        ? json({ error: { message: "Fixture private provider credentials and billing details" } }, status)
        : new Response("<html>Fixture private provider details</html>", { status })
      }), (error: unknown) => {
        assert.ok(error instanceof ChatProxyError);
        assert.equal(error.status, 502);
        assert.equal(error.code, status === 402 ? "AI_UPSTREAM_BILLING_ERROR" : "AI_UPSTREAM_AUTH_ERROR");
        assert.equal(error.message, "AI 服务暂时不可用，请稍后重试。");
        return true;
      });
    }
  }
});

test("provider authentication and billing failures cancel unread bodies without waiting for cleanup", async () => {
  for (const status of [401, 403, 402]) {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"error":')); },
      cancel(reason) {
        cancelled = true;
        assert.ok(reason instanceof ChatProxyError);
        // A slow provider cleanup must not replace the already-known failure
        // with a request timeout, or leave its body uncancelled.
        return new Promise<void>(() => {});
      },
    });
    await assert.rejects(requestChatCompletion({}, "fixture-key", { timeoutMs: 100, fetchImpl: async () => new Response(body, { status }) }), expectedError(502, status === 402 ? "AI_UPSTREAM_BILLING_ERROR" : "AI_UPSTREAM_AUTH_ERROR"));
    assert.equal(cancelled, true);
  }
});

test("non-JSON provider failures retain status and become safe JSON errors", async () => {
  const result = await requestChatCompletion({}, "fixture-key", { fetchImpl: async () => new Response("<html>Fixture gateway failure</html>", { status: 503 }) });
  assert.equal(result.status, 503);
  assert.equal(result.data.error.code, "AI_UPSTREAM_ERROR");
  assert.equal(JSON.stringify(result.data).includes("<html>"), false);
});

test("an HTTP success carrying a provider error is not reported as success", async () => {
  const result = await requestChatCompletion({}, "fixture-key", { fetchImpl: async () => json({ error: { message: "Fixture provider error" } }) });
  assert.equal(result.status, 502);
  assert.equal(result.data.error.message, "Fixture provider error");
});

test("malformed success JSON cannot become a completed generation", async () => {
  await assert.rejects(requestChatCompletion({}, "fixture-key", { fetchImpl: async () => new Response('{"choices":[') }), expectedError(502, "AI_RESPONSE_INVALID"));
});

test("length limits, missing completion markers, and empty answers remain incomplete", async () => {
  for (const choice of [
    { finish_reason: "length", message: { content: "Fixture cut off" } },
    { message: { content: "Fixture answer missing marker" } },
    { finish_reason: "stop", message: { content: "   " } },
  ]) {
    await assert.rejects(requestChatCompletion({}, "fixture-key", { fetchImpl: async () => json({ choices: [choice] }) }), expectedError(502, "AI_RESPONSE_INCOMPLETE"));
  }
});

test("transport failures become a distinct 502 instead of leaking network errors", async () => {
  await assert.rejects(requestChatCompletion({}, "fixture-key", { fetchImpl: async () => { throw new Error("fixture network failure"); } }), expectedError(502, "AI_UPSTREAM_UNAVAILABLE"));
});

test("an exhausted request budget returns a timeout before contacting the provider", async () => {
  await assert.rejects(requestChatCompletion({}, "fixture-key", { timeoutMs: 0, fetchImpl: async () => {
    assert.fail("an exhausted budget must not call the provider");
  } }), expectedError(504, "AI_UPSTREAM_TIMEOUT"));
});

test("optional search has an independent deadline and does not retry", async () => {
  let calls = 0;
  await assert.rejects(runOptionalSearchWithDeadline(() => {
    calls += 1;
    return new Promise<string>(() => {});
  }, undefined, 15), expectedError(504, "SEARCH_TIMEOUT"));
  assert.equal(calls, 1);
  await assert.rejects(runOptionalSearchWithDeadline(async () => {
    assert.fail("an exhausted search budget must not issue a search");
  }, undefined, 0), expectedError(504, "SEARCH_TIMEOUT"));
  assert.equal(await runOptionalSearchWithDeadline(async () => "fixture search result", undefined, 100), "fixture search result");
});

test("optional search stops waiting when the caller disconnects", async () => {
  const caller = new AbortController();
  const result = runOptionalSearchWithDeadline(() => new Promise<string>(() => {}), caller.signal, 1000);
  caller.abort();
  await assert.rejects(result, expectedError(499, "REQUEST_CANCELLED"));
});
