import { browserAccountTransitionJournal, type AccountTransitionJournalStore } from './accountTransitionJournal';

export const ACCOUNT_SESSION_STORAGE_KEY = 'astroRailAccountSession';
export const ACCOUNT_TRANSITION_STORAGE_KEY = 'astroRailAccountTransition';
export const ACCOUNT_WORKSPACE_LOCK_NAME = 'astroRail:account-workspace';
export const ACCOUNT_WORKSPACE_REVISION_KEY = 'astroRailWorkspaceRevision';
export const ACCOUNT_TRANSITION_LEASE_MS = 90_000;
const TAB_ID_KEY = 'astroRailAccountTabId';

export interface AccountTransitionMarker {
  id: string;
  tabId: string;
  phase: 'preparing' | 'committed';
  targetOwnerId: string | null;
  expiresAt: number;
  journalId: string | null;
}

function nonce() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function browserLocks() { return typeof navigator !== 'undefined' ? navigator.locks : undefined; }

export async function tryWithAccountWorkspaceLock<T>(mode: LockMode, operation: () => T): Promise<Awaited<T> | undefined> {
  const locks = browserLocks();
  if (!locks) return undefined;
  return locks.request(ACCOUNT_WORKSPACE_LOCK_NAME, { mode, ifAvailable: true }, (lock) => lock ? operation() : undefined);
}

export async function acquireAccountWorkspaceTransitionLock(): Promise<() => void> {
  const locks = browserLocks();
  if (!locks) throw new Error('当前浏览器不支持安全账户切换，请更新浏览器后重试。当前账户和存档已保留。');
  return new Promise((resolve, reject) => {
    let release!: () => void;
    const released = new Promise<void>((done) => { release = done; });
    void locks.request(ACCOUNT_WORKSPACE_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) { reject(new Error('另一个页面正在更新存档，请稍候重试。')); return; }
      resolve(release);
      await released;
    }).catch(reject);
  });
}

