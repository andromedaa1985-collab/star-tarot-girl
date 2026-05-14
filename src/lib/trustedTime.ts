import { useEffect, useSyncExternalStore } from 'react';

export const APP_TIME_ZONE = 'Asia/Shanghai';

type TimeSource = 'local' | 'server';

interface TimeSyncSnapshot {
  source: TimeSource;
  offsetMs: number;
  syncedAt: string | null;
  serverNow: string | null;
  timezone: string;
  error: string | null;
}

const STORAGE_KEY = 'trustedTimeOffsetMs';
const listeners = new Set<() => void>();
let syncPromise: Promise<TimeSyncSnapshot> | null = null;

function readStoredOffset() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function persistOffset(offsetMs: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(offsetMs));
  } catch {
    // Time sync still works for the current session even when storage is unavailable.
  }
}

let snapshot: TimeSyncSnapshot = {
  source: 'local',
  offsetMs: readStoredOffset(),
  syncedAt: null,
  serverNow: null,
  timezone: APP_TIME_ZONE,
  error: null,
};

function emit() {
  listeners.forEach((listener) => listener());
}

function updateSnapshot(next: Partial<TimeSyncSnapshot>) {
  snapshot = { ...snapshot, ...next };
  persistOffset(snapshot.offsetMs);
  emit();
}

export function subscribeTrustedTime(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTimeSyncSnapshot() {
  return snapshot;
}

export function getTrustedTimestamp() {
  return Date.now() + snapshot.offsetMs;
}

export function getTrustedNow() {
  return new Date(getTrustedTimestamp());
}

export function getAppDateKey(date = getTrustedNow()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function getAppWeekday(date = getTrustedNow()) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: APP_TIME_ZONE,
    weekday: 'short',
  }).format(date);
}

export function formatAppDateTime(date = getTrustedNow()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export async function syncTrustedTime() {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const startedAt = Date.now();
    try {
      const response = await fetch('/api/time', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-store' },
      });
      const finishedAt = Date.now();
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || '时间同步失败');

      const serverTimestamp = Number(data.timestampMs ?? Date.parse(data.now));
      if (!Number.isFinite(serverTimestamp)) throw new Error('时间同步返回异常');

      const midpoint = startedAt + (finishedAt - startedAt) / 2;
      const offsetMs = Math.round(serverTimestamp - midpoint);
      updateSnapshot({
        source: 'server',
        offsetMs,
        syncedAt: new Date(finishedAt).toISOString(),
        serverNow: data.now || new Date(serverTimestamp).toISOString(),
        timezone: data.timezone || APP_TIME_ZONE,
        error: null,
      });
    } catch (error: any) {
      updateSnapshot({
        source: snapshot.offsetMs ? 'server' : 'local',
        error: error?.message || '时间同步失败',
      });
    } finally {
      syncPromise = null;
    }
    return snapshot;
  })();

  return syncPromise;
}

export function useTrustedTime() {
  const state = useSyncExternalStore(subscribeTrustedTime, getTimeSyncSnapshot, getTimeSyncSnapshot);

  useEffect(() => {
    syncTrustedTime();
  }, []);

  return state;
}
