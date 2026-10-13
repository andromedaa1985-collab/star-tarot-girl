import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isAccountTransitioning, ownsAccountTransition, watchAccountSessionChanges } from '../lib/accountClient';

export function AccountSessionChangeGuard({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(() => isAccountTransitioning());
  const [ready, setReady] = useState(() => !isAccountTransitioning());
  const [recoveryError, setRecoveryError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => watchAccountSessionChanges(() => {
    setReady(false);
    window.location.reload();
  }, (isBlocked) => {
    setBlocked(isBlocked);
    if (!isBlocked) setReady(true);
    // An external transition may be replacing shared records right now. A new
    // or existing peer must not hydrate them before identity is committed.
    else if (!ownsAccountTransition()) setReady(false);
  }, setRecoveryError), []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (blocked && dialog && !dialog.open) dialog.showModal();
    else if (!blocked && dialog?.open) dialog.close();
  }, [blocked]);

  return <>
    {ready && children}
    <dialog ref={dialogRef} aria-label="正在安全切换账户" onCancel={(event) => event.preventDefault()} className="m-auto w-[calc(100%_-_32px)] max-w-sm rounded-2xl border border-apple-border bg-apple-surface p-6 text-apple-text backdrop:bg-black/45">
      <div role="status" aria-live="polite" aria-busy="true">
        <p className="text-lg font-semibold">正在安全切换账户</p>
        <p className="mt-3 text-[15px] leading-7 text-apple-text-muted">{recoveryError || '正在载入账户的记录，请稍候。若切换中断，星轨会恢复原来的存档。'}</p>
      </div>
    </dialog>
  </>;
}
