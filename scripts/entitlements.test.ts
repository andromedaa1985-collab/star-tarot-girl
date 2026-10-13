import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { applyPlanEntitlement, registerEntitlementRoutes, restoreLegacyCoupleFeatureAccess } from '../api/entitlementRoutes';
import { registerAuthRoutes } from '../api/authRoutes';
import { writeStoreJson } from '../api/jsonStore';
import {
  activatePlusDays,
  addFeatureUnlock,
  defaultMembership,
  hasFeatureAccess,
  normalizeMembership,
  startPlusTrial,
  type MembershipState,
} from '../src/lib/membership';
import { PAYMENT_PLANS } from '../src/lib/pricing';
import { importAppBackup } from '../src/lib/appBackup';

const purchasedAt = new Date('2026-10-13T00:00:00.000Z');
const monthEnd = new Date('2026-11-13T00:00:00.000Z');

function record(membership: MembershipState = normalizeMembership(defaultMembership)) {
  return {
    userId: 'fixture-user',
    membership,
    energy: 5,
    grantedOrderIds: [],
    redeemedCodeHashes: [],
    createdAt: purchasedAt.toISOString(),
    updatedAt: purchasedAt.toISOString(),
  };
}

function grant(target: ReturnType<typeof record>, planId: string, now = purchasedAt) {
  const plan = PAYMENT_PLANS.find((candidate) => candidate.id === planId);
  assert.ok(plan, `Missing payment plan ${planId}`);
  applyPlanEntitlement(target, plan, now);
}

test('a new couple Plus purchase grants ordinary Plus and both relationship features for 31 days', () => {
  const target = record();
  grant(target, 'couple_plus_monthly');
  assert.equal(target.energy, 30);
  assert.equal(target.membership.expiresAt, monthEnd.toISOString());
  for (const feature of ['relationship_report', 'relationship_weekly'] as const) {
    assert.equal(target.membership.featureExpiresAt[feature], monthEnd.toISOString());
    assert.equal(hasFeatureAccess(target.membership, feature, purchasedAt), true);
    assert.equal(hasFeatureAccess(target.membership, feature, new Date(monthEnd.getTime() - 1)), true);
    assert.equal(hasFeatureAccess(target.membership, feature, monthEnd), false);
  }
  assert.equal(hasFeatureAccess(target.membership, 'simulator', purchasedAt), true);
  assert.equal(hasFeatureAccess(target.membership, 'guardian', purchasedAt), true);
  assert.equal(hasFeatureAccess(target.membership, 'bazi', purchasedAt), false);
  assert.deepEqual(target.membership.unlocks, []);
});

test('ordinary Plus and its 24-hour trial do not include relationship permissions', () => {
  const target = record();
  grant(target, 'plus_monthly');
  assert.equal(target.energy, 20);
  assert.equal(hasFeatureAccess(target.membership, 'simulator', purchasedAt), true);
  assert.equal(hasFeatureAccess(target.membership, 'relationship_report', purchasedAt), false);
  assert.equal(hasFeatureAccess(target.membership, 'relationship_weekly', purchasedAt), false);
  const trial = startPlusTrial(normalizeMembership(defaultMembership), purchasedAt);
  assert.equal(hasFeatureAccess(trial, 'guardian', purchasedAt), true);
  assert.equal(hasFeatureAccess(trial, 'relationship_report', purchasedAt), false);
  assert.equal(hasFeatureAccess(trial, 'relationship_weekly', purchasedAt), false);
});

test('an ordinary Plus renewal preserves the independent relationship expiry without extending it', () => {
  const target = record();
  grant(target, 'couple_plus_monthly');
  grant(target, 'plus_monthly', new Date('2026-10-20T00:00:00.000Z'));
  assert.equal(target.membership.expiresAt, '2026-12-14T00:00:00.000Z');
  assert.equal(target.membership.featureExpiresAt.relationship_report, monthEnd.toISOString());
  assert.equal(hasFeatureAccess(target.membership, 'simulator', monthEnd), true);
  assert.equal(hasFeatureAccess(target.membership, 'relationship_report', monthEnd), false);
  assert.equal(hasFeatureAccess(target.membership, 'relationship_weekly', monthEnd), false);
});

