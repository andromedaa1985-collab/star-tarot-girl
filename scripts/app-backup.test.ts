import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { importAppBackup, type AppBackup } from '../src/lib/appBackup';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
});

afterEach(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  if (originalSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
  else Reflect.deleteProperty(globalThis, 'sessionStorage');
});

function archive(data: AppBackup['data']): AppBackup {
  return {
    format: 'astro-rail-local-archive',
    version: 1,
    createdAt: '2026-10-12T10:00:00.000Z',
    appName: 'AstroRail',
    data,
  };
}

function storedRecords(key: string) {
  return JSON.parse(localStorage.getItem(key) || '[]') as Array<Record<string, unknown>>;
}

test('restoring a newer tarot reading makes it the current reading without dropping local records', () => {
  localStorage.setItem('tarotReadings', JSON.stringify([
    { id: 'local', date: '2026-10-11T10:00:00.000Z', cards: '太阳（正位）' },
  ]));
  importAppBackup(archive({ tarotReadings: [
    { id: 'cloud', date: '2026-10-12T10:00:00.000Z', cards: '月亮（逆位）' },
  ] }));
  const readings = storedRecords('tarotReadings');
  assert.deepEqual(readings.map((record) => record.id), ['cloud', 'local']);
  assert.equal(readings[0].cards, '月亮（逆位）');
});

test('restoring overlapping timelines preserves newest-first order and updates duplicate records', () => {
  for (const key of ['simulationHistory', 'diaryEntries', 'reviewHistory', 'appEvents']) {
    localStorage.setItem(key, JSON.stringify([
      { id: 'existing', date: '2026-10-11', timestamp: Date.parse('2026-10-11T10:00:00Z'), content: 'old' },
    ]));
    importAppBackup(archive({ [key]: [
      { id: 'new', date: '2026-10-12', timestamp: Date.parse('2026-10-12T10:00:00Z') },
      { id: 'existing', date: '2026-10-11', timestamp: Date.parse('2026-10-11T10:00:00Z'), content: 'updated' },
      { id: 'older', date: '2026-10-10', timestamp: Date.parse('2026-10-10T10:00:00Z') },
    ] }));
    const records = storedRecords(key);
    assert.deepEqual(records.map((record) => record.id), ['new', 'existing', 'older'], key);
    assert.equal(records[1].content, 'updated', key);
  }
});

test('same-day reviews use their generation time to place the latest review first', () => {
  localStorage.setItem('reviewHistory', JSON.stringify([
    { id: 'morning', date: '2026-10-12', generatedAt: '2026-10-12T02:00:00Z' },
  ]));
  importAppBackup(archive({ reviewHistory: [
    { id: 'evening', date: '2026-10-12', generatedAt: '2026-10-12T10:00:00Z' },
  ] }));
  assert.deepEqual(storedRecords('reviewHistory').map((record) => record.id), ['evening', 'morning']);
});

test('restoring conversation fragments interleaves messages in chronological order', () => {
  for (const key of ['messages', 'baziMessages', 'guardianMessages']) {
    localStorage.setItem(key, JSON.stringify([
      { id: 'user-first', role: 'user', timestamp: 1000 },
      { id: 'user-next', role: 'user', timestamp: 3000 },
    ]));
    importAppBackup(archive({ [key]: [
      { id: 'answer-first', role: 'ai', timestamp: 2000 },
      { id: 'answer-next', role: 'ai', timestamp: 4000 },
    ] }));
    assert.deepEqual(storedRecords(key).map((record) => record.id), [
      'user-first', 'answer-first', 'user-next', 'answer-next',
    ], key);
  }
});

test('profiles and collection items keep their established order after merging', () => {
  for (const key of ['profiles', 'fragments', 'communityPosts']) {
    localStorage.setItem(key, JSON.stringify([{ id: 'first', timestamp: 1000 }]));
    importAppBackup(archive({ [key]: [{ id: 'second', timestamp: 2000 }] }));
    assert.deepEqual(storedRecords(key).map((record) => record.id), ['first', 'second'], key);
  }
});
