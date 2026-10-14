import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpRequest, type Server } from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const realFetch = globalThis.fetch;
let server: Server;
let baseUrl: string;
let scratchDirectory: string;

before(async () => {
  // Import the API from an empty directory so local deployment credentials are
  // never loaded by dotenv. All upstream requests below use a fetch stub.
  const scratchRoot = path.join(projectRoot, "work");
  await mkdir(scratchRoot, { recursive: true });
  scratchDirectory = await mkdtemp(path.join(scratchRoot, "api-tests-"));
  const previousCwd = process.cwd();
  process.env.DEEPSEEK_API_KEY = "api-tests-placeholder";
  process.env.AUTH_SESSION_SECRET = "api-tests-session-placeholder";
  // Tests use only their own fixture files, even if the invoking shell has a
  // cloud runtime or Redis integration configured.
  for (const key of ["VERCEL", "NETLIFY", "NETLIFY_BLOBS_CONTEXT", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) process.env[key] = "";
  let app: typeof import("../api/index.js").app;
  try {
    process.chdir(scratchDirectory);
    ({ app } = await import("../api/index.js"));
  } finally {
    process.chdir(previousCwd);
  }

  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  if (scratchDirectory) {
    const allowedRoot = path.resolve(projectRoot, "work") + path.sep;
    assert.ok(path.resolve(scratchDirectory).startsWith(allowedRoot));
    await rm(scratchDirectory, { recursive: true, force: true });
  }
});

test("shared API serves its health endpoint", async () => {
  const response = await realFetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("trusted time is fresh and agrees with its timestamp", async () => {
  const startedAt = Date.now();
  const response = await realFetch(`${baseUrl}/api/time`);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(data.timezone, "Asia/Shanghai");
  assert.equal(Date.parse(data.now), data.timestampMs);
  assert.ok(data.timestampMs >= startedAt && data.timestampMs <= Date.now());
});

test("CORS permits the existing Android origin and authorization preflight", async () => {
  const response = await realFetch(`${baseUrl}/api/deepseek/chat`, {
    method: "OPTIONS",
    headers: {
      Origin: "capacitor://localhost",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Content-Type, Authorization",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "capacitor://localhost");
  assert.match(response.headers.get("access-control-allow-headers") || "", /Authorization/);
  assert.equal(response.headers.get("vary"), "Origin");
});

test("CORS does not allow an unrelated origin", async () => {
  const response = await realFetch(`${baseUrl}/api/health`, {
    headers: { Origin: "https://unrelated.example" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("daily deep bypass is rejected before any upstream request", async () => {
  globalThis.fetch = async () => {
    assert.fail("The entitlement guard must run before an upstream request.");
  };
  const response = await realFetch(`${baseUrl}/api/deepseek/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entitlement: { type: "tarot_message" },
      messages: [{ role: "user", content: "用户这次追问：今天这张牌详细讲" }],
    }),
  });
  assert.equal(response.status, 402);
  assert.match((await response.json()).error.message, /今日深解/);
});

test("chat preserves an upstream failure status and JSON error", async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async (input) => {
    assert.equal(input, "https://api.deepseek.com/chat/completions");
    upstreamCalls += 1;
    return new Response(JSON.stringify({ error: { message: "Mock rate limit" } }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  };
  const response = await realFetch(`${baseUrl}/api/deepseek/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "mock-model", messages: [{ role: "user", content: "Hello" }] }),
  });
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: { message: "Mock rate limit" } });
  assert.equal(upstreamCalls, 1);
});

test("shared API returns JSON for unknown routes and malformed bodies", async () => {
  const missing = await realFetch(`${baseUrl}/api/fixture-unknown`);
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("content-type") || "", /application\/json/);
  assert.match((await missing.json()).error.message, /接口不存在/);
  const malformed = await realFetch(`${baseUrl}/api/deepseek/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: '{"messages":',
  });
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error.message, /JSON/);
});

test("normal completed request bodies do not cancel a pending chat response", async () => {
  globalThis.fetch = async (_input, init) => {
    assert.equal(JSON.parse(String(init?.body)).stream, false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(init?.signal?.aborted, false);
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "Fixture complete" } }] }), { headers: { "Content-Type": "application/json" } });
  };
  const response = await realFetch(`${baseUrl}/api/deepseek/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stream: true, messages: [] }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, "Fixture complete");
});

test("a disconnected response cancels its pending upstream without waiting for the deadline", async () => {
  let enterUpstream: () => void;
  const entered = new Promise<void>((resolve) => { enterUpstream = resolve; });
  let reportAbort: () => void;
  const aborted = new Promise<void>((resolve) => { reportAbort = resolve; });
  globalThis.fetch = async (_input, init) => {
    init?.signal?.addEventListener("abort", () => reportAbort(), { once: true });
    enterUpstream();
    return new Promise<Response>(() => {});
  };
  const client = httpRequest(`${baseUrl}/api/deepseek/chat`, { method: "POST", headers: { "Content-Type": "application/json" } });
  client.on("error", () => {});
  client.end(JSON.stringify({ messages: [] }));
  await entered;
  client.destroy();
  let timeout: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([aborted, new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("disconnect did not cancel upstream")), 1000); })]);
  } finally { clearTimeout(timeout!); }
});

