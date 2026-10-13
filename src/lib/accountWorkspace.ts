import {
  APP_STORAGE_KEYS,
  createAppBackup,
  importAppBackup,
  type AppBackup,
} from './appBackup';
import {
  clearAccountSession,
  commitAccountTransition,
  downloadCloudArchive,
  getStoredAccountSession,
  isCurrentAccountSession,
  ownsAccountTransition,
  prepareAccountTransition,
  requireOwnedAccountTransition,
  storeAccountSession,
  uploadCloudArchive,
  type AccountSession,
} from './accountClient';
import { ACCOUNT_WORKSPACE_REVISION_KEY, getPageAccountTransition, tryWithAccountWorkspaceLock } from './accountTransition';

const WORKSPACE_PREFIX = 'astroRailAccountWorkspace:';
const GUEST_WORKSPACE_ID = 'guest';

export type AccountActivationResult =
  | { source: 'same' }
  | { source: 'local' }
  | { source: 'cloud'; recordCount: number }
  | { source: 'claimed-local' }
  | { source: 'fresh' };

function workspaceKey(ownerId: string | null) {
  return `${WORKSPACE_PREFIX}${ownerId || GUEST_WORKSPACE_ID}`;
}

function hasCurrentAppData() {
  return APP_STORAGE_KEYS.some((key) => localStorage.getItem(key) !== null);
}

function validateWorkspace(backup: AppBackup) {
  if (backup?.format !== 'astro-rail-local-archive' || backup.version !== 1 || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    throw new Error('账户存档格式无效，当前本机记录已保留。');
  }
  return backup;
}

function readWorkspace(ownerId: string): AppBackup | null {
  const raw = localStorage.getItem(workspaceKey(ownerId));
  if (!raw) return null;
  try {
    return validateWorkspace(JSON.parse(raw));
  } catch {
    throw new Error('这个账户的本机存档暂时无法读取，当前记录已保留。');
  }
}

const WORKSPACE_STORAGE_KEYS = [...APP_STORAGE_KEYS, 'lastManualBackupAt', 'starrail:autoRecoveryMeta'];

function snapshotStorage(keys: string[]) {
  return new Map([...keys, ACCOUNT_WORKSPACE_REVISION_KEY].map((key) => [key, localStorage.getItem(key)]));
}

function restoreStorage(snapshot: Map<string, string | null>) {
  const changed = [...snapshot].filter(([key, value]) => localStorage.getItem(key) !== value);
  // Free failed target writes first, so the original records fit their old quota.
  changed.forEach(([key]) => localStorage.removeItem(key));
  changed.forEach(([key, value]) => {
    if (value !== null) localStorage.setItem(key, value);
  });
}

function rollbackWorkspace(snapshot: Map<string, string | null>, session: AccountSession | null) {
  // A lease recovery may already have restored this snapshot and granted a
  // different page a new transition. A resumed old operation must not undo it.
  if (!ownsAccountTransition()) return;
  restoreStorage(snapshot);
  if (session) storeAccountSession(session);
  else clearAccountSession();
}

function replaceWorkspace(backup: AppBackup | null) {
  WORKSPACE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  if (backup) importAppBackup(backup);
}

function clearPreviousRecoveryPoint() {
  try {
    // Delete only after a successful commit; a failed login must keep recovery data.
    indexedDB.deleteDatabase('astro-rail-archive');
  } catch {
    // A missing or unavailable IndexedDB must not block switching accounts.
  }
}

function requireAccountTransition() {
  requireOwnedAccountTransition();
}

export function saveAccountWorkspace(ownerId: string | null) {
  if (!hasCurrentAppData()) return null;
  const backup = createAppBackup();
  localStorage.setItem(workspaceKey(ownerId), JSON.stringify(backup));
  return backup;
}

