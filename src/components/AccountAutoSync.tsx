import { reportCloudSyncStatus } from '../lib/cloudSyncStatus';
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
  try {
    await started.uploading;
    if (isCurrentAccountSession(session)) reportCloudSyncStatus(session.user.id, null);
  } catch (error: any) {
    if (isCurrentAccountSession(session)) reportCloudSyncStatus(session.user.id,
      error?.code === 'ARCHIVE_CONFLICT' ? '云端有其他设备的新记录。本机内容已保留，请到设置下载并合并后再同步。' : '本机内容已保存，云端同步暂未完成。可到设置查看并重试。');
    throw error;
  }
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
