import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStoredAccountSession } from '../lib/accountClient';
import { CLOUD_SYNC_STATUS_EVENT, getCloudSyncNotice } from '../lib/cloudSyncStatus';
export function CloudSyncNotice() {
  const [notice, setNotice] = useState(getCloudSyncNotice);
  useEffect(() => {
    const update = () => setNotice(getCloudSyncNotice());
    window.addEventListener(CLOUD_SYNC_STATUS_EVENT, update);
    return () => window.removeEventListener(CLOUD_SYNC_STATUS_EVENT, update);
  }, []);
  if (!notice || notice.ownerId !== getStoredAccountSession()?.user.id) return null;
  return <div role="status" className="rail-panel m-4 flex flex-wrap items-center gap-3 p-4 text-sm">
    <p className="min-w-0 flex-1">{notice.message}</p>
    <Link to="/app/settings" className="rail-button-secondary">查看存档</Link>
  </div>;
}
