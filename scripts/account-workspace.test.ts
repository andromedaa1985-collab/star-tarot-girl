import { applyEntitlementSnapshot } from '../src/lib/entitlementClient';
import { normalizeMembership } from '../src/lib/membership';
import { getCloudSyncNotice } from '../src/lib/cloudSyncStatus';
import { aiFetch, ENTITLEMENT_UPDATED_EVENT } from '../src/lib/aiClient';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { autoSyncAccountArchive } from '../src/components/AccountAutoSync';
import {
  beginAccountTransition,
  beginAccountTransitionSafely,
  ACCOUNT_REQUEST_TIMEOUT_MS,
  AccountRequestError,
  getStoredAccountSession,
  isAccountTransitioning,
  isInvalidAccountSessionResponse,
  loginAccount,
  refreshAccountSession,
  registerAccount,
  storeAccountSession,
  watchAccountSessionChanges,
  type AccountSession,
} from '../src/lib/accountClient';
import { activateAccountWorkspace, logoutAccountWorkspace, restoreActiveWorkspaceBackup } from '../src/lib/accountWorkspace';
import type { AppBackup } from '../src/lib/appBackup';
import { ACCOUNT_SESSION_STORAGE_KEY, ACCOUNT_TRANSITION_LEASE_MS, ACCOUNT_TRANSITION_STORAGE_KEY, ACCOUNT_WORKSPACE_REVISION_KEY, acquireAccountWorkspaceTransitionLock, createAccountTransitionCoordinator, getPageAccountTransition, tryWithAccountWorkspaceLock } from '../src/lib/accountTransition';
import type { AccountTransitionJournalStore, AccountTransitionSnapshot } from '../src/lib/accountTransitionJournal';
import { canPersistWorkspace, writeWorkspaceStorage } from '../src/lib/workspacePersistence';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failNextWriteFor: string | null = null;
  byteLimit = Number.POSITIVE_INFINITY;
  get byteSize() { return [...this.values].reduce((size, [key, value]) => size + key.length + value.length, 0); }
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (key === this.failNextWriteFor) {
      this.failNextWriteFor = null;
      throw new Error('Synthetic storage write failure');
    }
    const previousSize = this.values.has(key) ? key.length + this.values.get(key)!.length : 0;
    if (this.byteSize - previousSize + key.length + String(value).length > this.byteLimit) {
      throw new DOMException('Synthetic quota exceeded', 'QuotaExceededError');
    }
    this.values.set(key, String(value));
  }
  snapshot() { return Object.fromEntries([...this.values.entries()].filter(([key]) => key !== ACCOUNT_TRANSITION_STORAGE_KEY).sort()); }
}

class MemoryJournals implements AccountTransitionJournalStore {
  values = new Map<string, AccountTransitionSnapshot>();
  failSave = false;
  async save(id: string, snapshot: AccountTransitionSnapshot) {
    if (this.failSave) throw new Error('Synthetic journal write failure');
    this.values.set(id, structuredClone(snapshot));
  }
  async load(id: string) { return this.values.get(id) || null; }
  async remove(id: string) { this.values.delete(id); }
}

class FixtureLocks {
  private shared = 0;
  private exclusive = false;
  private queued: Array<() => void> = [];
  async request<T>(name: string, options: { mode?: LockMode; ifAvailable?: boolean }, callback: (lock: Lock | null) => T | Promise<T>): Promise<T> {
    const mode = options.mode || 'exclusive';
    if (this.exclusive || (mode === 'exclusive' && this.shared > 0)) {
      if (options.ifAvailable) return await callback(null);
      await new Promise<void>((ready) => this.queued.push(ready));
    }
    if (mode === 'exclusive') this.exclusive = true;
    else this.shared += 1;
    try { return await callback({ name, mode } as Lock); }
    finally {
      if (mode === 'exclusive') this.exclusive = false;
      else this.shared -= 1;
      if (!this.exclusive && this.shared === 0) this.queued.splice(0).forEach((ready) => ready());
    }
  }
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalFetch = globalThis.fetch;
let storage: MemoryStorage;
let releaseTransition: (() => void | Promise<void>) | undefined;
let journals: MemoryJournals;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: new FixtureLocks() } });
  journals = new MemoryJournals();
  getPageAccountTransition(journals);
  globalThis.fetch = async () => { throw new Error('Unexpected network request in a fixture test'); };
});

