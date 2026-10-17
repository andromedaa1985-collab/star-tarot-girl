import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { getStoredAccountSession } from '../lib/accountClient';
import { CLOUD_SYNC_STATUS_EVENT, dismissCloudSyncNotice, getCloudSyncNotice } from '../lib/cloudSyncStatus';
export function CloudSyncNotice() {
  const [notice, setNotice] = useState(getCloudSyncNotice);
  useEffect(() => {
    const update = () => setNotice(getCloudSyncNotice());
    window.addEventListener(CLOUD_SYNC_STATUS_EVENT, update);
    return () => window.removeEventListener(CLOUD_SYNC_STATUS_EVENT, update);
  }, []);
  if (!notice || notice.ownerId !== getStoredAccountSession()?.user.id) return null;
  return <div role="status" className="rail-panel m-4 flex items-start gap-2 p-3 text-sm sm:items-center sm:gap-3 sm:p-4">
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1">{notice.message}</p>
      <Link to="/app/settings" className="rail-button-secondary">查看存档</Link>
    </div>
    <button type="button" onClick={() => dismissCloudSyncNotice(notice.ownerId, notice.message)} aria-label="关闭云端存档提示" title="关闭提示" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-apple-text-muted hover:bg-apple-surface-hover">
      <X size={18} aria-hidden="true" />
    </button>
  </div>;
}
