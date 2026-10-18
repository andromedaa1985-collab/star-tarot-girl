import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { connectLambda } from "@netlify/blobs";
import { readStoreJson } from "../api/jsonStore.js";

const realFetch = globalThis.fetch;
const root = process.cwd();
const names = ["NETLIFY", "NETLIFY_BLOBS_CONTEXT", "VERCEL", "DEEPSEEK_API_KEY", "AUTH_SESSION_SECRET", "NETLIFY_BLOBS_SITE_ID", "NETLIFY_BLOBS_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"];
const previous = new Map(names.map(name => [name, process.env[name]]));
const nativeContext = { siteID: "fixture-site", deployID: "fixture-deploy", token: "fixture-token", edgeURL: "https://cached-blobs-fixture.invalid", uncachedEdgeURL: "https://origin-blobs-fixture.invalid" };
let handler: typeof import("../netlify/functions/api.js").default;
let scratch: string;

function reset() {
  for (const name of names) delete process.env[name];
  process.env.NETLIFY = "true";
  process.env.DEEPSEEK_API_KEY = "netlify-fixture-ai-key";
  process.env.AUTH_SESSION_SECRET = "netlify-fixture-session-secret";
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(nativeContext)).toString("base64");
  globalThis.fetch = async () => { assert.fail("Netlify adapter tests must not reach real services."); };
}

before(async () => {
  reset();
  await mkdir(path.join(root, "work"), { recursive: true });
  scratch = await mkdtemp(path.join(root, "work/netlify-function-"));
  // Do not let dotenv load any real deployment credentials during this fixture.
  process.chdir(scratch);
  try { ({ default: handler } = await import("../netlify/functions/api.js")); }
  finally { process.chdir(root); }
});
afterEach(reset);
after(async () => {
  globalThis.fetch = realFetch;
  for (const [name, value] of previous) value === undefined ? delete process.env[name] : process.env[name] = value;
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

async function call(url: string, body?: unknown, method = body ? "POST" : "GET") {
  return handler(new Request(`https://zjhrail.xyz${url}`, {
    method, headers: { "Content-Type": "application/json", Origin: "https://zjhrail.xyz" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), { requestId: "fixture-request" } as Parameters<typeof handler>[1]);
}

function mockStore(withAI = false) {
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (withAI && url.hostname === "api.deepseek.com") {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer netlify-fixture-ai-key");
      return Response.json({ choices: [{ message: { role: "assistant", content: "fixture reply" }, finish_reason: "stop" }] });
    }
    assert.equal(url.origin, nativeContext.uncachedEdgeURL);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-token");
    paths.push(url.pathname);
    if (init?.method?.toUpperCase() === "PUT") {
      assert.equal(new Headers(init.headers).get("if-none-match"), "*");
      return new Response(null, { status: 200, headers: { etag: '"fixture-v1"' } });
    }
    return new Response(null, { status: 404 });
  };
  return paths;
}

test("legacy connectLambda reproduces the missing strong-read context before any network request", async () => {
  connectLambda({
    blobs: Buffer.from(JSON.stringify({ token: nativeContext.token, url: nativeContext.edgeURL })).toString("base64"),
    headers: { "x-nf-site-id": nativeContext.siteID, "x-nf-deploy-id": nativeContext.deployID },
  });
  await assert.rejects(readStoreJson("astro-rail-accounts", "fixture", "unused"), (error: any) => {
    assert.equal(error.code, "STORE_UPSTREAM_UNAVAILABLE");
    return true;
  });
});

test("modern entry point preserves routes, CORS and JSON errors on both public and function paths", async () => {
  for (const base of ["/api", "/.netlify/functions/api"]) {
    const health = await call(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.equal(health.headers.get("access-control-allow-origin"), "https://zjhrail.xyz");
    const missing = await call(`${base}/missing`);
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get("content-type") || "", /application\/json/);
  }
  const preflight = await call("/api/auth/login", undefined, "OPTIONS");
  assert.equal(preflight.status, 204);
});

test("login traverses native uncached account storage without replacing its runtime credentials", async () => {
  const paths = mockStore();
  const response = await call("/.netlify/functions/api/auth/login", { email: "fixture@example.invalid", password: "fixture-password" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /邮箱或密码不正确/);
  assert.ok(paths.some(p => p.includes("site:astro-request-limits/")));
  assert.ok(paths.some(p => p.includes("site:astro-rail-accounts/email-index/")));
  assert.deepEqual(JSON.parse(Buffer.from(process.env.NETLIFY_BLOBS_CONTEXT!, "base64").toString()), nativeContext);
});

test("AI request completes its durable guest budgets and reaches its upstream through the modern adapter", async () => {
  const paths = mockStore(true);
  const response = await call("/api/deepseek/chat", { model: "deepseek-chat", messages: [{ role: "user", content: "fixture question" }], max_tokens: 8 });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, "fixture reply");
  assert.ok(paths.some(p => p.includes("site:astro-ai-budgets/")));
  assert.ok(paths.some(p => p.includes("site:astro-request-limits/")));
});