test('couple renewals extend each existing feature expiry and retain permanent unlocks', () => {
  const target = record(addFeatureUnlock(activatePlusDays(normalizeMembership(defaultMembership), 90, purchasedAt), 'bazi'));
  grant(target, 'couple_plus_monthly');
  grant(target, 'couple_plus_monthly', new Date('2026-10-20T00:00:00.000Z'));
  assert.equal(target.membership.expiresAt, '2027-03-14T00:00:00.000Z');
  assert.equal(target.membership.featureExpiresAt.relationship_report, '2026-12-14T00:00:00.000Z');
  assert.equal(target.membership.featureExpiresAt.relationship_weekly, '2026-12-14T00:00:00.000Z');
  assert.equal(hasFeatureAccess(target.membership, 'bazi', new Date('2030-01-01T00:00:00Z')), true);
  assert.equal(hasFeatureAccess(target.membership, 'relationship_report', new Date('2026-12-14T00:00:00Z')), false);
});

test('a bundle permanent unlock continues after a later couple membership expires', () => {
  const target = record();
  grant(target, 'bazi_full_archive');
  grant(target, 'couple_plus_monthly');
  for (const feature of ['bazi', 'relationship_report', 'relationship_weekly'] as const) {
    assert.equal(hasFeatureAccess(target.membership, feature, new Date('2030-01-01T00:00:00Z')), true);
  }
  assert.equal(hasFeatureAccess(target.membership, 'simulator', monthEnd), false);
});

test('membership snapshots round-trip timed permissions while discarding invalid dates and unknown features', () => {
  const target = record();
  grant(target, 'couple_plus_monthly');
  const restored = normalizeMembership(JSON.parse(JSON.stringify(target.membership)));
  assert.deepEqual(restored, target.membership);
  assert.equal(hasFeatureAccess(restored, 'relationship_report', purchasedAt), true);
  const malformed = normalizeMembership({
    ...restored,
    featureExpiresAt: { ...restored.featureExpiresAt, bazi: 'invalid', missing_feature: monthEnd.toISOString() },
  });
  assert.deepEqual(malformed.featureExpiresAt, target.membership.featureExpiresAt);
  assert.deepEqual(normalizeMembership({ plan: 'free', unlocks: ['bazi'] }).featureExpiresAt, {});
});

