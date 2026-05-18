import React from 'react';
import { createAppBackup } from '../lib/appBackup';
import { getStoredAccountSession, uploadCloudArchive } from '../lib/accountClient';
import { saveAccountWorkspace } from '../lib/accountWorkspace';

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

export function AccountAutoSync() {
  const syncState = React.useRef({ running: false });

  React.useEffect(() => {
    let disposed = false;

    const sync = async () => {
      if (syncState.current.running || disposed) return;
      const session = getStoredAccountSession();
      if (!session) return;

      const { backup, signature } = getArchiveSignature();
      const key = signatureKey(session.user.id);
      if (localStorage.getItem(key) === signature) return;

      syncState.current.running = true;
      try {
        saveAccountWorkspace(session.user.id);
        await uploadCloudArchive(session, backup);
        localStorage.setItem(key, signature);
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
