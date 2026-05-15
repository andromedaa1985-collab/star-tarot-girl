const BACKUP_FORMAT = 'astro-rail-local-archive';
const BACKUP_VERSION = 1;
const ROLLBACK_KEY = 'starrail:lastImportRollback';

export const APP_STORAGE_KEYS = [
  'bondExp',
  'bondLevel',
  'energy',
  'fragments',
  'messages',
  'cardImage',
  'communityPosts',
  'settings',
  'userName',
  'userAvatar',
  'companionOutfit',
  'theme',
  'baziResult',
  'baziFormData',
  'baziMessages',
  'profiles',
  'activeProfileId',
  'simulatorState',
  'tarotReadings',
  'simulationHistory',
  'diaryEntries',
  'reviewHistory',
  'guardianMessages',
  'dailyLetter',
  'dailyLetterDate',
  'dailyRewardDate',
  'checkInStreak',
  'lastCheckInDate',
  'membership',
  'engagement',
  'appEvents',
  'relationshipTaskDone',
  'relationshipWeekStartedAt',
  'grantedPaymentOrders',
  'trustedTimeOffsetMs',
  'draft:home:input',
  'draft:bazi:chat',
  'draft:diary:content',
  'draft:diary:mood',
  'draft:diary:tags',
  'draft:guardian:input',
] as const;

const RAW_STRING_KEYS = new Set<string>(['theme', 'trustedTimeOffsetMs']);
const MERGE_ARRAY_KEYS = new Set<string>([
  'fragments',
  'messages',
  'communityPosts',
  'baziMessages',
  'profiles',
  'tarotReadings',
  'simulationHistory',
  'diaryEntries',
  'reviewHistory',
  'guardianMessages',
  'appEvents',
  'grantedPaymentOrders',
]);

type StorageValue = unknown;

export interface AppBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  appName: 'AstroRail';
  data: Record<string, StorageValue>;
}

export interface BackupSummary {
  profiles: number;
  tarotReadings: number;
  diaryEntries: number;
  simulations: number;
  guardianMessages: number;
  lastBackupAt: string | null;
}

export interface ImportResult {
  importedKeys: number;
  mergedKeys: number;
  skippedKeys: string[];
}

function parseStoredValue(key: string, raw: string): StorageValue {
  if (RAW_STRING_KEYS.has(key)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function readValue(key: string): StorageValue | undefined {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;
  return parseStoredValue(key, raw);
}

function writeValue(key: string, value: StorageValue) {
  if (value === undefined) return;
  if (RAW_STRING_KEYS.has(key) && typeof value === 'string') {
    localStorage.setItem(key, value);
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

function asArray(value: StorageValue): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function itemKey(item: unknown, index: number) {
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    const stableId = record.id || record.orderId || record.timestamp || record.date;
    if (stableId !== undefined && stableId !== null) return String(stableId);
    return `object:${JSON.stringify(item)}:${index}`;
  }
  return `primitive:${JSON.stringify(item)}`;
}

function itemTime(item: unknown) {
  if (!item || typeof item !== 'object') return 0;
  const record = item as Record<string, unknown>;
  const candidate = record.updatedAt || record.timestamp || record.createdAt || record.date;
  if (typeof candidate === 'number') return candidate;
  if (typeof candidate === 'string') {
    const parsed = Date.parse(candidate);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function mergeArrays(current: unknown[], incoming: unknown[]) {
  const merged = new Map<string, unknown>();

  current.forEach((item, index) => {
    merged.set(itemKey(item, index), item);
  });

  incoming.forEach((item, index) => {
    const key = itemKey(item, index);
    const existing = merged.get(key);
    if (!existing || itemTime(item) >= itemTime(existing)) {
      merged.set(key, item);
    }
  });

  return Array.from(merged.values());
}

function getCount(key: string) {
  const value = readValue(key);
  return Array.isArray(value) ? value.length : 0;
}

export function createAppBackup(): AppBackup {
  const data: Record<string, StorageValue> = {};

  APP_STORAGE_KEYS.forEach((key) => {
    const value = readValue(key);
    if (value !== undefined) data[key] = value;
  });

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appName: 'AstroRail',
    data,
  };
}

export function createBackupFileName(date = new Date()) {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `astrorail-backup-${stamp}.json`;
}

export function downloadAppBackup() {
  const backup = createAppBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = createBackupFileName();
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  localStorage.setItem('lastManualBackupAt', backup.createdAt);
  return backup;
}

export async function parseBackupFile(file: File): Promise<AppBackup> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<AppBackup>;

  if (parsed.format !== BACKUP_FORMAT || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('这不是有效的星轨存档文件。');
  }

  return parsed as AppBackup;
}

export function importAppBackup(backup: AppBackup): ImportResult {
  const rollback = createAppBackup();
  try {
    sessionStorage.setItem(ROLLBACK_KEY, JSON.stringify(rollback));
  } catch {
    // Rollback is a convenience, not a hard dependency for restoring data.
  }

  const skippedKeys: string[] = [];
  let importedKeys = 0;
  let mergedKeys = 0;

  APP_STORAGE_KEYS.forEach((key) => {
    if (!(key in backup.data)) return;

    const incoming = backup.data[key];
    if (incoming === undefined) {
      skippedKeys.push(key);
      return;
    }

    const current = readValue(key);
    const currentArray = asArray(current);
    const incomingArray = asArray(incoming);

    if (MERGE_ARRAY_KEYS.has(key) && currentArray && incomingArray) {
      writeValue(key, mergeArrays(currentArray, incomingArray));
      mergedKeys += 1;
    } else {
      writeValue(key, incoming);
    }

    importedKeys += 1;
  });

  localStorage.setItem('lastManualBackupAt', backup.createdAt);

  return { importedKeys, mergedKeys, skippedKeys };
}

export function getBackupSummary(): BackupSummary {
  return {
    profiles: getCount('profiles'),
    tarotReadings: getCount('tarotReadings'),
    diaryEntries: getCount('diaryEntries'),
    simulations: getCount('simulationHistory'),
    guardianMessages: getCount('guardianMessages'),
    lastBackupAt: localStorage.getItem('lastManualBackupAt'),
  };
}

export function clearAppStorage() {
  APP_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem('lastManualBackupAt');
}
