import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { app as App } from '../api/index';
import { prepareChatEntitlementCharge } from '../api/entitlementRoutes';
import { readStoreJson, writeStoreJson } from '../api/jsonStore';
const nativeFetch = globalThis.fetch;
const previousCwd = process.cwd();
const cloudKeys = ['VERCEL', 'NETLIFY', 'NETLIFY_BLOBS_CONTEXT', 'NETLIFY_BLOBS_SITE_ID', 'NETLIFY_BLOBS_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
let scratch: string;
let app: typeof App;
let server: Server;
let base: string;
let sequence = 0;
let calls: any[] = [];
function resetEnvironment() {
  for (const key of cloudKeys) delete process.env[key];
  process.env.NODE_ENV = 'test';
  process.env.AUTH_SESSION_SECRET = 'consistency-fixture-secret';
  process.env.DEEPSEEK_API_KEY = 'consistency-fixture-api-key';
}
const complete = () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Fixture complete' } }] });
before(async () => {
  resetEnvironment();
  scratch = await mkdtemp(path.join(tmpdir(), 'tarot-consistency-'));
  process.chdir(scratch);
  ({ app } = await import('../api/index'));
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  base = `http://127.0.0.1:${address.port}`;
});
beforeEach(async () => {
  resetEnvironment(); calls = [];
  await rm(path.join(scratch, '.data'), { recursive: true, force: true });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.deepseek.com/chat/completions', 'fixtures may not reach external services');
    calls.push(JSON.parse(String(init?.body)));
    return complete();
  };
});
after(async () => {
  globalThis.fetch = nativeFetch;
  server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  process.chdir(previousCwd);
  await rm(scratch, { recursive: true, force: true });
});
async function call(route: string, token?: string, body?: any) {
  const response = await nativeFetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}
async function register() {
  const result = await call('/api/auth/register', undefined, { email: `fixture-${++sequence}@example.invalid`, password: 'fixture-password' });
  assert.equal(result.status, 200);
  return result.data as { token: string; user: { id: string } };
}
const message = { messages: [{ role: 'user', content: 'Fixture question' }] };
function request(token: string, type = 'tarot_message') {
  return { body: { entitlement: { type, energyCost: 0 } }, get: (name: string) => name === 'authorization' ? `Bearer ${token}` : '' } as any;
}
async function order(userId: string, planId = 'plus_monthly', id = `ARfixture${++sequence}`) {
  await writeStoreJson('astro-payment-orders', id, { id, userId, planId, provider: 'xorpay', amount: '9.90', status: 'paid', createdAt: new Date().toISOString(), paidAt: new Date().toISOString(), providerResponse: { privateFixture: true } }, '.data/payment-orders');
  return id;
}

test('omitting entitlement cannot bypass an authenticated account charge, and invalid sessions fail closed', async () => {
  const user = await register();
  const result = await call('/api/deepseek/chat', user.token, message);
  assert.equal(result.status, 200); assert.equal(result.data.entitlement.energy, 4);
  const invalid = await call('/api/deepseek/chat', 'invalid-token', message);
  assert.equal(invalid.status, 401); assert.equal(calls.length, 1);
  await writeStoreJson('astro-entitlements', `users/${user.user.id}`, { energy: 0, membership: { plan: 'free' } }, '.data/entitlements');
  assert.equal((await call('/api/deepseek/chat', user.token, message)).status, 402);
  assert.equal(calls.length, 1);
});

test('guest quota is enforced in persistent storage regardless of client energy and premium flags', async () => {
  for (let index = 0; index < 5; index++) assert.equal((await call('/api/deepseek/chat', undefined, { ...message, energy: 999999 })).status, 200);
  assert.equal((await call('/api/deepseek/chat', undefined, message)).status, 429);
  assert.equal((await call('/api/deepseek/chat', undefined, { ...message, entitlement: { type: 'daily_deep' } })).status, 401);
  assert.equal(calls.length, 5);
});

