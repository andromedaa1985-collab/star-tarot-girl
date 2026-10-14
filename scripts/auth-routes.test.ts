import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request } from "express";
import { getOptionalUser, registerAuthRoutes } from "../api/authRoutes.js";
import { registerEntitlementRoutes } from "../api/entitlementRoutes.js";
import { runWithRequestDeadline } from "../api/_requestDeadline.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const realFetch = globalThis.fetch;
const fixtureSecret = "auth-tests-session-placeholder";
const fixtureUser = { id: "auth-fixture", email: "fixture@example.invalid", displayName: "Fixture", createdAt: "2026-10-14T00:00:00Z" };
const legacyPassword = " a1b2 ";
const legacySalt = "legacy-fixture-salt";
const legacyUser = {
  id: "legacy-short-password-fixture", email: "legacy@example.invalid", displayName: "Legacy Fixture",
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", salt: legacySalt,
  passwordHash: crypto.scryptSync(legacyPassword, legacySalt, 64).toString("hex"),
};
const legacyArchive = {
  userId: legacyUser.id, updatedAt: "2026-10-02T00:00:00Z", recordCount: 2,
  archive: { format: "astro-rail-local-archive", version: 1, data: { diaryEntries: [{ id: "legacy-diary-fixture", content: "Fictional legacy record" }] } },
};
const isolatedEnv = ["NODE_ENV", "NETLIFY", "NETLIFY_BLOBS_CONTEXT", "NETLIFY_BLOBS_SITE_ID", "NETLIFY_BLOBS_TOKEN", "VERCEL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "AUTH_SESSION_SECRET", "SESSION_SECRET", "DEEPSEEK_API_KEY"];
const previousEnv = new Map(isolatedEnv.map((name) => [name, process.env[name]]));
const previousCwd = process.cwd();
let scratchDirectory: string;
let server: Server;
let baseUrl: string;
let expiredStorageDeadline = false;

function resetFixtures() {
  for (const name of isolatedEnv) delete process.env[name];
  process.env.NODE_ENV = "test";
  process.env.AUTH_SESSION_SECRET = fixtureSecret;
  expiredStorageDeadline = false;
  globalThis.fetch = async () => { assert.fail("Auth fixtures must never call a real external service."); };
}

function signFixture(payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", fixtureSecret).update(body).digest("base64url")}`;
}

function fixtureToken(extra: Record<string, unknown> = {}) {
  return signFixture({ userId: fixtureUser.id, email: fixtureUser.email, exp: Date.now() + 60_000, ...extra });
}

const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
const requestWithToken = (token = "") => ({ get: () => token ? `Bearer ${token}` : "" }) as unknown as Request;
const safeServiceError = { error: { message: "账户服务暂时不可用，请稍后再试。", code: "ACCOUNT_SERVICE_UNAVAILABLE" } };

before(async () => {
  resetFixtures();
  const scratchRoot = path.resolve(projectRoot, "work");
  await mkdir(scratchRoot, { recursive: true });
  scratchDirectory = await mkdtemp(path.join(scratchRoot, "auth-tests-"));
  process.chdir(scratchDirectory);
  await mkdir(path.join(scratchDirectory, ".data/accounts/users"), { recursive: true });
  await writeFile(path.join(scratchDirectory, ".data/accounts/users/auth-fixture.json"), JSON.stringify(fixtureUser));
  await mkdir(path.join(scratchDirectory, ".data/accounts/email-index"), { recursive: true });
  await mkdir(path.join(scratchDirectory, ".data/accounts/archives"), { recursive: true });
  await writeFile(path.join(scratchDirectory, `.data/accounts/users/${legacyUser.id}.json`), JSON.stringify(legacyUser));
  await writeFile(path.join(scratchDirectory, `.data/accounts/email-index/${crypto.createHash("sha256").update(legacyUser.email).digest("hex")}.json`), JSON.stringify({ userId: legacyUser.id }));
  await writeFile(path.join(scratchDirectory, `.data/accounts/archives/${legacyUser.id}.json`), JSON.stringify(legacyArchive));
  const app = express();
  app.use(express.json());
  app.use((_req, _res, next) => expiredStorageDeadline
    ? runWithRequestDeadline({ expiresAt: Date.now() - 1 }, next)
    : next());
  registerAuthRoutes(app);
  registerEntitlementRoutes(app);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test("a six-character legacy password logs into the original account without changing its hash or archive", async () => {
  assert.equal(legacyPassword.length, 6);
  const paths = [
    `.data/accounts/users/${legacyUser.id}.json`,
    `.data/accounts/email-index/${crypto.createHash("sha256").update(legacyUser.email).digest("hex")}.json`,
    `.data/accounts/archives/${legacyUser.id}.json`,
  ].map((relative) => path.join(scratchDirectory, relative));
  const before = await Promise.all(paths.map((file) => readFile(file, "utf8")));
  const response = await realFetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: legacyUser.email, password: legacyPassword }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.user.id, legacyUser.id);
  assert.equal(data.user.archiveUpdatedAt, legacyArchive.updatedAt);
  assert.equal(data.user.archiveRecordCount, legacyArchive.recordCount);
  assert.equal(typeof data.token, "string");
  assert.equal("passwordHash" in data.user, false);

  for (const password of ["wrong!", legacyPassword.trim()]) {
    const wrong = await realFetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: legacyUser.email, password }),
    });
    assert.equal(wrong.status, 400);
    assert.match((await wrong.json()).error.message, /邮箱或密码不正确/);
  }
  assert.deepEqual(await Promise.all(paths.map((file) => readFile(file, "utf8"))), before);
});

