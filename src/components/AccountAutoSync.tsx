import React from 'react';
import { createAppBackup } from '../lib/appBackup';
import { getStoredAccountSession, isAccountTransitioning, isCurrentAccountSession, uploadCloudArchive } from '../lib/accountClient';
import { saveAccountWorkspace } from '../lib/accountWorkspace';
import { tryWithAccountWorkspaceLock } from '../lib/accountTransition';

const SYNC_INTERVAL_MS = 60_000;
const SIGNATURE_PREFIX = 'astroRailLastAutoSyncSignature:';

function signatureKey(userId: string) {
  return `${SIGNATURE_PREFIX}${userId}`;
}

function getArchiveSignature() {
  const backup = createAppBackup();
  return {
    backup,
    signature: JSON.stringify(backup.data),
  };
}

export async function autoSyncAccountArchive() {
  const started = await tryWithAccountWorkspaceLock('shared', () => {
    if (isAccountTransitioning()) return;
    const session = getStoredAccountSession();
    if (!session) return;
    const { backup, signature } = getArchiveSignature();
    const key = signatureKey(session.user.id);
    if (localStorage.getItem(key) === signature) return;
    saveAccountWorkspace(session.user.id);
    return { session, signature, key, uploading: uploadCloudArchive(session, backup) };
  });
  if (!started) return;
  const { session, signature, key } = started;
  await started.uploading;
  // An upload started before switching may finish afterwards. Its payload and
  // token still belong to the old owner; it must not mark the new workspace synced.
  await tryWithAccountWorkspaceLock('shared', () => {
    if (!isAccountTransitioning() && isCurrentAccountSession(session)) localStorage.setItem(key, signature);
  });
}

export function AccountAutoSync() {
  const syncState = React.useRef({ running: false });

  React.useEffect(() => {
    let disposed = false;

    const sync = async () => {
      if (syncState.current.running || disposed || isAccountTransitioning()) return;

      syncState.current.running = true;
      try {
        await autoSyncAccountArchive();
      } catch {
        // Background sync should never interrupt the reading experience.
      } finally {
        syncState.current.running = false;
      }
    };

    const interval = window.setInterval(sync, SYNC_INTERVAL_MS);
    const initialTimer = window.setTimeout(sync, 7000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void sync();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.clearTimeout(initialTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}
