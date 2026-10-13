import { useEffect, useState } from 'react';
import { getWorkspaceStorageError, WORKSPACE_STORAGE_STATUS_EVENT } from '../lib/workspacePersistence';

export function WorkspaceStorageNotice() {
  const [message, setMessage] = useState(getWorkspaceStorageError);
  useEffect(() => {
    const update = () => setMessage(getWorkspaceStorageError());
    window.addEventListener(WORKSPACE_STORAGE_STATUS_EVENT, update);
    return () => window.removeEventListener(WORKSPACE_STORAGE_STATUS_EVENT, update);
  }, []);
  if (!message) return null;
  return <div role="alert" className="fixed inset-x-4 top-[calc(var(--app-safe-top)+12px)] z-[90] mx-auto flex max-w-xl items-start gap-3 rounded-xl border border-red-500/30 bg-apple-surface p-4 text-sm leading-6 text-apple-text shadow-lg">
    <p className="min-w-0 flex-1">{message}</p>
    <button type="button" onClick={() => setMessage(null)} className="min-h-11 shrink-0 px-2 font-medium text-apple-gold">知道了</button>
  </div>;
}