test('the server caps model, token budget and unsupported upstream parameters', async () => {
  const user = await register();
  const result = await call('/api/deepseek/chat', user.token, { ...message, model: 'unbounded-model', max_tokens: 999999, n: 50, tools: [{ type: 'function' }], thinking: { type: 'enabled' } });
  assert.equal(result.status, 200);
  assert.equal(calls[0].model, 'deepseek-v4-flash'); assert.equal(calls[0].max_tokens, 760);
  assert.equal(calls[0].n, undefined); assert.equal(calls[0].tools, undefined); assert.equal(calls[0].thinking.type, 'disabled');
  assert.equal((await call('/api/deepseek/chat', user.token, { messages: [{ role: 'user', content: 'x'.repeat(60001) }] })).status, 413);
});

test('premium requests and caller-supplied zero energy costs cannot bypass server authorization', async () => {
  const user = await register();
  for (const type of ['bazi', 'guardian', 'simulator', 'daily_deep']) {
    assert.equal((await call('/api/deepseek/chat', user.token, { ...message, entitlement: { type, energyCost: 0 } })).status, 402);
  }
  const paid = await call('/api/deepseek/chat', user.token, { ...message, entitlement: { type: 'tarot_message', energyCost: 0 } });
  assert.equal(paid.data.entitlement.energy, 4);
});

test('concurrent charges each reserve their own energy and finalization is idempotent', async () => {
  const user = await register();
  const [one, two] = await Promise.all([prepareChatEntitlementCharge(request(user.token)), prepareChatEntitlementCharge(request(user.token))]);
  await Promise.all([one!.commit(), two!.commit()]);
  await one!.commit(); await one!.release();
  const result = await call('/api/entitlements/me', user.token);
  assert.equal(result.data.energy, 3);
});

test('a late chat commit preserves a newer purchase, and a failure refunds only its own reservation', async () => {
  const user = await register();
  const pending = await prepareChatEntitlementCharge(request(user.token));
  const id = await order(user.user.id);
  assert.equal((await call('/api/entitlements/apply-order', user.token, { orderId: id })).status, 200);
  await pending!.commit();
  const result = await call('/api/entitlements/me', user.token);
  assert.equal(result.data.membership.plan, 'plus'); assert.equal(result.data.energy, 20);
  const stored = await readStoreJson<any>('astro-entitlements', `users/${user.user.id}`, '.data/entitlements');
  assert.deepEqual(stored.grantedOrderIds, [id]);
});

test('failed AI responses release reserved energy without granting successful mission activity', async () => {
  const user = await register();
  globalThis.fetch = async () => new Response('broken upstream', { status: 502 });
  assert.equal((await call('/api/deepseek/chat', user.token, message)).status, 502);
  // The API completes bounded cleanup after sending its response.
  await new Promise(resolve => setTimeout(resolve, 30));
  const snapshot = await call('/api/entitlements/me', user.token);
  assert.equal(snapshot.data.energy, 5);
  const stored = await readStoreJson<any>('astro-entitlements', `users/${user.user.id}`, '.data/entitlements');
  assert.equal(stored.pendingCharges.length, 0); assert.equal(stored.activity?.tarot, undefined);
});

test('concurrent application of the same paid order grants its credit and bonus once', async () => {
  const user = await register();
  const id = await order(user.user.id, 'daily_fortune_deep');
  const results = await Promise.all([call('/api/entitlements/apply-order', user.token, { orderId: id }), call('/api/entitlements/apply-order', user.token, { orderId: id })]);
  assert.ok(results.every(result => result.status === 200));
  const snapshot = await call('/api/entitlements/me', user.token);
  assert.equal(snapshot.data.energy, 7); assert.equal(snapshot.data.membership.dailyFortuneDeepCredits, 1);
});

test('repeated concurrent check-in grants exactly one server reward that survives refresh', async () => {
  const user = await register();
  const results = await Promise.all([call('/api/entitlements/rewards', user.token, { kind: 'checkin', amount: 999 }), call('/api/entitlements/rewards', user.token, { kind: 'checkin', amount: 999 })]);
  assert.ok(results.every(result => result.status === 200));
  const snapshot = await call('/api/entitlements/me', user.token);
  assert.equal(snapshot.data.energy, 6); assert.equal(snapshot.data.rewards.checkInStreak, 1);
  assert.equal((await call('/api/entitlements/rewards', user.token, { kind: 'mission', completed: true })).status, 409);
});

