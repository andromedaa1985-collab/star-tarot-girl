export const CLOUD_SYNC_STATUS_EVENT = 'astroRailCloudSyncStatus';
let notice: { ownerId: string; message: string } | null = null;
export function getCloudSyncNotice() { return notice; }
export function reportCloudSyncStatus(ownerId: string, message: string | null) {
  notice = message ? { ownerId, message } : null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CLOUD_SYNC_STATUS_EVENT));
}