export async function activateAccountWorkspace(
  nextSession: AccountSession,
  previousSession: AccountSession | null,
): Promise<AccountActivationResult> {
  requireAccountTransition();
  const previousUserId = previousSession?.user.id || null;
  const nextUserId = nextSession.user.id;

  let result: AccountActivationResult = { source: 'same' };
  let target: AppBackup | null = null;
  let committedSession = nextSession;
  if (previousUserId !== nextUserId) {
    target = readWorkspace(nextUserId);
    if (target) {
      result = { source: 'local' };
    } else if (nextSession.user.archiveUpdatedAt) {
      const cloud = await downloadCloudArchive(nextSession);
      target = validateWorkspace(cloud.archive);
      committedSession = {
        ...nextSession,
        user: { ...nextSession.user, archiveUpdatedAt: cloud.archiveUpdatedAt, archiveRecordCount: cloud.archiveRecordCount },
      };
      result = { source: 'cloud', recordCount: cloud.archiveRecordCount };
    } else {
      result = { source: 'fresh' };
    }
  }

  // Fetch first, then snapshot. Records written while the request was pending
  // belong to the previous owner and must survive either commit or rollback.
  if (!isCurrentAccountSession(previousSession)) {
    throw new Error('当前账户已发生变化，请重新登录。');
  }
  const hadLocalData = hasCurrentAppData();
  if (result.source === 'fresh' && !previousUserId && hadLocalData) {
    result = { source: 'claimed-local' };
  }
  const snapshot = snapshotStorage([
    ...WORKSPACE_STORAGE_KEYS,
    workspaceKey(previousUserId),
    workspaceKey(nextUserId),
  ]);
  const originalSession = getStoredAccountSession();
  await prepareAccountTransition(snapshot, nextUserId);
  try {
    if (previousUserId || hadLocalData) saveAccountWorkspace(previousUserId);
    if (result.source !== 'same' && result.source !== 'claimed-local') replaceWorkspace(target);
    saveAccountWorkspace(nextUserId);
    // Commit identity last, when all active records already belong to this user.
    storeAccountSession(committedSession);
    commitAccountTransition(nextUserId);
  } catch (error) {
    rollbackWorkspace(snapshot, originalSession);
    throw error;
  }
  if (result.source !== 'same' && result.source !== 'claimed-local') clearPreviousRecoveryPoint();
  return result;
}

export async function logoutAccountWorkspace() {
  requireAccountTransition();
  const session = getStoredAccountSession();
  if (!session) { commitAccountTransition(null); return; }
  const snapshot = snapshotStorage([...WORKSPACE_STORAGE_KEYS, workspaceKey(session.user.id)]);
  await prepareAccountTransition(snapshot, null);
  try {
    saveAccountWorkspace(session.user.id);
    replaceWorkspace(null);
    clearAccountSession();
    commitAccountTransition(null);
  } catch (error) {
    rollbackWorkspace(snapshot, session);
    throw error;
  }
  clearPreviousRecoveryPoint();
}

export async function restoreActiveWorkspaceBackup(backup: AppBackup, updatedSession?: AccountSession) {
  requireAccountTransition();
  validateWorkspace(backup);
  const session = getStoredAccountSession();
  if (updatedSession && !isCurrentAccountSession(updatedSession)) {
    throw new Error('当前账户已发生变化，请重新恢复存档。');
  }
  const snapshot = snapshotStorage([...WORKSPACE_STORAGE_KEYS, workspaceKey(session?.user.id || null)]);
  await prepareAccountTransition(snapshot, session?.user.id || null);
  try {
    const result = importAppBackup(backup);
    saveAccountWorkspace(session?.user.id || null);
    if (updatedSession) storeAccountSession(updatedSession);
    commitAccountTransition(session?.user.id || null);
    return result;
  } catch (error) {
    rollbackWorkspace(snapshot, session);
    throw error;
  }
}

export async function uploadAccountWorkspaceSnapshot(session: AccountSession) {
  const started = await tryWithAccountWorkspaceLock('shared', () => {
    requireSafeAccountSnapshot(session);
    const backup = createAppBackup();
    saveAccountWorkspace(session.user.id);
    // Capture and initiate the request under the same lock. Network waiting
    // does not hold the read lock or prevent a later account transition.
    return { uploading: uploadCloudArchive(session, backup) };
  });
  if (!started) throw new Error('暂时无法安全同步，请稍候重试或更新浏览器。');
  return started.uploading;
}

function requireSafeAccountSnapshot(session: AccountSession) {
  if (!isCurrentAccountSession(session) || getPageAccountTransition().isPaused()) throw new Error('当前账户或工作区正在变化，请稍后重新同步。');
}