// Each page owns a coordinator. Only the small marker consumes localStorage;
// the complete rollback journal lives in an independent durable store.
export function createAccountTransitionCoordinator(storage: Storage, pageStorage: Storage, now = () => Date.now(), journals: AccountTransitionJournalStore = browserAccountTransitionJournal) {
  let tabId = nonce();
  try {
    tabId = pageStorage.getItem(TAB_ID_KEY) || tabId;
    pageStorage.setItem(TAB_ID_KEY, tabId);
  } catch { /* Shared storage still protects accounts if page-local storage is denied. */ }
  let pausedForReload = false;
  let ownedId: string | null = null;
  let mountedRevision = storage.getItem(ACCOUNT_WORKSPACE_REVISION_KEY);
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  function read(): AccountTransitionMarker | null {
    const raw = storage.getItem(ACCOUNT_TRANSITION_STORAGE_KEY);
    if (!raw) return null;
    const marker = JSON.parse(raw) as AccountTransitionMarker;
    if (!marker.id || !marker.tabId || !['preparing', 'committed'].includes(marker.phase) || !Number.isFinite(marker.expiresAt)) {
      throw new Error('账户切换状态无法读取，请刷新页面后重试。');
    }
    return marker;
  }
  function currentOwner() {
    try { return JSON.parse(storage.getItem(ACCOUNT_SESSION_STORAGE_KEY) || 'null')?.user?.id || null; }
    catch { return null; }
  }
  function write(marker: AccountTransitionMarker) { storage.setItem(ACCOUNT_TRANSITION_STORAGE_KEY, JSON.stringify(marker)); }
  function stopHeartbeat() {
    if (heartbeat !== undefined) clearInterval(heartbeat);
    heartbeat = undefined;
  }
  function requireOwned() {
    const marker = read();
    if (!ownedId || marker?.id !== ownedId || marker.phase !== 'preparing' || marker.expiresAt <= now()) {
      throw new Error('账户切换已中断，当前记录会安全恢复。请重新登录。');
    }
    return marker;
  }
  async function restore(marker: AccountTransitionMarker) {
    if (!marker.journalId) return;
    const snapshot = await journals.load(marker.journalId);
    if (!snapshot) throw new Error('账户恢复点暂时无法读取，请刷新页面后重试。');
    const changed = snapshot.filter(([key, value]) => storage.getItem(key) !== value);
    changed.forEach(([key]) => storage.removeItem(key));
    changed.forEach(([key, value]) => { if (value !== null) storage.setItem(key, value); });
  }
  function remove(marker: AccountTransitionMarker) {
    if (read()?.id === marker.id) storage.removeItem(ACCOUNT_TRANSITION_STORAGE_KEY);
    if (ownedId === marker.id) { ownedId = null; stopHeartbeat(); }
  }
  async function cleanJournal(marker: AccountTransitionMarker) {
    if (marker.journalId) await journals.remove(marker.journalId).catch(() => {});
  }
  function begin() {
    if (pausedForReload || ownedId || read() || isStaleWorkspace()) throw new Error('账户正在切换或工作区已更新，请刷新后重试。');
    const marker: AccountTransitionMarker = {
      id: nonce(), tabId, phase: 'preparing', targetOwnerId: null,
      expiresAt: now() + ACCOUNT_TRANSITION_LEASE_MS, journalId: null,
    };
    write(marker);
    ownedId = marker.id;
    heartbeat = setInterval(() => {
      const current = read();
      if (current?.id !== ownedId || current.phase !== 'preparing' || current.expiresAt <= now()) return stopHeartbeat();
      try { write({ ...current, expiresAt: now() + ACCOUNT_TRANSITION_LEASE_MS }); }
      catch { stopHeartbeat(); }
    }, 15_000);
    heartbeat.unref?.();
    let released = false;
    return async () => {
      if (released) return;
      const current = read();
      if (current?.id === marker.id) {
        if (current.phase === 'preparing') await restore(current);
        remove(current);
        await cleanJournal(current);
      }
      released = true;
      if (ownedId === marker.id) ownedId = null;
      stopHeartbeat();
      pausedForReload = false;
    };
  }
  async function prepare(snapshot: Map<string, string | null>, targetOwnerId: string | null) {
    const marker = requireOwned();
    const recovery = new Map(snapshot);
    recovery.set(ACCOUNT_SESSION_STORAGE_KEY, storage.getItem(ACCOUNT_SESSION_STORAGE_KEY));
    recovery.set(ACCOUNT_WORKSPACE_REVISION_KEY, storage.getItem(ACCOUNT_WORKSPACE_REVISION_KEY));
    const journalId = marker.journalId || marker.id;
    await journals.save(journalId, [...recovery]);
    const current = requireOwned();
    write({ ...current, targetOwnerId, journalId, expiresAt: now() + ACCOUNT_TRANSITION_LEASE_MS });
  }
  function commit(targetOwnerId: string | null) {
    const marker = requireOwned();
    if (currentOwner() !== targetOwnerId) throw new Error('账户工作区尚未就绪，请重新登录。');
    storage.setItem(ACCOUNT_WORKSPACE_REVISION_KEY, marker.id);
    write({ ...marker, phase: 'committed', targetOwnerId, expiresAt: now() + ACCOUNT_TRANSITION_LEASE_MS });
    stopHeartbeat();
  }
  async function recoverExpired() {
    const marker = read();
    if (!marker || marker.expiresAt > now()) return false;
    pausedForReload = true;
    if (marker.phase !== 'committed' || currentOwner() !== marker.targetOwnerId) await restore(marker);
    remove(marker);
    await cleanJournal(marker);
    return true;
  }
  async function initializeFreshPage() {
    const marker = read();
    if (!marker) { mountedRevision = storage.getItem(ACCOUNT_WORKSPACE_REVISION_KEY); return 'stable' as const; }
    if (!ownedId && marker.phase === 'committed' && currentOwner() === marker.targetOwnerId) {
      remove(marker);
      await cleanJournal(marker);
      mountedRevision = storage.getItem(ACCOUNT_WORKSPACE_REVISION_KEY);
      return 'stable' as const;
    }
    if (await recoverExpired()) return 'reload' as const;
    return 'waiting' as const;
  }
  function pauseForReload() { pausedForReload = true; return () => { pausedForReload = false; }; }
  function isStaleWorkspace() { return mountedRevision !== storage.getItem(ACCOUNT_WORKSPACE_REVISION_KEY); }
  return {
    read, begin, prepare, commit, recoverExpired, initializeFreshPage, pauseForReload, requireOwned,
    isStaleWorkspace,
    isPaused: () => pausedForReload || Boolean(ownedId) || Boolean(read()) || isStaleWorkspace(),
    ownsTransition: () => Boolean(ownedId && read()?.id === ownedId),
  };
}

let pageCoordinator: ReturnType<typeof createAccountTransitionCoordinator> | undefined;
let coordinatorStorage: Storage | undefined;
export function getPageAccountTransition(journals?: AccountTransitionJournalStore) {
  if (!pageCoordinator || coordinatorStorage !== localStorage) {
    pageCoordinator = createAccountTransitionCoordinator(localStorage, sessionStorage, undefined, journals);
    coordinatorStorage = localStorage;
  }
  return pageCoordinator;
}
