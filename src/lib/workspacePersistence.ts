import { getStoredAccountSession, isAccountTransitioning } from './accountClient';
import { ACCOUNT_WORKSPACE_LOCK_NAME } from './accountTransition';

export const WORKSPACE_STORAGE_STATUS_EVENT = 'astroRailWorkspaceStorageStatus';
const failedKeys = new Set<string>();
let storageError: string | null = null;
export function getWorkspaceStorageError() { return storageError; }

function reportStorageResult(key: string, error?: unknown) {
  if (error) {
    failedKeys.add(key);
    storageError = (error as { name?: string }).name === 'QuotaExceededError'
      ? '本机空间不足，部分更改尚未保存。请先复制当前输入并导出已有记录，再清理空间。'
      : '本机存档暂时无法写入，部分更改尚未保存。请先保留当前输入，再重试。';
  } else {
    failedKeys.delete(key);
    if (failedKeys.size === 0) storageError = null;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WORKSPACE_STORAGE_STATUS_EVENT));
}

export function canPersistWorkspace(ownerId: string | null) {
  return !isAccountTransitioning() && (getStoredAccountSession()?.user.id || null) === ownerId;
}

async function mutateWorkspaceStorage(ownerId: string | null, key: string, value: string | null) {
  const write = () => {
    if (!canPersistWorkspace(ownerId)) return false;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    reportStorageResult(key);
    return true;
  };
  try {
    // Account changes are refused without Web Locks; ordinary local saving
    // remains usable in that environment with identity and transition checks.
    return typeof navigator !== 'undefined' && navigator.locks
      ? await navigator.locks.request(ACCOUNT_WORKSPACE_LOCK_NAME, { mode: 'shared' }, write)
      : write();
  } catch (error) {
    reportStorageResult(key, error);
    throw error;
  }
}

export function writeWorkspaceStorage(ownerId: string | null, key: string, value: string) { return mutateWorkspaceStorage(ownerId, key, value); }
export function removeWorkspaceStorage(ownerId: string | null, key: string) { return mutateWorkspaceStorage(ownerId, key, null); }
