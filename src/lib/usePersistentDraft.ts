import { useEffect, useRef, useState } from 'react';
import { getStoredAccountSession } from './accountClient';
import { removeWorkspaceStorage, writeWorkspaceStorage } from './workspacePersistence';

export function usePersistentDraft<T>(key: string, initialValue: T) {
  const owner = useRef(getStoredAccountSession()?.user.id || null);
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      void writeWorkspaceStorage(owner.current, key, JSON.stringify(value)).catch(() => undefined);
    } catch {
      // Draft saving is a convenience. If storage is unavailable, keep the UI usable.
    }
  }, [key, value]);

  const clearDraft = (nextValue = initialValue) => {
    try {
      void removeWorkspaceStorage(owner.current, key).catch(() => undefined);
    } catch {
      // Ignore storage errors.
    }
    setValue(nextValue);
  };

  return [value, setValue, clearDraft] as const;
}
