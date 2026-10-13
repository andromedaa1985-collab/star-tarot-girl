import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { clearAccountSession, storeAccountSession, type AccountSession } from '../src/lib/accountClient';
import { ACCOUNT_WORKSPACE_LOCK_NAME } from '../src/lib/accountTransition';
import { getAutoRecoveryMeta, getAutoRecoveryPoint, saveAutoRecoveryPoint, type AppBackup } from '../src/lib/appBackup';

const POINT_KEY = 'latest-auto-recovery';
const META_KEY = 'starrail:autoRecoveryMeta';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: Error | null = null;
  done = false;
  private write: { key: string; value: unknown } | null = null;
  private request = { result: undefined as unknown, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null, error: null };

  constructor(private fixture: FakeIndexedDB, readonly mode: IDBTransactionMode) {}

  objectStore() {
    return {
      put: (value: unknown, key: string) => {
        this.write = { key, value: structuredClone(value) };
        this.request.result = key;
        return this.request as unknown as IDBRequest;
      },
      get: (key: string) => {
        this.request.result = structuredClone(this.fixture.values.get(key));
        if (this.fixture.autoReadCommit) queueMicrotask(() => { this.requestSucceeded(); this.commit(); });
        return this.request as unknown as IDBRequest;
      },
    };
  }

  requestSucceeded() { this.request.onsuccess?.(); }
  commit() {
    assert.equal(this.done, false);
    if (this.write) this.fixture.values.set(this.write.key, this.write.value);
    this.done = true;
    this.oncomplete?.();
  }
  abort() {
    if (this.done) return;
    this.done = true;
    this.error = new Error('Synthetic transaction abort');
    // Commit failure can abort a transaction after the individual request
    // already succeeded, without a separate request or transaction error.
    this.onabort?.();
  }
}

class FakeIndexedDB {
  values = new Map<string, unknown>();
  autoReadCommit = true;
  transactions: FakeTransaction[] = [];
  closed = 0;
  private started: Array<(transaction: FakeTransaction) => void> = [];

  nextTransaction() { return new Promise<FakeTransaction>((resolve) => { this.started.push(resolve); }); }
  open() {
    const request = {
      error: null,
      onerror: null as (() => void) | null,
      onupgradeneeded: null as (() => void) | null,
      onsuccess: null as (() => void) | null,
      result: {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => {},
        close: () => { this.closed += 1; },
        transaction: (_store: string, mode: IDBTransactionMode) => {
          const transaction = new FakeTransaction(this, mode);
          this.transactions.push(transaction);
          this.started.shift()?.(transaction);
          return transaction as unknown as IDBTransaction;
        },
      },
    };
    queueMicrotask(() => request.onsuccess?.());
    return request as unknown as IDBOpenDBRequest;
  }
}

class FakeLocks {
  held: LockMode[] = [];
  released = 0;
  requests: Array<{ name: string; mode: LockMode }> = [];

  async request<T>(name: string, options: LockOptions, callback: (lock: Lock | null) => T | Promise<T>): Promise<T> {
    const mode = options.mode || 'exclusive';
    this.requests.push({ name, mode });
    const unavailable = this.held.includes('exclusive') || (mode === 'exclusive' && this.held.length > 0);
    if (unavailable) return callback(null);
    this.held.push(mode);
    try { return await callback({ name, mode } as Lock); }
    finally { this.held.splice(this.held.indexOf(mode), 1); this.released += 1; }
  }
}

