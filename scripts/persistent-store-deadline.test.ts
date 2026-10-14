import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { CHAT_REQUEST_TOTAL_TIMEOUT_MS, PERSISTENT_STORE_TIMEOUT_MS, RequestDeadlineError, runStorageOperation, runWithRequestDeadline } from "../api/_requestDeadline.js";
import { readStoreJson, writeStoreJson } from "../api/jsonStore.js";
import { AI_CLIENT_TIMEOUT_MS, AI_UPSTREAM_TIMEOUT_MS } from "../src/lib/aiRequestBudget.js";

const realFetch = globalThis.fetch;
const fixtureUrl = "https://store-fixture.example.invalid";
const json = (result: unknown) => new Response(JSON.stringify({ result }), { headers: { "Content-Type": "application/json" } });
const expectedError = (status: number, code: string) => (error: unknown) => {
  assert.ok(error instanceof RequestDeadlineError);
  assert.equal(error.status, status);
  assert.equal(error.code, code);
  return true;
};
before(() => {
  process.env.NETLIFY = "";
  process.env.NETLIFY_BLOBS_CONTEXT = "";
  process.env.UPSTASH_REDIS_REST_URL = fixtureUrl;
  process.env.UPSTASH_REDIS_REST_TOKEN = "store-tests-placeholder";
});
afterEach(() => { globalThis.fetch = realFetch; });

test("chat keeps a bounded commit reserve below the client timeout", () => {
  assert.equal(PERSISTENT_STORE_TIMEOUT_MS, 3_000);
  assert.equal(CHAT_REQUEST_TOTAL_TIMEOUT_MS, AI_UPSTREAM_TIMEOUT_MS + PERSISTENT_STORE_TIMEOUT_MS);
  assert.ok(CHAT_REQUEST_TOTAL_TIMEOUT_MS < AI_CLIENT_TIMEOUT_MS);
});

test("a confirmed Redis GET and SET retain their existing storage contract", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(input, fixtureUrl);
    assert.ok(init?.signal instanceof AbortSignal);
    const command = JSON.parse(String(init?.body));
    return json(command[0] === "SET" ? "OK" : JSON.stringify({ fixture: true }));
  };
  assert.deepEqual(await readStoreJson("fixture", "record", "unused"), { fixture: true });
  await writeStoreJson("fixture", "record", { fixture: true }, "unused");
});

test("the inherited deadline bounds Redis header waiting", async () => {
  let upstreamSignal: AbortSignal | undefined;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, fixtureUrl);
    upstreamSignal = init?.signal as AbortSignal;
    return new Promise<Response>(() => {});
  };
  await assert.rejects(runWithRequestDeadline({ expiresAt: Date.now() + 20 }, () => readStoreJson("fixture", "record", "unused")), expectedError(504, "STORE_REQUEST_TIMEOUT"));
  assert.equal(upstreamSignal?.aborted, true);
});

test("the same deadline remains active until the Redis body is complete", async () => {
  globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"result":')); } }));
  await assert.rejects(runWithRequestDeadline({ expiresAt: Date.now() + 20 }, () => readStoreJson("fixture", "record", "unused")), expectedError(504, "STORE_REQUEST_TIMEOUT"));
});

test("an expired or cancelled scope cannot issue a Redis request", async () => {
  globalThis.fetch = async () => { assert.fail("expired or cancelled scopes must not issue requests"); };
  await assert.rejects(runWithRequestDeadline({ expiresAt: Date.now() - 1 }, () => readStoreJson("fixture", "record", "unused")), expectedError(504, "STORE_REQUEST_TIMEOUT"));
  await assert.rejects(runWithRequestDeadline({ expiresAt: Date.now() - 1 }, () => writeStoreJson("fixture", "record", {}, "unused")), expectedError(504, "STORE_REQUEST_TIMEOUT"));
  const caller = new AbortController();
  caller.abort();
  await assert.rejects(runWithRequestDeadline({ expiresAt: Date.now() + 1000, signal: caller.signal }, () => readStoreJson("fixture", "record", "unused")), expectedError(499, "REQUEST_CANCELLED"));
});

test("concurrent request scopes do not share deadlines or cancellation", async () => {
  const signals = new Map<string, AbortSignal>();
  globalThis.fetch = async (_input, init) => {
    const key = JSON.parse(String(init?.body))[1] as string;
    signals.set(key, init?.signal as AbortSignal);
    if (key.endsWith(":short")) return new Promise<Response>(() => {});
    await new Promise((resolve) => setTimeout(resolve, 80));
    return json(JSON.stringify({ key }));
  };
  const short = runWithRequestDeadline({ expiresAt: Date.now() + 20 }, () => readStoreJson("fixture", "short", "unused"));
  const long = runWithRequestDeadline({ expiresAt: Date.now() + 1000 }, () => readStoreJson("fixture", "long", "unused"));
  const [shortResult, longResult] = await Promise.allSettled([short, long]);
  assert.equal(shortResult.status, "rejected");
  if (shortResult.status === "rejected") expectedError(504, "STORE_REQUEST_TIMEOUT")(shortResult.reason);
  assert.deepEqual(longResult, { status: "fulfilled", value: { key: "fixture:long" } });
  assert.equal(signals.get("fixture:short")?.aborted, true);
  assert.equal(signals.get("fixture:long")?.aborted, false);
  assert.equal(await runStorageOperation(async () => "outside scope", 100), "outside scope");
});

test("a disconnected request cancels its pending Redis read", async () => {
  const caller = new AbortController();
  let upstreamSignal: AbortSignal | undefined;
  globalThis.fetch = async (_input, init) => { upstreamSignal = init?.signal as AbortSignal; return new Promise<Response>(() => {}); };
  const result = runWithRequestDeadline({ expiresAt: Date.now() + 1000, signal: caller.signal }, () => readStoreJson("fixture", "record", "unused"));
  caller.abort();
  await assert.rejects(result, expectedError(499, "REQUEST_CANCELLED"));
  assert.equal(upstreamSignal?.aborted, true);
});

test("a SET timeout reports its uncertain outcome without retrying or claiming no mutation", async () => {
  let calls = 0;
  let fixtureApplied = false;
  globalThis.fetch = async (_input, init) => {
    assert.equal(JSON.parse(String(init?.body))[0], "SET");
    calls += 1;
    fixtureApplied = true;
    return new Promise<Response>(() => {});
  };
  await assert.rejects(runWithRequestDeadline({ expiresAt: Date.now() + 20 }, () => writeStoreJson("fixture", "record", {}, "unused")), (error: unknown) => {
    expectedError(503, "STORE_WRITE_UNCONFIRMED")(error);
    assert.match((error as Error).message, /尚未确认.*刷新.*核对/);
    assert.doesNotMatch((error as Error).message, /不会扣|未扣/);
    return true;
  });
  assert.equal(fixtureApplied, true);
  assert.equal(calls, 1);
});

test("malformed Redis responses cannot be silently treated as missing records or confirmed writes", async () => {
  globalThis.fetch = async () => new Response("{}");
  await assert.rejects(readStoreJson("fixture", "record", "unused"), expectedError(502, "STORE_RESPONSE_INVALID"));
  await assert.rejects(writeStoreJson("fixture", "record", {}, "unused"), expectedError(503, "STORE_WRITE_UNCONFIRMED"));
});
