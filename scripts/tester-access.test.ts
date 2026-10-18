import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { registerAuthRoutes } from '../api/authRoutes';
import { prepareChatEntitlementCharge, registerEntitlementRoutes } from '../api/entitlementRoutes';
import { readStoreJson, writeStoreJson } from '../api/jsonStore';
import {
  activatePlusDays, activateTesterAccess, addDailyFortuneDeepCredits, addFeatureUnlock,
  canStartPlusTrial, defaultMembership, getMembershipLabel, getPlusDaysLeft,
  hasFeatureAccess, isPlusActive, isTesterActive, normalizeMembership, TESTER_ACCESS_DAYS,
} from '../src/lib/membership';

const start = new Date('2026-10-18T04:00:00.000Z');
const end = new Date('2026-10-21T04:00:00.000Z');
const features = ['bazi', 'guardian', 'simulator', 'tarot_deep_report', 'relationship_report', 'relationship_weekly'] as const;
const DAY_MS = 86_400_000;

test('test access is exactly 72 hours, includes every feature, and leaves no permanent grants or credits', () => {
  assert.equal(TESTER_ACCESS_DAYS, 3);
  const original = normalizeMembership(defaultMembership);
  const trial = activateTesterAccess(original, start);
  assert.equal(trial.testerExpiresAt, end.toISOString());
  assert.equal(trial.expiresAt, null);
  assert.equal(trial.plan, 'free');
  assert.deepEqual(trial.unlocks, []);
  assert.deepEqual(trial.featureExpiresAt, {});
  assert.equal(trial.dailyFortuneDeepCredits, 0);
  assert.equal(original.testerExpiresAt, null);
  for (const feature of features) {
    assert.equal(hasFeatureAccess(trial, feature, new Date(end.getTime() - 1)), true);
    assert.equal(hasFeatureAccess(trial, feature, end), false);
  }
  assert.equal(isTesterActive(trial, end), false);
  assert.equal(isPlusActive(trial, end), false);
  assert.equal(getPlusDaysLeft(trial, start), 3);
  assert.equal(getPlusDaysLeft(trial, end), 0);
  assert.equal(canStartPlusTrial(trial, end), false);
  assert.equal(getMembershipLabel(trial, end), '测试体验已结束 · 免费版');
});

test('redemption and later purchases keep paid expiry, permanent rights and ordinary credits independent', () => {
  const paid = addDailyFortuneDeepCredits(addFeatureUnlock(activatePlusDays(normalizeMembership(defaultMembership), 90, start), 'bazi'), 2);
  const trial = activateTesterAccess(paid, start);
  assert.equal(trial.expiresAt, paid.expiresAt);
  assert.equal(trial.source, 'payment');
  assert.deepEqual(trial.unlocks, paid.unlocks);
  assert.equal(trial.dailyFortuneDeepCredits, 2);
  assert.equal(hasFeatureAccess(trial, 'guardian', end), true);
  assert.equal(hasFeatureAccess(trial, 'bazi', end), true);
  assert.equal(hasFeatureAccess(trial, 'relationship_report', end), false);
  const renewed = activatePlusDays(trial, 31, new Date(start.getTime() + DAY_MS));
  assert.equal(renewed.expiresAt, new Date(start.getTime() + 121 * DAY_MS).toISOString());
  assert.equal(renewed.testerExpiresAt, trial.testerExpiresAt);
});

test('serialized access preserves its deadline and invalid dates cannot activate a free account', () => {
  const trial = activateTesterAccess(normalizeMembership(defaultMembership), start);
  assert.deepEqual(normalizeMembership(JSON.parse(JSON.stringify(trial))), trial);
  for (const expiry of [null, 'invalid', '', undefined]) {
    const restored = normalizeMembership({ plan: 'free', testerExpiresAt: expiry });
    assert.equal(isTesterActive(restored, start), false);
  }
  const oldTimedTester = normalizeMembership({ plan: 'tester', expiresAt: end.toISOString() });
  assert.equal(isTesterActive(oldTimedTester, start), true);
  assert.equal(isTesterActive(oldTimedTester, end), false);
});

