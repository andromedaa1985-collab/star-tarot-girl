import { useEffect, useState } from 'react';

export function usePersistentDraft<T>(key: string, initialValue: T) {
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
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Draft saving is a convenience. If storage is unavailable, keep the UI usable.
    }
  }, [key, value]);

  const clearDraft = (nextValue = initialValue) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors.
    }
    setValue(nextValue);
  };

  return [value, setValue, clearDraft] as const;
}
