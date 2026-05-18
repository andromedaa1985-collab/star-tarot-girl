import {
  APP_STORAGE_KEYS,
  clearAppStorage,
  createAppBackup,
  importAppBackup,
  type AppBackup,
} from './appBackup';
import {
  downloadCloudArchive,
  storeAccountSession,
  type AccountSession,
} from './accountClient';

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

function readWorkspace(ownerId: string): AppBackup | null {
  try {
    const raw = localStorage.getItem(workspaceKey(ownerId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function restoreWorkspace(backup: AppBackup) {
  clearAppStorage({ preserveEntitlements: false });
  importAppBackup(backup);
}

export function saveAccountWorkspace(ownerId: string | null) {
  if (!hasCurrentAppData()) return null;
  const backup = createAppBackup();
  localStorage.setItem(workspaceKey(ownerId), JSON.stringify(backup));
  return backup;
}

export function clearActiveLocalWorkspace() {
  clearAppStorage({ preserveEntitlements: false });
}

export async function activateAccountWorkspace(
  nextSession: AccountSession,
  previousSession: AccountSession | null,
): Promise<AccountActivationResult> {
  const previousUserId = previousSession?.user.id || null;
  const nextUserId = nextSession.user.id;

  if (previousUserId === nextUserId) return { source: 'same' };

  const hadLocalData = hasCurrentAppData();
  if (previousUserId || hadLocalData) {
    saveAccountWorkspace(previousUserId);
  }

  const localWorkspace = readWorkspace(nextUserId);
  if (localWorkspace) {
    restoreWorkspace(localWorkspace);
    return { source: 'local' };
  }

  if (nextSession.user.archiveUpdatedAt) {
    const cloud = await downloadCloudArchive(nextSession);
    restoreWorkspace(cloud.archive);
    const refreshedSession = {
      ...nextSession,
      user: {
        ...nextSession.user,
        archiveUpdatedAt: cloud.archiveUpdatedAt,
        archiveRecordCount: cloud.archiveRecordCount,
      },
    };
    storeAccountSession(refreshedSession);
    saveAccountWorkspace(nextUserId);
    return { source: 'cloud', recordCount: cloud.archiveRecordCount };
  }

  if (!previousUserId && hadLocalData) {
    saveAccountWorkspace(nextUserId);
    return { source: 'claimed-local' };
  }

  clearAppStorage({ preserveEntitlements: false });
  return { source: 'fresh' };
}