const originalGlobals = new Map(['localStorage', 'sessionStorage', 'indexedDB', 'navigator'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const originalFetch = globalThis.fetch;
let storage: MemoryStorage;
let idb: FakeIndexedDB;
let locks: FakeLocks;

beforeEach(() => {
  storage = new MemoryStorage();
  idb = new FakeIndexedDB();
  locks = new FakeLocks();
  const globals = { localStorage: storage, sessionStorage: new MemoryStorage(), indexedDB: idb, navigator: { locks } };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
  globalThis.fetch = async () => { throw new Error('Recovery ownership tests must not make network requests.'); };
});

afterEach(() => {
  idb.transactions.forEach((transaction) => transaction.abort());
  globalThis.fetch = originalFetch;
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

function session(id: string): AccountSession {
  return {
    token: `fictional-token-${id}`,
    user: { id, email: `${id}@example.invalid`, displayName: `Fixture ${id}`, createdAt: '2026-10-13T00:00:00Z', archiveUpdatedAt: null, archiveRecordCount: 0 },
  };
}

function backup(owner: string): AppBackup {
  return {
    format: 'astro-rail-local-archive', version: 1, appName: 'AstroRail', createdAt: '2026-10-13T00:00:00.000Z',
    data: { diaryEntries: [{ id: `${owner}-diary`, content: `Fictional diary for ${owner}`, date: '2026-10-13' }] },
  };
}

function installDiary(owner: string) { storage.setItem('diaryEntries', JSON.stringify(backup(owner).data.diaryEntries)); }
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('recovery saving keeps its shared workspace lock and delays metadata until the IDB transaction commits', async () => {
  storeAccountSession(session('first'));
  installDiary('first');
  const started = idb.nextTransaction();
  let settled = false;
  const saving = saveAutoRecoveryPoint('fixture-commit');
  void saving.then(() => { settled = true; }, () => { settled = true; });
  const transaction = await started;
  assert.equal(transaction.mode, 'readwrite');
  assert.deepEqual(locks.requests, [{ name: ACCOUNT_WORKSPACE_LOCK_NAME, mode: 'shared' }]);
  transaction.requestSucceeded();
  await tick();
  assert.equal(storage.getItem(META_KEY), null);
  assert.equal(settled, false);
  assert.deepEqual(locks.held, ['shared']);
  const canSwitch = await locks.request(ACCOUNT_WORKSPACE_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, (lock) => Boolean(lock));
  assert.equal(canSwitch, false);
  transaction.commit();
  const meta = await saving;
  assert.equal(meta?.ownerId, 'first');
  assert.equal(meta?.recordCount, 1);
  assert.deepEqual(getAutoRecoveryMeta(), meta);
  assert.deepEqual(locks.held, []);
  assert.equal(locks.released, 1);
  const point = idb.values.get(POINT_KEY) as { backup: AppBackup; ownerId: string };
  assert.equal(point.ownerId, 'first');
  assert.deepEqual(point.backup.data.diaryEntries, backup('first').data.diaryEntries);
});

test('a commit abort after request success rejects saving without leaving success metadata', async () => {
  storeAccountSession(session('first'));
  installDiary('first');
  const started = idb.nextTransaction();
  const saving = saveAutoRecoveryPoint('fixture-abort');
  const rejected = assert.rejects(saving, /Synthetic transaction abort/);
  const transaction = await started;
  transaction.requestSucceeded();
  await tick();
  assert.equal(storage.getItem(META_KEY), null);
  assert.deepEqual(locks.held, ['shared']);
  transaction.abort();
  await rejected;
  assert.equal(storage.getItem(META_KEY), null);
  assert.equal(idb.values.has(POINT_KEY), false);
  assert.deepEqual(locks.held, []);
  assert.equal(idb.closed, 1);
});

test('an owner-tagged recovery point is readable only by the same account', async () => {
  const archive = backup('first');
  idb.values.set(POINT_KEY, { backup: archive, ownerId: 'first' });
  storeAccountSession(session('first'));
  assert.deepEqual(await getAutoRecoveryPoint(), archive);
  storeAccountSession(session('second'));
  assert.equal(await getAutoRecoveryPoint(), null);
  clearAccountSession();
  assert.equal(await getAutoRecoveryPoint(), null);
});

test('legacy points without an owner tag remain compatible only with the guest workspace', async () => {
  const archive = backup('legacy-guest');
  idb.values.set(POINT_KEY, archive);
  assert.deepEqual(await getAutoRecoveryPoint(), archive);
  storeAccountSession(session('first'));
  assert.equal(await getAutoRecoveryPoint(), null);
  clearAccountSession();
  assert.deepEqual(await getAutoRecoveryPoint(), archive);
  idb.values.set(POINT_KEY, { backup: archive });
  assert.equal(await getAutoRecoveryPoint(), null, 'A malformed tagged point must not guess an owner.');
});

test('a guest-owned point cannot be restored by a signed-in account', async () => {
  const archive = backup('guest');
  idb.values.set(POINT_KEY, { backup: archive, ownerId: null });
  assert.deepEqual(await getAutoRecoveryPoint(), archive);
  storeAccountSession(session('first'));
  assert.equal(await getAutoRecoveryPoint(), null);
});

test('an account change while a recovery read is pending rejects the old owner snapshot', async () => {
  storeAccountSession(session('first'));
  idb.values.set(POINT_KEY, { backup: backup('first'), ownerId: 'first' });
  idb.autoReadCommit = false;
  const started = idb.nextTransaction();
  const reading = getAutoRecoveryPoint();
  const transaction = await started;
  storeAccountSession(session('second'));
  transaction.requestSucceeded();
  transaction.commit();
  assert.equal(await reading, null);
});