afterEach(async () => {
  await releaseTransition?.();
  releaseTransition = undefined;
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  if (originalSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
  else Reflect.deleteProperty(globalThis, 'sessionStorage');
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else Reflect.deleteProperty(globalThis, 'navigator');
});

function session(id: string, cloud = false): AccountSession {
  return {
    token: `fixture-token-${id}`,
    user: {
      id,
      email: `${id}@example.test`,
      displayName: `Fixture ${id}`,
      createdAt: '2026-10-01T00:00:00Z',
      archiveUpdatedAt: cloud ? '2026-10-12T00:00:00Z' : null,
      archiveRecordCount: cloud ? 1 : 0,
    },
  };
}

test('a stale tab cannot persist old records before its storage event is delivered', async () => {
  storeAccountSession(session('first'));
  await writeWorkspaceStorage('first', 'diaryEntries', '["first-record"]');
  storeAccountSession(session('second'));
  storage.setItem('diaryEntries', '["second-record"]');
  assert.equal(await writeWorkspaceStorage('first', 'diaryEntries', '["old-in-memory-record"]'), false);
  assert.equal(storage.getItem('diaryEntries'), '["second-record"]');
  releaseTransition = beginAccountTransition();
  assert.equal(await writeWorkspaceStorage('second', 'draft:diary:content', '"pending draft"'), false);
  await releaseTransition();
  assert.equal(await writeWorkspaceStorage('second', 'draft:diary:content', '"current draft"'), true);
});

function backup(owner: string, extra: AppBackup['data'] = {}): AppBackup {
  return {
    format: 'astro-rail-local-archive',
    version: 1,
    createdAt: '2026-10-12T00:00:00Z',
    appName: 'AstroRail',
    data: { diaryEntries: [{ id: `${owner}-diary`, content: `Fictional record for ${owner}`, date: '2026-10-12' }], ...extra },
  };
}

function storedRecordIds(key = 'diaryEntries') {
  return (JSON.parse(storage.getItem(key) || '[]') as Array<{ id: string }>).map((record) => record.id);
}

function localWorkspace(owner: string, data = backup(owner)) {
  storage.setItem(`astroRailAccountWorkspace:${owner}`, JSON.stringify(data));
}

function activateLock() {
  releaseTransition = beginAccountTransition();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('credential requests return a candidate without replacing the active session or records', async () => {
  const previous = session('previous');
  const candidate = session('candidate');
  storeAccountSession(previous);
  storage.setItem('diaryEntries', JSON.stringify(backup('previous').data.diaryEntries));
  const before = storage.snapshot();
  globalThis.fetch = async () => json(candidate);

  assert.deepEqual(await loginAccount({ email: candidate.user.email, password: 'fixture-password' }), candidate);
  assert.deepEqual(await registerAccount({ email: candidate.user.email, password: 'fixture-password', displayName: candidate.user.displayName }), candidate);
  assert.deepEqual(storage.snapshot(), before);
});

test('session expiry and account outages retain status and preserve the original workspace owner', async () => {
  const previous = session('previous');
  storeAccountSession(previous);
  storage.setItem('diaryEntries', JSON.stringify(backup('previous').data.diaryEntries));
  storage.setItem('draft:diary:content', JSON.stringify('Fictional unsaved draft'));
  const before = storage.snapshot();
  for (const [status, code] of [[401, 'ACCOUNT_SESSION_INVALID'], [503, 'ACCOUNT_SERVICE_UNAVAILABLE']] as const) {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code, message: status === 401 ? '登录状态已失效，请重新登录。' : 'Vercel UPSTASH_REDIS_REST storage configuration' } }), { status });
    await assert.rejects(refreshAccountSession(previous), (error: unknown) => {
      assert.ok(error instanceof AccountRequestError);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.equal(isInvalidAccountSessionResponse(error.status, error.code), status === 401);
      assert.doesNotMatch(error.message, /Vercel|UPSTASH/);
      return true;
    });
    assert.deepEqual(storage.snapshot(), before);
  }
  assert.equal(isInvalidAccountSessionResponse(401, 'AI_UPSTREAM_AUTH_ERROR'), false);
  assert.equal(isInvalidAccountSessionResponse(403, 'ACCOUNT_SESSION_INVALID'), false);
  assert.equal(isInvalidAccountSessionResponse(503, 'ACCOUNT_SESSION_INVALID'), false);
});

test('failed cloud activation preserves the original session, records, drafts and recovery metadata', async () => {
  const previous = session('previous');
  storeAccountSession(previous);
  storage.setItem('diaryEntries', JSON.stringify(backup('previous').data.diaryEntries));
  storage.setItem('draft:diary:content', JSON.stringify('Fictional unsaved draft'));
  storage.setItem('starrail:autoRecoveryMeta', JSON.stringify({ createdAt: 'fixture' }));
  const before = storage.snapshot();
  globalThis.fetch = async () => { throw new Error('Synthetic network outage'); };
  activateLock();

  await assert.rejects(activateAccountWorkspace(session('next', true), previous), /Synthetic network outage/);
  assert.deepEqual(storage.snapshot(), before);
  await releaseTransition!();
  assert.equal(isAccountTransitioning(), false);
});

