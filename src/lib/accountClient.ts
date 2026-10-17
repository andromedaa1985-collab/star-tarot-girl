import type { AppBackup } from './appBackup';
import { apiFetch } from './apiClient';
import { ACCOUNT_SESSION_STORAGE_KEY, ACCOUNT_TRANSITION_STORAGE_KEY, ACCOUNT_WORKSPACE_REVISION_KEY, acquireAccountWorkspaceTransitionLock, getPageAccountTransition, tryWithAccountWorkspaceLock, type AccountTransitionMarker } from './accountTransition';

const SESSION_STORAGE_KEY = ACCOUNT_SESSION_STORAGE_KEY;
const TRANSITION_CHANGE_EVENT = 'astroRailAccountTransitionChange';
export const ACCOUNT_REQUEST_TIMEOUT_MS = 30_000;

export class AccountRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'AccountRequestError';
  }
}

export function isInvalidAccountSessionResponse(status: number, code: unknown) {
  return status === 401 && code === 'ACCOUNT_SESSION_INVALID';
}

function notifyAccountTransition() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TRANSITION_CHANGE_EVENT));
}

// A successful workspace change keeps this lock until the page reloads and
// AppProvider reads the new workspace. Release it only when the change fails.
export function beginAccountTransition() {
  const release = getPageAccountTransition().begin();
  notifyAccountTransition();
  return async () => {
    await release();
    notifyAccountTransition();
  };
}

export async function beginAccountTransitionSafely() {
  const releaseBrowserLock = await acquireAccountWorkspaceTransitionLock();
  try {
    const releaseTransition = beginAccountTransition();
    return async () => {
      try { await releaseTransition(); }
      finally { releaseBrowserLock(); }
    };
  } catch (error) {
    releaseBrowserLock();
    throw error;
  }
}

export function isAccountTransitioning() {
  return getPageAccountTransition().isPaused();
}

export function ownsAccountTransition() {
  return getPageAccountTransition().ownsTransition();
}

export function requireOwnedAccountTransition() {
  getPageAccountTransition().requireOwned();
}

export async function prepareAccountTransition(snapshot: Map<string, string | null>, targetOwnerId: string | null) {
  await getPageAccountTransition().prepare(snapshot, targetOwnerId);
}

export function commitAccountTransition(targetOwnerId: string | null) {
  getPageAccountTransition().commit(targetOwnerId);
  notifyAccountTransition();
}

export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  archiveUpdatedAt: string | null;
  archiveRecordCount: number;
  archiveRevision?: string | null;
}

export interface AccountSession {
  archiveBaseRevision?: string | null;
  token: string;
  user: AccountUser;
}

function isValidAccountSession(value: unknown): value is AccountSession {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AccountSession>;
  return typeof candidate.token === 'string' && Boolean(candidate.token) && typeof candidate.user?.id === 'string' && Boolean(candidate.user.id);
}

async function readJsonResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AccountRequestError(
      toPublicErrorMessage(data?.error?.message),
      response.status,
      typeof data?.error?.code === 'string' ? data.error.code : undefined,
    );
  }
  return data;
}

async function requestAccountJson(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ACCOUNT_REQUEST_TIMEOUT_MS);
  try {
    const response = await apiFetch(path, { ...init, signal: controller.signal });
    // Keep the deadline active until the body has been read as well.
    const data = await readJsonResponse(response);
    if (controller.signal.aborted) throw new Error('Account request timed out');
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new AccountRequestError('账户服务响应超时，请稍后重试。当前本机存档已保留。', 504, 'ACCOUNT_SERVICE_TIMEOUT');
    throw error;
  } finally { clearTimeout(timeout); }
}

function toPublicErrorMessage(message: unknown) {
  if (typeof message !== 'string' || !message.trim()) return '请求失败，请稍后再试。';
  if (
    message.includes('AUTH_SESSION_SECRET') ||
    message.includes('Netlify') ||
    message.includes('Blobs') ||
    message.includes('Vercel') ||
    message.includes('Upstash') ||
    message.includes('UPSTASH_REDIS_REST')
  ) {
    return '账户服务暂时不可用，请稍后再试。';
  }
  return message;
}

export function authHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getStoredAccountSession(): AccountSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    const session = raw ? JSON.parse(raw) : null;
    return isValidAccountSession(session) ? session : null;
  } catch {
    return null;
  }
}