test("registration keeps its eight-character minimum and both routes reject invalid password input", async () => {
  const shortRegistration = await realFetch(`${baseUrl}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "new-short-fixture@example.invalid", password: "short6" }),
  });
  assert.equal(shortRegistration.status, 400);
  assert.match((await shortRegistration.json()).error.message, /至少需要 8 位/);
  for (const route of ["login", "register"]) {
    for (const password of ["", null, 123456, "a".repeat(73)]) {
      const response = await realFetch(`${baseUrl}/api/auth/${route}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: legacyUser.email, password }),
      });
      assert.equal(response.status, 400);
      assert.equal(typeof (await response.json()).error.message, "string");
    }
  }
});

afterEach(resetFixtures);

after(async () => {
  globalThis.fetch = realFetch;
  for (const [name, value] of previousEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  process.chdir(previousCwd);
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (scratchDirectory) {
    const allowedRoot = path.resolve(projectRoot, "work") + path.sep;
    assert.ok(path.resolve(scratchDirectory).startsWith(allowedRoot));
    await rm(scratchDirectory, { recursive: true, force: true });
  }
});

test("only missing, malformed, expired, and missing-account sessions return the account-invalid code", async () => {
  for (const token of [
    "",
    "fixture-invalid-token",
    `${fixtureToken()}.extra`,
    fixtureToken({ exp: Date.now() - 1 }),
    fixtureToken({ exp: "future" }),
    fixtureToken({ userId: "missing-fixture" }),
    signFixture(null),
  ]) {
    const response = await realFetch(`${baseUrl}/api/auth/me`, { headers: headers(token) });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "ACCOUNT_SESSION_INVALID");
  }
  const active = await realFetch(`${baseUrl}/api/auth/me`, { headers: headers(fixtureToken()) });
  assert.equal(active.status, 200);
  assert.equal((await active.json()).user.id, fixtureUser.id);
});

test("the invalid-account code propagates through entitlement and archive routes", async () => {
  for (const [route, method] of [["/api/entitlements/me", "GET"], ["/api/auth/archive", "GET"], ["/api/auth/archive", "POST"]]) {
    const response = await realFetch(`${baseUrl}${route}`, { method, headers: headers(fixtureToken({ exp: Date.now() - 1 })) });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "ACCOUNT_SESSION_INVALID");
  }
});

test("missing production signing configuration is a safe service failure rather than an invalid session", async () => {
  process.env.NODE_ENV = "production";
  delete process.env.AUTH_SESSION_SECRET;
  const response = await realFetch(`${baseUrl}/api/auth/me`, { headers: headers(fixtureToken()) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), safeServiceError);
});

test("missing persistent storage configuration cannot masquerade as an expired account", async () => {
  process.env.VERCEL = "1";
  for (const route of ["/api/auth/me", "/api/entitlements/me", "/api/auth/archive"]) {
    const response = await realFetch(`${baseUrl}${route}`, { headers: headers(fixtureToken()) });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), safeServiceError);
  }
});

test("account and archive storage failures retain the account and hide provider details", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://auth-fixture.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-storage-placeholder";
  for (const failArchiveOnly of [false, true]) {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "https://auth-fixture.invalid");
      const [command, key] = JSON.parse(String(init?.body));
      assert.equal(command, "GET");
      if (failArchiveOnly && String(key).includes(":users/")) return new Response(JSON.stringify({ result: JSON.stringify(fixtureUser) }));
      throw new Error("Fixture private provider details and credentials");
    };
    const response = await realFetch(`${baseUrl}/api/auth/me`, { headers: headers(fixtureToken()) });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), safeServiceError);
  }
});

test("account storage deadlines are service failures and do not contact the provider after expiry", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://auth-fixture.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-storage-placeholder";
  expiredStorageDeadline = true;
  const response = await realFetch(`${baseUrl}/api/auth/me`, { headers: headers(fixtureToken()) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), safeServiceError);
});

test("optional identity accepts guests but propagates an authenticated storage outage", async () => {
  assert.equal(await getOptionalUser(requestWithToken()), null);
  assert.equal(await getOptionalUser(requestWithToken("fixture-invalid-token")), null);
  process.env.UPSTASH_REDIS_REST_URL = "https://auth-fixture.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-storage-placeholder";
  globalThis.fetch = async () => { throw new Error("Fixture private storage failure"); };
  await assert.rejects(getOptionalUser(requestWithToken(fixtureToken())), (error: any) => {
    assert.equal(error.status, 503);
    assert.equal(error.code, "ACCOUNT_SERVICE_UNAVAILABLE");
    assert.equal(error.message, safeServiceError.error.message);
    return true;
  });
});