test('cloud activation commits only the new owner and preserves records written while the download waited', async () => {
  const previous = session('previous');
  const candidate = session('candidate', true);
  storeAccountSession(previous);
  storage.setItem('diaryEntries', JSON.stringify(backup('previous').data.diaryEntries));
  const request = deferred<Response>();
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return request.promise; };
  activateLock();
  const activation = activateAccountWorkspace(candidate, previous);
  storage.setItem('diaryEntries', JSON.stringify([{ id: 'previous-pending', content: 'Saved while waiting' }]));
  await autoSyncAccountArchive();
  assert.equal(requests, 1, 'sync is paused throughout activation');
  assert.equal(getStoredAccountSession()?.user.id, 'previous');
  request.resolve(json({ archive: backup('candidate'), archiveUpdatedAt: '2026-10-13T00:00:00Z', archiveRecordCount: 1 }));

  assert.deepEqual(await activation, { source: 'cloud', recordCount: 1 });
  assert.deepEqual(storedRecordIds(), ['candidate-diary']);
  assert.equal(getStoredAccountSession()?.user.id, 'candidate');
  assert.equal(getStoredAccountSession()?.user.archiveUpdatedAt, '2026-10-13T00:00:00Z');
  const preserved = JSON.parse(storage.getItem('astroRailAccountWorkspace:previous')!).data.diaryEntries;
  assert.deepEqual(preserved.map((record: { id: string }) => record.id), ['previous-pending']);
  assert.equal(isAccountTransitioning(), true, 'successful activation remains paused until Provider reload');
});

test('a partial workspace write rolls back all changed records and keeps the previous identity', async () => {
  const previous = session('previous');
  storeAccountSession(previous);
  storage.setItem('diaryEntries', JSON.stringify(backup('previous').data.diaryEntries));
  storage.setItem('energy', '12');
  storage.setItem('theme', 'dark');
  storage.setItem('draft:diary:content', JSON.stringify('Fictional draft'));
  storage.setItem('lastManualBackupAt', 'original-fixture-time');
  localWorkspace('candidate', backup('candidate', { energy: 30, theme: 'light' }));
  const before = storage.snapshot();
  storage.failNextWriteFor = 'energy';
  activateLock();

  await assert.rejects(activateAccountWorkspace(session('candidate'), previous), /Synthetic storage write failure/);
  assert.deepEqual(storage.snapshot(), before);
});

test('a failed final identity commit restores the complete previous workspace', async () => {
  const previous = session('previous');
  storeAccountSession(previous);
  storage.setItem('diaryEntries', JSON.stringify(backup('previous').data.diaryEntries));
  storage.setItem('theme', 'dark');
  localWorkspace('candidate', backup('candidate', { theme: 'light' }));
  const before = storage.snapshot();
  activateLock();
  storage.failNextWriteFor = 'astroRailAccountSession';
  await assert.rejects(activateAccountWorkspace(session('candidate'), previous), /Synthetic storage write failure/);
  assert.deepEqual(storage.snapshot(), before);
});

test('a guest cloud restore failure cannot claim guest records for the candidate account', async () => {
  storage.setItem('diaryEntries', JSON.stringify(backup('guest').data.diaryEntries));
  const before = storage.snapshot();
  globalThis.fetch = async () => json({ archive: { format: 'invalid', data: [] } });
  activateLock();
  await assert.rejects(activateAccountWorkspace(session('candidate', true), null), /账户存档格式无效/);
  assert.deepEqual(storage.snapshot(), before);
  assert.equal(getStoredAccountSession(), null);
  assert.equal(storage.getItem('astroRailAccountWorkspace:candidate'), null);
});