const root = process.cwd();
const envNames = ['NETLIFY', 'NETLIFY_BLOBS_CONTEXT', 'NETLIFY_BLOBS_SITE_ID', 'NETLIFY_BLOBS_TOKEN', 'VERCEL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'AUTH_SESSION_SECRET', 'ASTRORAIL_TESTER_REDEEM_CODES', 'ASTRORAIL_TESTER_REDEEM_CODE_HASHES', 'TESTER_REDEEM_CODES', 'TESTER_REDEEM_CODE_HASHES'];
const oldEnv = new Map(envNames.map(name => [name, process.env[name]]));
let server: Server, scratch: string, base: string;
before(async () => {
  await mkdir(path.join(root, 'work'), { recursive: true });
  scratch = await mkdtemp(path.join(root, 'work/tester-access-'));
  process.chdir(scratch);
  for (const name of envNames) delete process.env[name];
  process.env.AUTH_SESSION_SECRET = 'fixture-tester-session-secret';
  process.env.ASTRORAIL_TESTER_REDEEM_CODES = 'FIXTURE-ALTERNATE';
  const app = express(); app.use(express.json()); registerAuthRoutes(app); registerEntitlementRoutes(app);
  app.post('/fixture/charge', async (req, res) => {
    try {
      const charge = await prepareChatEntitlementCharge(req);
      await charge?.release();
      res.json({ ok: true });
    } catch (error: any) { res.status(error.status || 500).json({ error: error.message }); }
  });
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); assert.ok(address && typeof address === 'object'); base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  process.chdir(root);
  for (const [name, value] of oldEnv) value === undefined ? delete process.env[name] : process.env[name] = value;
  if (scratch) await rm(scratch, { recursive: true, force: true });
});
async function account(suffix: string) {
  const r = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `tester-${suffix}@example.invalid`, password: 'fixture-only-password' }) });
  assert.equal(r.status, 200); return r.json();
}
const headers = (s: any) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` });
const redeem = (s: any, code: unknown = 'TAROT3DAY', extra = {}) => fetch(`${base}/api/entitlements/redeem`, { method: 'POST', headers: s ? headers(s) : { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, ...extra }) });
const stored = (s: any) => readStoreJson<any>('astro-entitlements', `users/${s.user.id}`, '.data/entitlements');
const save = (s: any, value: any) => writeStoreJson('astro-entitlements', `users/${s.user.id}`, value, '.data/entitlements');

test('live redemption requires login, validates codes and grants a server-timed window without inflating balance', async () => {
  assert.equal((await redeem(null)).status, 401);
  const s = await account('basic');
  for (const code of ['', 'NOT-A-VALID-CODE', 'X'.repeat(65), { code: 'TAROT3DAY' }]) assert.equal((await redeem(s, code)).status, 400);
  assert.equal(await stored(s), null);
  const before = Date.now();
  const response = await redeem(s, '  tarot3day  ', { days: 365, energy: 999999, membership: { plan: 'tester' } });
  const snapshot = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const expiry = Date.parse(snapshot.membership.testerExpiresAt);
  assert.ok(expiry >= before + 3 * DAY_MS && expiry <= Date.now() + 3 * DAY_MS);
  assert.equal(snapshot.energy, 5); assert.deepEqual(snapshot.membership.unlocks, []); assert.equal(snapshot.membership.dailyFortuneDeepCredits, 0);
  const record = await stored(s); assert.equal(record.redeemedCodeHashes.length, 1); assert.ok(record.testerRedeemedAt);
  const restored = await fetch(`${base}/api/entitlements/me`, { headers: headers(s) });
  assert.equal((await restored.json()).membership.testerExpiresAt, snapshot.membership.testerExpiresAt);
  assert.equal((await fetch(`${base}/fixture/charge`, { method: 'POST', headers: headers(s), body: JSON.stringify({ entitlement: { type: 'guardian' } }) })).status, 200);
  const current = await stored(s); current.membership.testerExpiresAt = new Date(Date.now() - 1).toISOString(); await save(s, current);
  assert.equal((await fetch(`${base}/fixture/charge`, { method: 'POST', headers: headers(s), body: JSON.stringify({ entitlement: { type: 'guardian' } }) })).status, 402);
  assert.equal((await redeem(s)).status, 409);
  assert.equal((await redeem(s, 'FIXTURE-ALTERNATE')).status, 409);
  assert.equal((await stored(s)).membership.testerExpiresAt, current.membership.testerExpiresAt);
});

test('concurrent and cross-code redemptions grant each account once through durable CAS', async () => {
  const s = await account('concurrent');
  const replies = await Promise.all(Array.from({ length: 4 }, () => redeem(s)));
  assert.deepEqual(replies.map(r => r.status).sort(), [200, 409, 409, 409]);
  const record = await stored(s);
  assert.equal(record.redeemedCodeHashes.length, 1);
  assert.equal(Date.parse(record.membership.testerExpiresAt) - Date.parse(record.testerRedeemedAt), 3 * DAY_MS);
  assert.equal((await redeem(s, 'FIXTURE-ALTERNATE')).status, 409);
  assert.deepEqual(await stored(s), record);
});

test('redeeming on a paid account retains its purchases, energy and order history after the test window', async () => {
  const s = await account('paid');
  const membership = addDailyFortuneDeepCredits(addFeatureUnlock(activatePlusDays(normalizeMembership(defaultMembership), 90), 'bazi'), 2);
  const now = new Date().toISOString();
  await save(s, { userId: s.user.id, membership, energy: 37, grantedOrderIds: ['fixture-paid-order'], redeemedCodeHashes: [], relationshipEntitlementsVersion: 1, createdAt: now, updatedAt: now });
  const r = await redeem(s); assert.equal(r.status, 200);
  const snapshot = await r.json();
  assert.equal(snapshot.energy, 37); assert.equal(snapshot.membership.expiresAt, membership.expiresAt); assert.deepEqual(snapshot.membership.unlocks, membership.unlocks); assert.equal(snapshot.membership.dailyFortuneDeepCredits, 2);
  assert.deepEqual((await stored(s)).grantedOrderIds, ['fixture-paid-order']);
  const expiry = new Date(snapshot.membership.testerExpiresAt);
  assert.equal(hasFeatureAccess(snapshot.membership, 'guardian', expiry), true);
  assert.equal(hasFeatureAccess(snapshot.membership, 'bazi', expiry), true);
  assert.equal(hasFeatureAccess(snapshot.membership, 'relationship_report', expiry), false);
});
