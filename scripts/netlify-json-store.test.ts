import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NETLIFY_STORAGE_TIMEOUT_MS, readStoreJson, writeStoreJson, readVersionedStoreJson, compareAndSetStoreJson, updateStoreJson } from "../api/jsonStore.js";
import { PERSISTENT_STORE_TIMEOUT_MS, RequestDeadlineError, runWithRequestDeadline } from "../api/_requestDeadline.js";
import { ACCOUNT_REQUEST_TIMEOUT_MS } from "../src/lib/accountClient.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const realFetch = globalThis.fetch;
const envNames = ["NETLIFY", "NETLIFY_BLOBS_CONTEXT", "NETLIFY_BLOBS_SITE_ID", "NETLIFY_BLOBS_TOKEN", "VERCEL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"];
const previousEnv = new Map(envNames.map((name) => [name, process.env[name]]));
let localDir: string;

function resetFixtures() {
  for (const name of envNames) delete process.env[name];
  process.env.VERCEL = "1";
  process.env.NETLIFY_BLOBS_SITE_ID = "fixture-original-site";
  process.env.NETLIFY_BLOBS_TOKEN = "fixture-original-service-token";
  globalThis.fetch = async () => { assert.fail("Netlify store fixtures must never reach real services."); };
}

const expectedError = (status: number, code: string) => (error: unknown) => {
  assert.ok(error instanceof RequestDeadlineError);
  assert.equal(error.status, status);
  assert.equal(error.code, code);
  assert.doesNotMatch(error.message, /fixture-original-service-token|NETLIFY_BLOBS_TOKEN/);
  return true;
};

const signedURL = "https://signed-blobs-fixture.invalid/object";
function isSigningRequest(input: RequestInfo | URL) { return new URL(String(input)).hostname === "api.netlify.com"; }
const signingResponse = () => new Response(JSON.stringify({ url: signedURL }));

before(async () => {
  resetFixtures();
  const scratchRoot = path.resolve(projectRoot, "work");
  await mkdir(scratchRoot, { recursive: true });
  localDir = await mkdtemp(path.join(scratchRoot, "netlify-store-tests-"));
});
afterEach(resetFixtures);
after(async () => {
  globalThis.fetch = realFetch;
  for (const [name, value] of previousEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  if (localDir) {
    assert.ok(path.resolve(localDir).startsWith(path.resolve(projectRoot, "work") + path.sep));
    await rm(localDir, { recursive: true, force: true });
  }
});

test("Netlify allows its signed URL and payload lookup while auth remains below its client deadline", () => {
  assert.equal(NETLIFY_STORAGE_TIMEOUT_MS, 8_000);
  assert.ok(NETLIFY_STORAGE_TIMEOUT_MS > PERSISTENT_STORE_TIMEOUT_MS);
  assert.ok(2 * NETLIFY_STORAGE_TIMEOUT_MS < ACCOUNT_REQUEST_TIMEOUT_MS);
});

test("Vercel reuses the original Netlify site and all existing namespaces without rewriting keys", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://unused-redis-fixture.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-unused-redis-token";
  const stores = ["astro-rail-accounts", "astro-entitlements", "astro-payment-orders"];
  for (const storeName of stores) {
    let signingCalls = 0;
    let payloadCalls = 0;
    globalThis.fetch = async (input, init) => {
      assert.ok(init?.signal instanceof AbortSignal);
      if (isSigningRequest(input)) {
        signingCalls += 1;
        assert.equal(new URL(String(input)).pathname, `/api/v1/blobs/fixture-original-site/site:${storeName}/users/fixture-owner`);
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-original-service-token");
        return signingResponse();
      }
      assert.equal(String(input), signedURL);
      payloadCalls += 1;
      if (init?.method?.toUpperCase() === "PUT") {
        assert.deepEqual(JSON.parse(String(init.body)), { fixture: storeName });
        return new Response("", { headers: { etag: "fixture-etag" } });
      }
      return new Response(JSON.stringify({ fixture: storeName }));
    };
    assert.deepEqual(await readStoreJson(storeName, "users/fixture-owner", localDir), { fixture: storeName });
    await writeStoreJson(storeName, "users/fixture-owner", { fixture: storeName }, localDir);
    assert.equal(signingCalls, 2);
    assert.equal(payloadCalls, 2);
  }
});