test("incomplete answers never deduct fixture entitlements, while a complete answer deducts once", async () => {
  const previousCwd = process.cwd();
  const fixtureId = "api-fixture-user";
  const entitlementPath = path.join(scratchDirectory, ".data", "entitlements", "users", `${fixtureId}.json`);
  const now = new Date().toISOString();
  await mkdir(path.join(scratchDirectory, ".data", "accounts", "users"), { recursive: true });
  await mkdir(path.dirname(entitlementPath), { recursive: true });
  await writeFile(path.join(scratchDirectory, ".data", "accounts", "users", `${fixtureId}.json`), JSON.stringify({ id: fixtureId, email: "fixture@example.invalid", displayName: "Fixture", createdAt: now, updatedAt: now }));
  await writeFile(entitlementPath, JSON.stringify({ userId: fixtureId, membership: { plan: "free" }, energy: 5, grantedOrderIds: [], redeemedCodeHashes: [], relationshipEntitlementsVersion: 1, createdAt: now, updatedAt: now }));
  const tokenBody = Buffer.from(JSON.stringify({ userId: fixtureId, email: "fixture@example.invalid", exp: Date.now() + 60_000 })).toString("base64url");
  const token = `${tokenBody}.${crypto.createHmac("sha256", "api-tests-session-placeholder").update(tokenBody).digest("base64url")}`;
  const callFixture = () => realFetch(`${baseUrl}/api/deepseek/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ entitlement: { type: "tarot_message", energyCost: 1 }, messages: [] }),
  });
  try {
    process.chdir(scratchDirectory);
    for (const incomplete of [
      '{"choices":[',
      JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "Fixture cut off" } }] }),
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "" } }] }),
    ]) {
      globalThis.fetch = async () => new Response(incomplete, { headers: { "Content-Type": "application/json" } });
      const response = await callFixture();
      assert.equal(response.status, 502);
      assert.ok((await response.json()).error.code);
      assert.equal(JSON.parse(await readFile(entitlementPath, "utf8")).energy, 5);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "Fixture complete" } }] }), { headers: { "Content-Type": "application/json" } });
    const success = await callFixture();
    assert.equal(success.status, 200);
    assert.equal((await success.json()).entitlement.energy, 4);
    assert.equal(JSON.parse(await readFile(entitlementPath, "utf8")).energy, 4);
  } finally { process.chdir(previousCwd); }
});

test("a stalled entitlement prepare returns a bounded storage error before generating AI", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://store-fixture.example.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "api-tests-store-placeholder";
  let calls = 0;
  globalThis.fetch = async (input) => {
    assert.equal(input, "https://store-fixture.example.invalid");
    calls += 1;
    return new Promise<Response>(() => {});
  };
  const body = Buffer.from(JSON.stringify({ userId: "slow-fixture", email: "fixture@example.invalid", exp: Date.now() + 60_000 })).toString("base64url");
  const token = `${body}.${crypto.createHmac("sha256", "api-tests-session-placeholder").update(body).digest("base64url")}`;
  try {
    const response = await realFetch(`${baseUrl}/api/deepseek/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entitlement: { type: "tarot_message" }, messages: [] }),
    });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, "STORE_REQUEST_TIMEOUT");
    assert.equal(calls, 1);
  } finally { process.env.UPSTASH_REDIS_REST_URL = ""; process.env.UPSTASH_REDIS_REST_TOKEN = ""; }
});

test("a stalled entitlement commit reports an uncertain debit instead of retrying it", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://store-fixture.example.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "api-tests-store-placeholder";
  const fixtureId = "commit-fixture";
  const now = new Date().toISOString();
  let fixtureRecord = { userId: fixtureId, membership: { plan: "free" }, energy: 5, grantedOrderIds: [], redeemedCodeHashes: [], relationshipEntitlementsVersion: 1, createdAt: now, updatedAt: now };
  let writes = 0;
  globalThis.fetch = async (input, init) => {
    if (input === "https://api.deepseek.com/chat/completions") return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "Fixture complete" } }] }), { headers: { "Content-Type": "application/json" } });
    assert.equal(input, "https://store-fixture.example.invalid");
    const [command, key, value] = JSON.parse(String(init?.body));
    if (command === "SET") {
      writes += 1;
      fixtureRecord = JSON.parse(value);
      return new Promise<Response>(() => {});
    }
    const result = String(key).startsWith("astro-rail-accounts:") ? { id: fixtureId, email: "fixture@example.invalid", displayName: "Fixture", createdAt: now, updatedAt: now } : fixtureRecord;
    return new Response(JSON.stringify({ result: JSON.stringify(result) }), { headers: { "Content-Type": "application/json" } });
  };
  const body = Buffer.from(JSON.stringify({ userId: fixtureId, email: "fixture@example.invalid", exp: Date.now() + 60_000 })).toString("base64url");
  const token = `${body}.${crypto.createHmac("sha256", "api-tests-session-placeholder").update(body).digest("base64url")}`;
  try {
    const response = await realFetch(`${baseUrl}/api/deepseek/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entitlement: { type: "tarot_message", energyCost: 1 }, messages: [] }),
    });
    assert.equal(response.status, 503);
    const data = await response.json();
    assert.equal(data.error.code, "STORE_WRITE_UNCONFIRMED");
    assert.match(data.error.message, /刷新.*核对/);
    assert.equal(fixtureRecord.energy, 4);
    assert.equal(writes, 1);
  } finally { process.env.UPSTASH_REDIS_REST_URL = ""; process.env.UPSTASH_REDIS_REST_TOKEN = ""; }
});