test('an old in-flight upload retains its original owner and cannot overwrite the new identity', async () => {
  const previous = session('previous');
  storeAccountSession(previous);
  storage.setItem('diaryEntries', JSON.stringify(backup('previous').data.diaryEntries));
  localWorkspace('candidate');
  const refresh = deferred<Response>();
  const upload = deferred<Response>();
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    requests.push({ path, init });
    return path.endsWith('/me') ? refresh.promise : upload.promise;
  };
  const refreshing = refreshAccountSession(previous);
  const syncing = autoSyncAccountArchive();
  assert.equal(requests.length, 2);
  const uploaded = requests.find((request) => request.init?.method === 'POST')!;
  assert.equal(new Headers(uploaded.init?.headers).get('Authorization'), `Bearer ${previous.token}`);
  assert.deepEqual(JSON.parse(uploaded.init!.body as string).archive.data.diaryEntries.map((record: { id: string }) => record.id), ['previous-diary']);

  activateLock();
  await activateAccountWorkspace(session('candidate'), previous);
  await autoSyncAccountArchive();
  assert.equal(requests.length, 2, 'no new upload while old Provider is still mounted');
  refresh.resolve(json({ user: { ...previous.user, displayName: 'Late previous metadata' } }));
  upload.resolve(json({ archiveUpdatedAt: '2026-10-13T00:00:00Z', archiveRecordCount: 1 }));
  await Promise.all([refreshing, syncing]);

  assert.equal(getStoredAccountSession()?.user.id, 'candidate');
  assert.deepEqual(storedRecordIds(), ['candidate-diary']);
  assert.equal(storage.getItem('astroRailLastAutoSyncSignature:previous'), null);
  assert.equal(storage.getItem('astroRailLastAutoSyncSignature:candidate'), null);
  await releaseTransition!(); // Simulate a completed Provider reload.
  await getPageAccountTransition().initializeFreshPage();
  globalThis.fetch = async (input, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${session('candidate').token}`);
    assert.deepEqual(JSON.parse(init!.body as string).archive.data.diaryEntries.map((record: { id: string }) => record.id), ['candidate-diary']);
    return json({ archiveUpdatedAt: '2026-10-13T01:00:00Z', archiveRecordCount: 1 });
  };
  await autoSyncAccountArchive();
  assert.ok(storage.getItem('astroRailLastAutoSyncSignature:candidate'));
});

test('same-account login refreshes the token and keeps the current records', async () => {
  const previous = session('same');
  storeAccountSession(previous);
  storage.setItem('diaryEntries', JSON.stringify(backup('same').data.diaryEntries));
  activateLock();
  assert.deepEqual(await activateAccountWorkspace({ ...previous, token: 'fixture-new-token' }, previous), { source: 'same' });
  assert.equal(getStoredAccountSession()?.token, 'fixture-new-token');
  assert.deepEqual(storedRecordIds(), ['same-diary']);
});

test('logout preserves the account workspace and removes its records and identity from the active workspace', async () => {
  storeAccountSession(session('previous'));
  storage.setItem('diaryEntries', JSON.stringify(backup('previous').data.diaryEntries));
  storage.setItem('draft:diary:content', JSON.stringify('Fictional account draft'));
  activateLock();
  await logoutAccountWorkspace();
  assert.equal(getStoredAccountSession(), null);
  assert.equal(storage.getItem('diaryEntries'), null);
  assert.equal(storage.getItem('draft:diary:content'), null);
  assert.deepEqual(JSON.parse(storage.getItem('astroRailAccountWorkspace:previous')!).data.diaryEntries.map((record: { id: string }) => record.id), ['previous-diary']);
  assert.equal(isAccountTransitioning(), true);
});

test('manual restore merges the same account and rolls back partial imports on failure', async () => {
  storeAccountSession(session('previous'));
  storage.setItem('diaryEntries', JSON.stringify(backup('previous').data.diaryEntries));
  storage.setItem('energy', '12');
  const before = storage.snapshot();
  activateLock();
  storage.failNextWriteFor = 'energy';
  await assert.rejects(restoreActiveWorkspaceBackup(backup('cloud', { energy: 30 })), /Synthetic storage write failure/);
  assert.deepEqual(storage.snapshot(), before);
  const result = await restoreActiveWorkspaceBackup(backup('cloud', { energy: 30 }));
  assert.equal(result.mergedKeys, 1);
  assert.deepEqual(new Set(storedRecordIds()), new Set(['previous-diary', 'cloud-diary']));
  assert.equal(getStoredAccountSession()?.user.id, 'previous');
});

test('cross-tab identity changes pause sync and reload once, while metadata-only updates are ignored', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  storeAccountSession(session('previous'));
  let reloadCount = 0;
  const unwatch = watchAccountSessionChanges((resumeAfterRehydration) => {
    releaseTransition = resumeAfterRehydration;
    reloadCount += 1;
  });
  const dispatch = (key: string | null) => {
    const event = new Event('storage');
    Object.assign(event, { key, storageArea: storage });
    events.dispatchEvent(event);
  };
  try {
    storeAccountSession({ ...session('previous'), user: { ...session('previous').user, archiveRecordCount: 10 } });
    dispatch('astroRailAccountSession');
    assert.equal(reloadCount, 0);
    assert.equal(isAccountTransitioning(), false);
    storeAccountSession(session('candidate'));
    dispatch('diaryEntries');
    assert.equal(reloadCount, 0, 'unrelated storage events do not trigger a reload');
    dispatch('astroRailAccountSession');
    assert.equal(isAccountTransitioning(), true, 'pause is acquired before reload');
    assert.equal(reloadCount, 1);
    dispatch('astroRailAccountSession');
    dispatch(null);
    assert.equal(reloadCount, 1);
    unwatch();
    dispatch('astroRailAccountSession');
    assert.equal(reloadCount, 1);
  } finally {
    unwatch();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('a shared preparing marker blocks tab A writes and uploads even after records are B but session is still A', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  storeAccountSession(session('first'));
  storage.setItem('diaryEntries', JSON.stringify(backup('first').data.diaryEntries));
  const writer = createAccountTransitionCoordinator(storage, new MemoryStorage(), undefined, journals);
  const peerPageStorage = new MemoryStorage();
  const peer = createAccountTransitionCoordinator(storage, peerPageStorage, undefined, journals);
  const releaseWriter = writer.begin();
  await writer.prepare(new Map([['diaryEntries', storage.getItem('diaryEntries')]]), 'second');
  storage.setItem('diaryEntries', JSON.stringify(backup('second').data.diaryEntries));
  let reloads = 0;
  let resumePeer: (() => void) | undefined;
  const blocked: boolean[] = [];
  const unwatch = watchAccountSessionChanges((resume) => { reloads += 1; resumePeer = resume; }, (value) => blocked.push(value));
  const dispatch = (key: string) => {
    const event = new Event('storage');
    Object.assign(event, { key, storageArea: storage, newValue: storage.getItem(key), oldValue: null });
    events.dispatchEvent(event);
  };
  try {
    assert.equal(getStoredAccountSession()?.user.id, 'first', 'identity has not committed yet');
    assert.equal(peer.isPaused(), true, 'a different page sees the shared lock synchronously');
    assert.equal(await peer.initializeFreshPage(), 'waiting', 'a new page must wait before mounting Provider');
    assert.equal(blocked.at(-1), true);
    assert.equal(canPersistWorkspace('first'), false);
    assert.equal(await writeWorkspaceStorage('first', 'diaryEntries', '["stale first-tab record"]'), false);
    let requests = 0;
    globalThis.fetch = async () => { requests += 1; throw new Error('Should not upload during preparation'); };
    await autoSyncAccountArchive();
    assert.equal(requests, 0);
    assert.deepEqual(storedRecordIds(), ['second-diary']);
    assert.throws(() => peer.begin(), /正在切换/);

    storeAccountSession(session('second'));
    dispatch(ACCOUNT_SESSION_STORAGE_KEY);
    assert.equal(reloads, 0, 'the peer must not reload into an uncommitted workspace');
    writer.commit('second');
    dispatch(ACCOUNT_TRANSITION_STORAGE_KEY);
    assert.equal(reloads, 1);
    assert.equal(isAccountTransitioning(), true);
    const freshPage = createAccountTransitionCoordinator(storage, peerPageStorage, undefined, journals);
    assert.equal(await freshPage.initializeFreshPage(), 'stable');
    assert.equal(storage.getItem(ACCOUNT_TRANSITION_STORAGE_KEY), null, 'committed reload clears the shared marker');
    resumePeer?.(); // Simulate replacing the old peer Provider with the fresh one.
    assert.equal(canPersistWorkspace('first'), false);
    assert.equal(canPersistWorkspace('second'), false, 'the old page remains stale after the shared marker is cleared');
    await getPageAccountTransition().initializeFreshPage();
    assert.equal(canPersistWorkspace('second'), true);
  } finally {
    unwatch();
    await releaseWriter();
    resumePeer?.();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('an expired preparing lease restores its journal before unlocking a crashed partial workspace', async () => {
  let time = 1000;
  storeAccountSession(session('first'));
  storage.setItem('diaryEntries', JSON.stringify(backup('first').data.diaryEntries));
  storage.setItem('theme', 'dark');
  const before = storage.snapshot();
  const writer = createAccountTransitionCoordinator(storage, new MemoryStorage(), () => time, journals);
  const recoveringPage = createAccountTransitionCoordinator(storage, new MemoryStorage(), () => time, journals);
  const releaseWriter = writer.begin();
  await writer.prepare(new Map(Object.entries(before)), 'second');
  storage.setItem('diaryEntries', JSON.stringify(backup('second').data.diaryEntries));
  storage.setItem('theme', 'light');
  storeAccountSession(session('second'));
  assert.equal(await recoveringPage.initializeFreshPage(), 'waiting');
  time += ACCOUNT_TRANSITION_LEASE_MS + 1;
  try {
    assert.equal(await recoveringPage.initializeFreshPage(), 'reload');
    assert.deepEqual(storage.snapshot(), before);
    assert.equal(storage.getItem(ACCOUNT_TRANSITION_STORAGE_KEY), null);
    assert.equal(recoveringPage.isPaused(), true, 'the recovering page reloads rather than writing stale hydrated state');
    assert.throws(() => writer.commit('second'), /账户切换已中断/);
    const stablePage = createAccountTransitionCoordinator(storage, new MemoryStorage(), () => time, journals);
    assert.equal(await stablePage.initializeFreshPage(), 'stable');
    assert.equal(stablePage.isPaused(), false, 'recovery does not leave a permanent lock');
  } finally { await releaseWriter(); }
});

test('a failed transition releases peers only after restoring original records', async () => {
  storeAccountSession(session('first'));
  storage.setItem('diaryEntries', JSON.stringify(backup('first').data.diaryEntries));
  const before = storage.snapshot();
  const writer = createAccountTransitionCoordinator(storage, new MemoryStorage(), undefined, journals);
  const peer = createAccountTransitionCoordinator(storage, new MemoryStorage(), undefined, journals);
  const releaseWriter = writer.begin();
  await writer.prepare(new Map(Object.entries(before)), 'second');
  storage.setItem('diaryEntries', JSON.stringify(backup('second').data.diaryEntries));
  assert.equal(peer.isPaused(), true);
  await releaseWriter();
  assert.deepEqual(storage.snapshot(), before);
  assert.equal(peer.isPaused(), false);
  assert.equal(await peer.initializeFreshPage(), 'stable');
});

test('a resumed old page cannot commit or clear a newer transition after lease recovery', async () => {
  let time = 1000;
  storeAccountSession(session('first'));
  const oldPage = createAccountTransitionCoordinator(storage, new MemoryStorage(), () => time, journals);
  const nextPage = createAccountTransitionCoordinator(storage, new MemoryStorage(), () => time, journals);
  const releaseOld = oldPage.begin();
  time += ACCOUNT_TRANSITION_LEASE_MS + 1;
  assert.equal(await nextPage.recoverExpired(), true);
  nextPage.pauseForReload()(); // Simulate completing the recovery reload.
  const releaseNew = nextPage.begin();
  const newMarker = storage.getItem(ACCOUNT_TRANSITION_STORAGE_KEY);
  try {
    await assert.rejects(oldPage.prepare(new Map(), 'second'), /账户切换已中断/);
    await releaseOld();
    assert.equal(storage.getItem(ACCOUNT_TRANSITION_STORAGE_KEY), newMarker);
    assert.equal(nextPage.isPaused(), true);
  } finally { await releaseNew(); }
});

test('native exclusive locks prevent two pages from beginning account transactions together', async () => {
  storeAccountSession(session('first'));
  storage.setItem('diaryEntries', JSON.stringify(backup('first').data.diaryEntries));
  const before = storage.snapshot();
  const results = await Promise.allSettled([beginAccountTransitionSafely(), beginAccountTransitionSafely()]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  releaseTransition = (results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<() => Promise<void>>).value;
  assert.deepEqual(storage.snapshot(), before);
  assert.equal(await tryWithAccountWorkspaceLock('shared', () => 'unsafe'), undefined);
});

test('an exclusive lock blocks autosync before even a marker exists, without touching the old vault', async () => {
  storeAccountSession(session('first'));
  storage.setItem('diaryEntries', JSON.stringify(backup('first').data.diaryEntries));
  const releaseLock = await acquireAccountWorkspaceTransitionLock();
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error('Unexpected upload'); };
  try {
    assert.equal(storage.getItem(ACCOUNT_TRANSITION_STORAGE_KEY), null);
    await autoSyncAccountArchive();
    assert.equal(requests, 0);
    assert.equal(storage.getItem('astroRailAccountWorkspace:first'), null);
  } finally { releaseLock(); }
});

test('queued shared writes resume after a failed transition restores the original workspace', async () => {
  storeAccountSession(session('first'));
  storage.setItem('draft:diary:content', '"original draft"');
  releaseTransition = await beginAccountTransitionSafely();
  await getPageAccountTransition().prepare(new Map([['draft:diary:content', storage.getItem('draft:diary:content')]]), 'second');
  storage.setItem('draft:diary:content', '"partial second-account draft"');
  const queued = writeWorkspaceStorage('first', 'draft:diary:content', '"latest first-account draft"');
  await releaseTransition();
  assert.equal(await queued, true);
  assert.equal(storage.getItem('draft:diary:content'), '"latest first-account draft"');
  assert.equal(storage.getItem(ACCOUNT_WORKSPACE_REVISION_KEY), null);
});

test('queued old writes are rejected after a successful same-account restore changes workspace revision', async () => {
  storeAccountSession(session('first'));
  storage.setItem('diaryEntries', JSON.stringify(backup('first').data.diaryEntries));
  releaseTransition = await beginAccountTransitionSafely();
  const queued = writeWorkspaceStorage('first', 'diaryEntries', '[{"id":"stale-provider-record"}]');
  await restoreActiveWorkspaceBackup(backup('cloud'));
  await releaseTransition();
  assert.equal(await queued, false);
  assert.deepEqual(new Set(storedRecordIds()), new Set(['first-diary', 'cloud-diary']));
  assert.equal(getStoredAccountSession()?.user.id, 'first');
  assert.equal(storage.getItem(ACCOUNT_TRANSITION_STORAGE_KEY), null);
  assert.equal(canPersistWorkspace('first'), false, 'an undelivered storage event cannot allow old same-account state to persist');
});

test('a nearly full localStorage can still journal and log out without duplicating records into its quota', async () => {
  const largeContent = 'Fictional record '.repeat(500);
  storeAccountSession(session('first'));
  const record = { id: 'first-diary', content: largeContent, date: '2026-10-12' };
  storage.setItem('diaryEntries', JSON.stringify([record]));
  localWorkspace('first', backup('first', { diaryEntries: [record] }));
  storage.byteLimit = storage.byteSize + 512;
  releaseTransition = await beginAccountTransitionSafely();
  await logoutAccountWorkspace();
  const marker = storage.getItem(ACCOUNT_TRANSITION_STORAGE_KEY)!;
  assert.ok(marker.length < 512);
  assert.equal(marker.includes(largeContent), false);
  assert.equal(journals.values.size, 1);
  assert.equal(getStoredAccountSession(), null);
  assert.equal(storage.getItem('diaryEntries'), null);
  assert.equal(JSON.parse(storage.getItem('astroRailAccountWorkspace:first')!).data.diaryEntries[0].content, largeContent);
  await releaseTransition();
  assert.equal(journals.values.size, 0);
});

test('journal failure leaves original identity and records untouched before any workspace mutation', async () => {
  const previous = session('first');
  storeAccountSession(previous);
  storage.setItem('diaryEntries', JSON.stringify(backup('first').data.diaryEntries));
  localWorkspace('second');
  const before = storage.snapshot();
  releaseTransition = await beginAccountTransitionSafely();
  journals.failSave = true;
  await assert.rejects(activateAccountWorkspace(session('second'), previous), /Synthetic journal write failure/);
  assert.deepEqual(storage.snapshot(), before);
  await releaseTransition();
  assert.equal(storage.getItem(ACCOUNT_TRANSITION_STORAGE_KEY), null);
});

test('unsupported browsers keep local saving usable while refusing account changes and cloud uploads', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  storeAccountSession(session('first'));
  const before = storage.snapshot();
  await assert.rejects(beginAccountTransitionSafely(), /不支持安全账户切换/);
  assert.deepEqual(storage.snapshot(), before);
  assert.equal(await writeWorkspaceStorage('first', 'draft:diary:content', '"local draft"'), true);
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error('Unexpected upload'); };
  await autoSyncAccountArchive();
  assert.equal(requests, 0);
});

test('the account deadline covers a stalled JSON response body and preserves the current session', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  storeAccountSession(session('first'));
  const before = storage.snapshot();
  const reading = deferred<void>();
  globalThis.fetch = async (_input, init) => ({
    ok: true,
    json: () => {
      reading.resolve();
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    },
  } as Response);
  const pending = loginAccount({ email: 'second@example.test', password: 'fixture-password' });
  await reading.promise;
  context.mock.timers.tick(ACCOUNT_REQUEST_TIMEOUT_MS);
  await assert.rejects(pending, /账户服务响应超时/);
  assert.deepEqual(storage.snapshot(), before);
});

test('a fresh committed page hydrates once, then reloads for a later same-account revision change', async () => {
  storeAccountSession(session('first'));
  const firstPage = createAccountTransitionCoordinator(storage, new MemoryStorage(), undefined, journals);
  const releaseFirst = firstPage.begin();
  await firstPage.prepare(new Map(), 'second');
  storeAccountSession(session('second'));
  firstPage.commit('second');
  const freshStorageView = new Proxy(storage, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: freshStorageView });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
  getPageAccountTransition(journals);
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  const ready = deferred<void>();
  let reloads = 0;
  const unwatch = watchAccountSessionChanges((resume) => { releaseTransition = resume; reloads += 1; }, (blocked) => { if (!blocked) ready.resolve(); });
  let releaseSecond: (() => Promise<void>) | undefined;
  try {
    await ready.promise;
    assert.equal(reloads, 0, 'committed startup should not force an extra reload');
    assert.equal(storage.getItem(ACCOUNT_TRANSITION_STORAGE_KEY), null);
    assert.equal(isAccountTransitioning(), false);
    const secondPage = createAccountTransitionCoordinator(storage, new MemoryStorage(), undefined, journals);
    releaseSecond = secondPage.begin();
    await secondPage.prepare(new Map(), 'second');
    secondPage.commit('second');
    const event = new Event('storage');
    Object.assign(event, { key: ACCOUNT_WORKSPACE_REVISION_KEY, storageArea: freshStorageView, newValue: storage.getItem(ACCOUNT_WORKSPACE_REVISION_KEY) });
    events.dispatchEvent(event);
    assert.equal(reloads, 1, 'the previously hydrated page must reload on the next workspace revision');
    assert.equal(canPersistWorkspace('second'), false);
  } finally {
    unwatch();
    await releaseFirst();
    await releaseSecond?.();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});


test('metadata refresh never advances the local archive base and conflicting autosync preserves local records', async () => {
  const current = { ...session('revision-conflict'), archiveBaseRevision: 'base-one' };
  storeAccountSession(current);
  storage.setItem('diaryEntries', JSON.stringify(backup('local').data.diaryEntries));
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/me')) return json({ user: { ...current.user, archiveRevision: 'remote-two' } });
    assert.equal(JSON.parse(String(init?.body)).baseRevision, 'base-one');
    return new Response(JSON.stringify({ error: { code: 'ARCHIVE_CONFLICT', message: '云端已有更新，本机内容已保留。' } }), { status: 409 });
  };
  await refreshAccountSession(current);
  assert.equal(getStoredAccountSession()?.archiveBaseRevision, 'base-one');
  await assert.rejects(autoSyncAccountArchive(), (error: any) => error.code === 'ARCHIVE_CONFLICT');
  assert.deepEqual(storedRecordIds(), ['local-diary']);
  assert.equal(getStoredAccountSession()?.archiveBaseRevision, 'base-one');
  assert.equal(storage.getItem('astroRailLastAutoSyncSignature:revision-conflict'), null);
  assert.equal(getCloudSyncNotice()?.ownerId, 'revision-conflict');
});

test('a confirmed upload advances the archive base and its account vault preserves it across logout/login', async () => {
  const current = { ...session('revision-roundtrip'), archiveBaseRevision: 'base-one' };
  storeAccountSession(current);
  storage.setItem('diaryEntries', JSON.stringify(backup('local').data.diaryEntries));
  globalThis.fetch = async (_input, init) => {
    assert.equal(JSON.parse(String(init?.body)).baseRevision, 'base-one');
    return json({ archiveRevision: 'base-two', archiveUpdatedAt: '2026-10-18T00:00:00Z', archiveRecordCount: 1 });
  };
  await autoSyncAccountArchive();
  assert.equal(getStoredAccountSession()?.archiveBaseRevision, 'base-two');
  activateLock();
  await logoutAccountWorkspace();
  await releaseTransition!();
  await getPageAccountTransition().initializeFreshPage();
  activateLock();
  await activateAccountWorkspace(session('revision-roundtrip'), null);
  assert.equal(getStoredAccountSession()?.archiveBaseRevision, 'base-two');
  assert.deepEqual(storedRecordIds(), ['local-diary']);
});

test('late entitlement snapshots cannot visually undo a newer purchase', () => {
  storeAccountSession(session('snapshot-monotonic'));
  let membership: any;
  let energy = 0;
  const setters: any = { setMembership: (value: any) => { membership = value; }, setEnergy: (value: number) => { energy = value; } };
  applyEntitlementSnapshot({ membership: normalizeMembership({ plan: 'plus' }), energy: 20, revision: 3, updatedAt: 'fixture' }, setters);
  applyEntitlementSnapshot({ membership: normalizeMembership({ plan: 'free' }), energy: 4, revision: 2, updatedAt: 'fixture' }, setters);
  assert.equal(membership.plan, 'plus'); assert.equal(energy, 20);
});

test('AI feature requests carry account authorization and late responses cannot update a different owner', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  let updates = 0;
  events.addEventListener(ENTITLEMENT_UPDATED_EVENT, () => { updates++; });
  try {
    storeAccountSession(session('ai-owner'));
    const pending = deferred<Response>();
    globalThis.fetch = async (_input, init) => {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-token-ai-owner');
      assert.equal(JSON.parse(String(init?.body)).entitlement.type, 'bazi');
      return pending.promise;
    };
    const response = aiFetch('bazi', { method: 'POST', body: JSON.stringify({ messages: [] }) });
    storeAccountSession(session('different-owner'));
    pending.resolve(json({ entitlement: { membership: { plan: 'plus' }, energy: 20 } }));
    await response;
    assert.equal(updates, 0);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});


test('a late same-owner metadata refresh preserves the base advanced by a confirmed upload', async () => {
  const current = { ...session('late-base-refresh'), archiveBaseRevision: 'base-one' };
  storeAccountSession(current);
  storage.setItem('diaryEntries', JSON.stringify(backup('local').data.diaryEntries));
  const metadata = deferred<Response>();
  globalThis.fetch = async (input) => String(input).endsWith('/me') ? metadata.promise : json({ archiveRevision: 'base-two', archiveUpdatedAt: '2026-10-18T00:00:00Z', archiveRecordCount: 1 });
  const refreshing = refreshAccountSession(current);
  await autoSyncAccountArchive();
  metadata.resolve(json({ user: { ...current.user, archiveRevision: 'base-one' } }));
  await refreshing;
  assert.equal(getStoredAccountSession()?.archiveBaseRevision, 'base-two');
});