test("native Netlify context takes precedence and reads the uncached origin after a confirmed write", async () => {
  process.env.NETLIFY = "true";
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ siteID: "fixture-native-site", token: "fixture-native-token", edgeURL: "https://cached-native-blobs-fixture.invalid", uncachedEdgeURL: "https://origin-native-blobs-fixture.invalid" })).toString("base64");
  delete process.env.NETLIFY_BLOBS_TOKEN;
  let record = { energy: 5 };
  globalThis.fetch = async (input, init) => {
    // Cached edge reads may still return the old balance after a write. Both
    // operations must use the SDK's strongly-consistent origin endpoint.
    assert.equal(String(input), "https://origin-native-blobs-fixture.invalid/fixture-native-site/site:astro-entitlements/users/fixture-owner");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-native-token");
    assert.ok(init?.signal instanceof AbortSignal);
    if (init?.method?.toUpperCase() === "PUT") {
      record = JSON.parse(String(init.body));
      return new Response("", { headers: { etag: "fixture-etag" } });
    }
    return new Response(JSON.stringify(record));
  };
  await writeStoreJson("astro-entitlements", "users/fixture-owner", { energy: 4 }, localDir);
  assert.deepEqual(await readStoreJson("astro-entitlements", "users/fixture-owner", localDir), { energy: 4 });
});

test("partial explicit Netlify credentials fail closed before Redis or local storage", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://unused-redis-fixture.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-unused-redis-token";
  for (const missing of ["NETLIFY_BLOBS_SITE_ID", "NETLIFY_BLOBS_TOKEN"]) {
    process.env.NETLIFY_BLOBS_SITE_ID = "fixture-original-site";
    process.env.NETLIFY_BLOBS_TOKEN = "fixture-original-service-token";
    delete process.env[missing];
    await assert.rejects(readStoreJson("astro-rail-accounts", "users/fixture-owner", localDir), expectedError(503, "STORE_CONFIGURATION_INVALID"));
    await assert.rejects(writeStoreJson("astro-rail-accounts", "users/fixture-owner", {}, localDir), expectedError(503, "STORE_CONFIGURATION_INVALID"));
  }
});

test("a missing Blob stays null while malformed JSON and provider failures remain errors", async () => {
  globalThis.fetch = async (input) => isSigningRequest(input) ? signingResponse() : new Response(null, { status: 404 });
  assert.equal(await readStoreJson("astro-rail-accounts", "users/fixture-owner", localDir), null);
  globalThis.fetch = async (input) => isSigningRequest(input) ? signingResponse() : new Response('{"fixture":');
  await assert.rejects(readStoreJson("astro-rail-accounts", "users/fixture-owner", localDir), expectedError(502, "STORE_RESPONSE_INVALID"));
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("Fixture private provider error", { status: 503 }); };
  await assert.rejects(readStoreJson("astro-rail-accounts", "users/fixture-owner", localDir), expectedError(503, "STORE_UPSTREAM_ERROR"));
  assert.equal(calls, 1);
});

test("Netlify header and complete body reads share the inherited deadline and signal", async () => {
  for (const stallBody of [false, true]) {
    let upstreamSignal: AbortSignal | undefined;
    globalThis.fetch = async (input, init) => {
      upstreamSignal = init?.signal as AbortSignal;
      if (!stallBody) return new Promise<Response>(() => {});
      if (isSigningRequest(input)) return signingResponse();
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"fixture":')); } }));
    };
    await assert.rejects(runWithRequestDeadline({ expiresAt: Date.now() + 30 }, () => readStoreJson("astro-rail-accounts", "users/fixture-owner", localDir)), expectedError(504, "STORE_REQUEST_TIMEOUT"));
    assert.equal(upstreamSignal?.aborted, true);
  }
});