export function storeAccountSession(session: AccountSession) {
  if (!isValidAccountSession(session)) throw new Error('账户信息无效，请重新登录。');
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearAccountSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function isCurrentAccountSession(session: AccountSession | null) {
  const current = getStoredAccountSession();
  return current?.token === session?.token && current?.user.id === session?.user.id;
}

export function watchAccountSessionChanges(onChange: (resumeAfterRehydration: () => void) => void, onBlockedChange?: (blocked: boolean) => void, onRecoveryError?: (message: string) => void) {
  let mountedSession = getStoredAccountSession();
  const coordinator = getPageAccountTransition();
  let needsInitialHydration = coordinator.isPaused();
  let notified = false;
  let disposed = false;
  let settling = false;
  const reload = () => {
    if (notified) return;
    notified = true;
    onBlockedChange?.(true);
    onChange(coordinator.pauseForReload());
  };
  const observe = (eventMarker?: AccountTransitionMarker | null) => {
    if (notified) return;
    const marker = coordinator.read();
    onBlockedChange?.(coordinator.isPaused());
    if (coordinator.ownsTransition()) return;
    if (marker?.phase === 'preparing') return;
    if (!isCurrentAccountSession(mountedSession) || coordinator.isStaleWorkspace() || ((marker?.phase === 'committed' || eventMarker?.phase === 'committed') && !coordinator.ownsTransition())) reload();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage || (event.key !== SESSION_STORAGE_KEY && event.key !== ACCOUNT_TRANSITION_STORAGE_KEY && event.key !== ACCOUNT_WORKSPACE_REVISION_KEY && event.key !== null)) return;
    let marker: AccountTransitionMarker | null = null;
    if (event.key === ACCOUNT_TRANSITION_STORAGE_KEY) {
      try { marker = JSON.parse(event.newValue || event.oldValue || 'null'); } catch { /* Observe the validated current marker instead. */ }
    }
    observe(marker);
  };
  const handleLocalChange = () => observe();
  window.addEventListener('storage', handleStorage);
  window.addEventListener(TRANSITION_CHANGE_EVENT, handleLocalChange);
  const settle = async () => {
    if (notified || disposed || settling) return;
    const marker = coordinator.read();
    onBlockedChange?.(coordinator.isPaused());
    if (coordinator.ownsTransition() || (marker?.phase === 'preparing' && marker.expiresAt > Date.now())) return;
    if (!needsInitialHydration && (marker?.phase === 'committed' || coordinator.isStaleWorkspace())) return reload();
    if (!marker && !needsInitialHydration) return;
    settling = true;
    try {
      const result = await tryWithAccountWorkspaceLock('exclusive', () => needsInitialHydration ? coordinator.initializeFreshPage() : coordinator.recoverExpired().then((changed) => changed ? 'reload' : 'waiting'));
      if (disposed || notified) return;
      if (result === 'reload') reload();
      else if (result === 'stable') {
        // This page has not hydrated a Provider yet. Accept the committed
        // identity once, then let future external changes use the reload path.
        mountedSession = getStoredAccountSession();
        needsInitialHydration = false;
        onBlockedChange?.(coordinator.isPaused());
      }
    } catch (error: any) {
      onBlockedChange?.(true);
      onRecoveryError?.(error?.message || '账户恢复点暂时无法读取，请保持页面并稍后重试。');
    } finally { settling = false; }
  };
  void settle();
  const recoveryTimer = setInterval(() => { void settle(); }, 2500);
  recoveryTimer.unref?.();
  return () => {
    disposed = true;
    clearInterval(recoveryTimer);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(TRANSITION_CHANGE_EVENT, handleLocalChange);
  };
}

export async function registerAccount(input: { email: string; password: string; displayName: string }) {
  const session = await requestAccountJson('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }) as AccountSession;
  if (!isValidAccountSession(session)) throw new Error('账户信息无效，请稍后重新登录。');
  return session;
}

export async function loginAccount(input: { email: string; password: string }) {
  const session = await requestAccountJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }) as AccountSession;
  if (!isValidAccountSession(session)) throw new Error('账户信息无效，请稍后重新登录。');
  return session;
}

export async function refreshAccountSession(session: AccountSession) {
  const data = await requestAccountJson('/api/auth/me', {
    headers: authHeaders(session.token),
    cache: 'no-store',
  }) as { user: AccountUser };
  if (data.user?.id !== session.user.id) throw new Error('账户信息不一致，请重新登录。');
  let nextSession = { ...session, user: data.user };
  await tryWithAccountWorkspaceLock('shared', () => {
    if (!isAccountTransitioning() && isCurrentAccountSession(session)) {
      // A concurrent confirmed upload may have advanced the local base already.
      nextSession = { ...getStoredAccountSession()!, user: data.user };
      storeAccountSession(nextSession);
    }
  });
  return nextSession;
}

export async function uploadCloudArchive(session: AccountSession, archive: AppBackup) {
  if (isAccountTransitioning() || !isCurrentAccountSession(session)) {
    throw new Error('账户正在切换，请稍后再同步。');
  }
  const data = await requestAccountJson('/api/auth/archive', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(session.token),
    },
    body: JSON.stringify({ archive, baseRevision: session.archiveBaseRevision ?? null }),
  }) as Pick<AccountUser, 'archiveUpdatedAt' | 'archiveRecordCount' | 'archiveRevision'>;
  const nextSession = {
    ...session,
    archiveBaseRevision: data.archiveRevision ?? null,
    user: {
      ...session.user,
      archiveRevision: data.archiveRevision ?? null,
      archiveUpdatedAt: data.archiveUpdatedAt,
      archiveRecordCount: data.archiveRecordCount,
    },
  };
  await tryWithAccountWorkspaceLock('shared', () => {
    if (!isAccountTransitioning() && isCurrentAccountSession(session)) storeAccountSession(nextSession);
  });
  return nextSession;
}

export async function downloadCloudArchive(session: AccountSession) {
  return await requestAccountJson('/api/auth/archive', {
    headers: authHeaders(session.token),
    cache: 'no-store',
  }) as {
    archive: AppBackup;
    archiveRevision: string;
    archiveUpdatedAt: string;
    archiveRecordCount: number;
  };
}