test('mission reward requires actual successful server activities plus a synced diary', async () => {
  const user = await register();
  await call('/api/entitlements/trial', user.token, {});
  await call('/api/deepseek/chat', user.token, { ...message, entitlement: { type: 'simulator' } });
  await call('/api/deepseek/chat', user.token, message);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  await call('/api/auth/archive', user.token, { baseRevision: null, archive: { format: 'astro-rail-local-archive', version: 1, data: { diaryEntries: [{ id: 'fixture', date, content: 'Fixture diary' }] } } });
  const reward = await call('/api/entitlements/rewards', user.token, { kind: 'mission' });
  assert.equal(reward.status, 200); assert.equal(reward.data.energy, 18);
});

const archive = (ids: string[]) => ({ format: 'astro-rail-local-archive', version: 1, data: { diaryEntries: ids.map(id => ({ id, content: id })) } });
test('stale and simultaneous device uploads cannot overwrite a newer cloud archive', async () => {
  const user = await register();
  const first = await call('/api/auth/archive', user.token, { baseRevision: null, archive: archive(['original']) });
  const revision = first.data.archiveRevision; assert.equal(typeof revision, 'string');
  const results = await Promise.all(['phone', 'desktop'].map(id => call('/api/auth/archive', user.token, { baseRevision: revision, archive: archive(['original', id]) })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const current = await call('/api/auth/archive', user.token);
  const stale = await call('/api/auth/archive', user.token, { baseRevision: revision, archive: archive(['old']) });
  assert.equal(stale.status, 409); assert.equal(stale.data.error.code, 'ARCHIVE_CONFLICT');
  assert.deepEqual((await call('/api/auth/archive', user.token)).data.archive, current.data.archive);
  assert.equal((await call('/api/auth/archive', user.token, { archive: archive(['legacy-client']) })).status, 409);
});

test('invites survive another server instance and expired links fail closed', async () => {
  const user = await register();
  const created = await call('/api/relationship/invites', user.token, { profile: { name: 'Fixture', birthDate: '2000-01-01', birthTime: '12:00' } });
  assert.equal(created.status, 200);
  const cold = await import(new URL('../api/index.ts?consistency-instance=other', import.meta.url).href);
  const otherServer = await new Promise<Server>(resolve => { const result = cold.app.listen(0, '127.0.0.1', () => resolve(result)); });
  try {
    const address = otherServer.address(); assert.ok(address && typeof address === 'object');
    assert.equal((await nativeFetch(`http://127.0.0.1:${address.port}/api/relationship/invites/${created.data.token}`)).status, 200);
    await writeStoreJson('astro-relationship-invites', created.data.token, { profile: {}, expiresAt: Date.now() - 1 }, '.data/relationship-invites');
    assert.equal((await call(`/api/relationship/invites/${created.data.token}`)).status, 404);
  } finally { otherServer.closeAllConnections(); await new Promise<void>(resolve => otherServer.close(() => resolve())); }
});

test('order lookup requires the owning account and never returns payment provider internals', async () => {
  const owner = await register(); const other = await register();
  const id = await order(owner.user.id);
  assert.equal((await call(`/api/payments/orders/${id}`)).status, 401);
  assert.equal((await call(`/api/payments/orders/${id}`, other.token)).status, 403);
  const result = await call(`/api/payments/orders/${id}`, owner.token);
  assert.equal(result.status, 200); assert.equal(result.data.order.providerResponse, undefined); assert.equal(result.data.order.userId, undefined);
  assert.equal((await call('/api/entitlements/apply-order', other.token, { orderId: id })).status, 403);
});

test('a payment callback never acknowledges success when its durable write is unconfirmed', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://fixture-store.invalid'; process.env.UPSTASH_REDIS_REST_TOKEN = 'fixture';
  process.env.XORPAY_AID = 'fixture'; process.env.XORPAY_APP_SECRET = 'fixture-secret';
  const stored = { id: 'ARfixtureCallback', amount: '9.90', status: 'created', provider: 'xorpay' };
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://fixture-store.invalid');
    const [command] = JSON.parse(String(init?.body));
    return command === 'GET' ? Response.json({ result: JSON.stringify(stored) }) : Response.json({ error: 'fixture outage' }, { status: 503 });
  };
  const payload: any = { aoid: 'fixture', order_id: stored.id, pay_price: stored.amount, pay_time: 'fixture-time' };
  payload.sign = createHash('md5').update(payload.aoid + payload.order_id + payload.pay_price + payload.pay_time + 'fixture-secret').digest('hex');
  const response = await nativeFetch(base + '/api/payments/xorpay/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(response.status, 503); assert.equal(await response.text(), 'fail'); assert.equal(stored.status, 'created');
});


test('the final energy point cannot be reserved by two concurrent requests', async () => {
  const user = await register();
  await writeStoreJson('astro-entitlements', `users/${user.user.id}`, { membership: { plan: 'free' }, energy: 1 }, '.data/entitlements');
  const results = await Promise.allSettled([prepareChatEntitlementCharge(request(user.token)), prepareChatEntitlementCharge(request(user.token))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.equal(failed.reason.status, 402);
  for (const result of results) if (result.status === 'fulfilled') await result.value!.release();
  assert.equal((await call('/api/entitlements/me', user.token)).data.energy, 1);
});

test('refresh reclaims expired crash reservations without losing newer membership or credits', async () => {
  const user = await register();
  await writeStoreJson('astro-entitlements', `users/${user.user.id}`, {
    membership: { plan: 'plus', dailyFortuneDeepCredits: 2 }, energy: 19,
    pendingCharges: [{ id: 'crashed-energy', resource: 'energy', amount: 1, expiresAt: Date.now() - 1 }, { id: 'crashed-deep', resource: 'deep', amount: 1, expiresAt: Date.now() - 1 }],
  }, '.data/entitlements');
  const result = await call('/api/entitlements/me', user.token);
  assert.equal(result.status, 200); assert.equal(result.data.energy, 20);
  assert.equal(result.data.membership.plan, 'plus'); assert.equal(result.data.membership.dailyFortuneDeepCredits, 3);
  assert.equal((await call('/api/entitlements/me', user.token)).data.energy, 20);
});

test('registration limits prevent account farming and arbitrary forwarded headers cannot reset local guest budgets', async () => {
  for (let index = 0; index < 5; index++) await register();
  assert.equal((await call('/api/auth/register', undefined, { email: 'sixth@example.invalid', password: 'fixture-password' })).status, 429);
  for (let index = 0; index < 5; index++) await call('/api/deepseek/chat', undefined, message);
  const response = await nativeFetch(base + '/api/deepseek/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.199', 'X-Vercel-Forwarded-For': '192.0.2.199' }, body: JSON.stringify(message) });
  assert.equal(response.status, 429);
});

test('payment callbacks confirm durable state, tolerate decimal formatting and keep paid time stable on replay', async () => {
  process.env.XORPAY_AID = 'fixture'; process.env.XORPAY_APP_SECRET = 'fixture-secret';
  const user = await register();
  const id = 'ARfixtureReplay';
  await writeStoreJson('astro-payment-orders', id, { id, userId: user.user.id, provider: 'xorpay', amount: '9.90', status: 'created', planId: 'plus_monthly' }, '.data/payment-orders');
  const notify = async () => {
    const payload: any = { aoid: 'fixture', order_id: id, pay_price: '9.9', pay_time: 'fixture' };
    payload.sign = createHash('md5').update(payload.aoid + payload.order_id + payload.pay_price + payload.pay_time + 'fixture-secret').digest('hex');
    const response = await nativeFetch(base + '/api/payments/xorpay/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(response.status, 200); assert.equal(await response.text(), 'success');
  };
  await notify();
  const first = await readStoreJson<any>('astro-payment-orders', id, '.data/payment-orders');
  assert.equal(first.status, 'paid');
  const granted = await call('/api/entitlements/me', user.token);
  assert.equal(granted.data.membership.plan, 'plus');
  assert.equal(granted.data.energy, 20);
  await notify();
  assert.equal((await readStoreJson<any>('astro-payment-orders', id, '.data/payment-orders')).paidAt, first.paidAt);
  await call('/api/entitlements/apply-order', user.token, { orderId: id });
  assert.equal((await call('/api/entitlements/me', user.token)).data.membership.expiresAt, granted.data.membership.expiresAt);
});