test("expired and cancelled scopes cannot submit a Netlify request", async () => {
  await assert.rejects(runWithRequestDeadline({ expiresAt: Date.now() - 1 }, () => writeStoreJson("astro-entitlements", "users/fixture-owner", {}, localDir)), expectedError(504, "STORE_REQUEST_TIMEOUT"));
  const caller = new AbortController();
  caller.abort();
  await assert.rejects(runWithRequestDeadline({ expiresAt: Date.now() + 1000, signal: caller.signal }, () => readStoreJson("astro-rail-accounts", "users/fixture-owner", localDir)), expectedError(499, "REQUEST_CANCELLED"));
});

test("failed and unconfirmed Netlify payload PUTs are never retried by the SDK", async () => {
  for (const mode of ["http", "network", "headers", "body"] as const) {
    let payloadCalls = 0;
    globalThis.fetch = async (input, init) => {
      if (isSigningRequest(input)) return signingResponse();
      assert.equal(String(input), signedURL);
      assert.equal(init?.method?.toUpperCase(), "PUT");
      payloadCalls += 1;
      if (mode === "network") throw new Error("Fixture private network details");
      if (mode === "headers") return new Promise<Response>(() => {});
      if (mode === "body") return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); } }));
      return new Response("Fixture private server details", { status: 503 });
    };
    await assert.rejects(runWithRequestDeadline({ expiresAt: Date.now() + 30 }, () => writeStoreJson("astro-entitlements", "users/fixture-owner", { energy: 4 }, localDir)), expectedError(503, "STORE_WRITE_UNCONFIRMED"));
    assert.equal(payloadCalls, 1);
  }
});


test("Netlify conditional writes reject a stale ETag and preserve the latest value", async () => {
  let value: any = null;
  let etag = "";
  let revision = 0;
  globalThis.fetch = async (input, init) => {
    if (isSigningRequest(input)) return signingResponse();
    const headers = new Headers(init?.headers);
    if (init?.method?.toUpperCase() === "PUT") {
      const matches = value === null ? headers.get("if-none-match") === "*" : headers.get("if-match") === etag;
      if (!matches) return new Response(null, { status: 412 });
      value = JSON.parse(String(init.body)); etag = `fixture-${++revision}`;
      return new Response("", { headers: { etag } });
    }
    return value === null ? new Response(null, { status: 404 }) : new Response(JSON.stringify(value), { headers: { etag } });
  };
  assert.equal(await compareAndSetStoreJson("fixture", "counter", { count: 0 }, null, localDir), true);
  const old = await readVersionedStoreJson<any>("fixture", "counter", localDir);
  await Promise.all([1, 2].map(() => updateStoreJson<any>("fixture", "counter", localDir, current => ({ count: current.count + 1 }))));
  assert.equal(value.count, 2);
  assert.equal(await compareAndSetStoreJson("fixture", "counter", { count: -1 }, old.version, localDir), false);
  assert.equal(value.count, 2);
});

test("Netlify refuses versionless existing records and never retries an uncertain conditional PUT", async () => {
  let writes = 0;
  globalThis.fetch = async (input, init) => {
    if (isSigningRequest(input)) return signingResponse();
    if (init?.method?.toUpperCase() === "PUT") { writes++; return new Response("failure", { status: 503 }); }
    return new Response('{"count":1}');
  };
  await assert.rejects(readVersionedStoreJson("fixture", "counter", localDir), expectedError(503, "STORE_VERSION_MISSING"));
  assert.equal(writes, 0);
  await assert.rejects(compareAndSetStoreJson("fixture", "counter", { count: 2 }, "fixture-etag", localDir), expectedError(503, "STORE_WRITE_UNCONFIRMED"));
  assert.equal(writes, 1);
});
