import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import type { Server } from "node:http";
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
