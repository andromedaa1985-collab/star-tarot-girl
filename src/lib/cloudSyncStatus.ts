export const CLOUD_SYNC_STATUS_EVENT = 'astroRailCloudSyncStatus';
let notice: { ownerId: string; message: string } | null = null;
const dismissedMessages = new Map<string, string | null>();
const dismissalKey = (ownerId: string) => `astroRailCloudSyncDismissed:${ownerId}`;

function getDismissedMessage(ownerId: string) {
  if (dismissedMessages.has(ownerId)) return dismissedMessages.get(ownerId);
  try {
    const message = localStorage.getItem(dismissalKey(ownerId));
    dismissedMessages.set(ownerId, message);
    return message;
  } catch {
    return null;
  }
}

function emit() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CLOUD_SYNC_STATUS_EVENT));
}

export function getCloudSyncNotice() {
  return notice && getDismissedMessage(notice.ownerId) !== notice.message ? notice : null;
}

/** Hiding a reminder never changes the archive or the sync operation. */
export function dismissCloudSyncNotice(ownerId: string, message: string) {
  if (!notice || notice.ownerId !== ownerId || notice.message !== message) return;
  dismissedMessages.set(ownerId, message);
  try { localStorage.setItem(dismissalKey(ownerId), message); } catch { /* Keep the choice for this session. */ }
  emit();
}

export function reportCloudSyncStatus(ownerId: string, message: string | null) {
  if (message) {
    notice = { ownerId, message };
  } else {
    if (notice?.ownerId === ownerId) notice = null;
    dismissedMessages.set(ownerId, null);
    try { localStorage.removeItem(dismissalKey(ownerId)); } catch { /* The session state is already cleared. */ }
  }
  emit();
}