test('restoring a local archive preserves couple feature expiry when membership is normalized', () => {
  class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, String(value)); }
  }
  const original = new Map(['localStorage', 'sessionStorage'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  try {
    for (const name of original.keys()) Object.defineProperty(globalThis, name, { configurable: true, value: new MemoryStorage() });
    const target = record();
    grant(target, 'couple_plus_monthly');
    importAppBackup({
      format: 'astro-rail-local-archive', version: 1, appName: 'AstroRail', createdAt: purchasedAt.toISOString(),
      data: { membership: JSON.parse(JSON.stringify(target.membership)) },
    });
    const restored = normalizeMembership(JSON.parse(localStorage.getItem('membership') || '{}'));
    assert.deepEqual(restored.featureExpiresAt, target.membership.featureExpiresAt);
    assert.equal(hasFeatureAccess(restored, 'relationship_weekly', purchasedAt), true);
    assert.equal(hasFeatureAccess(restored, 'relationship_weekly', monthEnd), false);
  } finally {
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('legacy couple orders recover their original expiry without reactivating an expired purchase', () => {
  const membership = addFeatureUnlock(activatePlusDays(normalizeMembership(defaultMembership), 31, purchasedAt), 'bazi');
  const recovered = restoreLegacyCoupleFeatureAccess(membership, ['2026-09-01T00:00:00.000Z']);
  assert.equal(recovered.featureExpiresAt.relationship_report, '2026-10-02T00:00:00.000Z');
  assert.equal(hasFeatureAccess(recovered, 'relationship_report', purchasedAt), false);
  assert.equal(hasFeatureAccess(recovered, 'relationship_weekly', purchasedAt), false);
  assert.equal(hasFeatureAccess(recovered, 'bazi', purchasedAt), true);
  assert.equal(recovered.expiresAt, membership.expiresAt);
});

test('legacy couple renewals replay by paid date and remain idempotent alongside newer grants', () => {
  const target = record();
  grant(target, 'couple_plus_monthly');
  const dates = ['2026-10-20T00:00:00.000Z', purchasedAt.toISOString()];
  const recovered = restoreLegacyCoupleFeatureAccess(target.membership, dates);
  assert.equal(recovered.featureExpiresAt.relationship_report, '2026-12-14T00:00:00.000Z');
  assert.deepEqual(restoreLegacyCoupleFeatureAccess(recovered, dates), recovered);
  const later = { ...recovered, featureExpiresAt: { ...recovered.featureExpiresAt, relationship_report: '2027-01-01T00:00:00.000Z' } };
  assert.equal(restoreLegacyCoupleFeatureAccess(later, dates).featureExpiresAt.relationship_report, '2027-01-01T00:00:00.000Z');
});

test('the authenticated apply-order route grants couple rights once and repairs verified legacy orders without recharging', async () => {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const scratchRoot = path.resolve(projectRoot, 'work');
  await mkdir(scratchRoot, { recursive: true });
  const scratchDirectory = await mkdtemp(path.join(scratchRoot, 'entitlement-tests-'));
  const previousCwd = process.cwd();
  const isolatedEnv = ['NETLIFY', 'NETLIFY_BLOBS_CONTEXT', 'VERCEL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'AUTH_SESSION_SECRET'];
  const previousEnv = new Map(isolatedEnv.map((name) => [name, process.env[name]]));
  let server: Server | undefined;
  try {
    for (const name of isolatedEnv) delete process.env[name];
    process.env.AUTH_SESSION_SECRET = 'isolated-entitlement-tests-placeholder';
    process.chdir(scratchDirectory);
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app);
    registerEntitlementRoutes(app);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const address = server!.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'entitlement-fixture@example.invalid', password: 'fictional-test-password' }),
    });
    assert.equal(registration.status, 200);
    const session = await registration.json();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` };
    const paidAt = new Date().toISOString();
    await writeStoreJson('astro-payment-orders', 'fixture-new-couple-order', {
      id: 'fixture-new-couple-order', provider: 'fixture', planId: 'couple_plus_monthly', amount: '16.90',
      status: 'paid', userId: session.user.id, createdAt: paidAt, paidAt,
    }, '.data/payment-orders');
    async function applyOrder() {
      const response = await fetch(`${baseUrl}/api/entitlements/apply-order`, {
        method: 'POST', headers, body: JSON.stringify({ orderId: 'fixture-new-couple-order' }),
      });
      assert.equal(response.status, 200);
      return response.json();
    }
    const first = await applyOrder();
    assert.equal(first.energy, 30);
    assert.equal(hasFeatureAccess(first.membership, 'relationship_report'), true);
    assert.equal(hasFeatureAccess(first.membership, 'relationship_weekly'), true);
    const second = await applyOrder();
    assert.deepEqual(second.membership, first.membership);
    assert.equal(second.energy, first.energy);

    const oldPaidAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    await writeStoreJson('astro-payment-orders', 'fixture-legacy-couple-order', {
      id: 'fixture-legacy-couple-order', provider: 'fixture', planId: 'couple_plus_monthly', amount: '16.90',
      status: 'paid', userId: session.user.id, createdAt: oldPaidAt, paidAt: oldPaidAt,
    }, '.data/payment-orders');
    const legacy = record(activatePlusDays(normalizeMembership(defaultMembership)));
    await writeStoreJson('astro-entitlements', `users/${session.user.id}`, {
      ...legacy, userId: session.user.id, energy: 7, grantedOrderIds: ['fixture-legacy-couple-order'],
    }, '.data/entitlements');
    const response = await fetch(`${baseUrl}/api/entitlements/me`, { headers });
    assert.equal(response.status, 200);
    const repaired = await response.json();
    assert.equal(repaired.energy, 7);
    assert.equal(repaired.membership.expiresAt, legacy.membership.expiresAt);
    assert.equal(repaired.membership.featureExpiresAt.relationship_report, new Date(Date.parse(oldPaidAt) + 31 * 24 * 60 * 60 * 1000).toISOString());
    assert.equal(hasFeatureAccess(repaired.membership, 'relationship_report'), false);
    const repeated = await fetch(`${baseUrl}/api/entitlements/me`, { headers });
    assert.deepEqual((await repeated.json()).membership, repaired.membership);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    process.chdir(previousCwd);
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    assert.ok(path.resolve(scratchDirectory).startsWith(scratchRoot + path.sep));
    await rm(scratchDirectory, { recursive: true, force: true });
  }
});

test('a slow legacy entitlement GET cannot overwrite an order granted while its historical lookup is pending', { timeout: 5000 }, async () => {
  const realFetch = globalThis.fetch;
  const isolatedEnv = ['NETLIFY', 'NETLIFY_BLOBS_CONTEXT', 'VERCEL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'AUTH_SESSION_SECRET'];
  const previousEnv = new Map(isolatedEnv.map((name) => [name, process.env[name]]));
  let server: Server | undefined;
  let releaseOldRead = () => {};
  try {
    for (const name of isolatedEnv) delete process.env[name];
    const secret = 'isolated-concurrent-entitlement-test-placeholder';
    const redisUrl = 'https://fixture-redis.invalid';
    process.env.AUTH_SESSION_SECRET = secret;
    process.env.UPSTASH_REDIS_REST_URL = redisUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fixture-placeholder';
    const userId = 'concurrent-entitlement-fixture';
    const user = { id: userId, email: 'concurrent-fixture@example.invalid' };
    const tokenBody = Buffer.from(JSON.stringify({ userId, email: user.email, exp: Date.now() + 60_000 })).toString('base64url');
    const token = `${tokenBody}.${createHmac('sha256', secret).update(tokenBody).digest('base64url')}`;
    const now = new Date();
    const oldPaidAt = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const legacy = {
      ...record(activatePlusDays(normalizeMembership(defaultMembership), 31, now)),
      userId, energy: 7, grantedOrderIds: ['fixture-slow-old-order'],
    };
    const entitlementKey = `astro-entitlements:users/${userId}`;
    const oldOrderKey = 'astro-payment-orders:fixture-slow-old-order';
    const values = new Map([
      [`astro-rail-accounts:users/${userId}`, JSON.stringify(user)],
      [entitlementKey, JSON.stringify(legacy)],
      [oldOrderKey, JSON.stringify({ id: 'fixture-slow-old-order', planId: 'couple_plus_monthly', status: 'paid', userId, paidAt: oldPaidAt })],
      ['astro-payment-orders:fixture-concurrent-new-order', JSON.stringify({ id: 'fixture-concurrent-new-order', planId: 'couple_plus_monthly', status: 'paid', userId, paidAt: now.toISOString() })],
    ]);
    let markOldReadStarted = () => {};
    const oldReadStarted = new Promise<void>((resolve) => { markOldReadStarted = resolve; });
    const oldReadReleased = new Promise<void>((resolve) => { releaseOldRead = resolve; });
    let delayedOldRead = false;
    let storageWrites = 0;
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), redisUrl, 'All fixture storage requests must use the local stub.');
      const [command, key, value] = JSON.parse(String(init?.body));
      if (command === 'GET') {
        if (key === oldOrderKey && !delayedOldRead) {
          delayedOldRead = true;
          markOldReadStarted();
          await oldReadReleased;
        }
        return new Response(JSON.stringify({ result: values.get(key) ?? null }), { status: 200 });
      }
      assert.equal(command, 'SET');
      storageWrites += 1;
      values.set(key, value);
      return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
    };
    const app = express();
    app.use(express.json());
    registerEntitlementRoutes(app);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const address = server!.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const pendingGet = realFetch(`${baseUrl}/api/entitlements/me`, { headers });
    await oldReadStarted;
    const paidResponse = await realFetch(`${baseUrl}/api/entitlements/apply-order`, {
      method: 'POST', headers, body: JSON.stringify({ orderId: 'fixture-concurrent-new-order' }),
    });
    assert.equal(paidResponse.status, 200);
    const paidSnapshot = await paidResponse.json();
    assert.equal(paidSnapshot.energy, 30);
    assert.equal(hasFeatureAccess(paidSnapshot.membership, 'relationship_report'), true);
    const paidRecord = values.get(entitlementKey);
    assert.ok(JSON.parse(paidRecord!).grantedOrderIds.includes('fixture-concurrent-new-order'));
    releaseOldRead();
    const staleRead = await pendingGet;
    assert.equal(staleRead.status, 200);
    assert.equal((await staleRead.json()).energy, 7);
    assert.equal(values.get(entitlementKey), paidRecord);
    assert.equal(storageWrites, 1, 'Only apply-order may persist an entitlement change.');
    const currentResponse = await realFetch(`${baseUrl}/api/entitlements/me`, { headers });
    const current = await currentResponse.json();
    assert.deepEqual(current.membership, paidSnapshot.membership);
    assert.equal(current.energy, 30);
    assert.equal(storageWrites, 1);
  } finally {
    releaseOldRead();
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    globalThis.fetch = realFetch;
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
