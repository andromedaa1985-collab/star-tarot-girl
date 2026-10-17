import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { CLOUD_SYNC_STATUS_EVENT, dismissCloudSyncNotice, getCloudSyncNotice, reportCloudSyncStatus } from '../src/lib/cloudSyncStatus';

const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
const events = new EventTarget();
before(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
});
after(() => {
  if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage); else delete (globalThis as any).localStorage;
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow); else delete (globalThis as any).window;
});

test('closing a reminder hides repeated auto-sync reports and notifies the UI', () => {
  let updates = 0;
  const listener = () => { updates += 1; };
  events.addEventListener(CLOUD_SYNC_STATUS_EVENT, listener);
  reportCloudSyncStatus('owner-repeat', '云端有新记录');
  assert.equal(getCloudSyncNotice()?.message, '云端有新记录');
  dismissCloudSyncNotice('owner-repeat', '云端有新记录');
  assert.equal(getCloudSyncNotice(), null);
  reportCloudSyncStatus('owner-repeat', '云端有新记录');
  assert.equal(getCloudSyncNotice(), null);
  assert.equal(updates, 3);
  events.removeEventListener(CLOUD_SYNC_STATUS_EVENT, listener);
});

test('dismissal survives a fresh module instance without modifying any archive data', async () => {
  values.set('tarotReadings', 'saved readings');
  values.set('archiveBaseRevision', 'revision-5');
  reportCloudSyncStatus('owner-reload', '需要下载并合并');
  dismissCloudSyncNotice('owner-reload', '需要下载并合并');
  const reloaded = await import(new URL('../src/lib/cloudSyncStatus.ts?notice-reload-test', import.meta.url).href);
  reloaded.reportCloudSyncStatus('owner-reload', '需要下载并合并');
  assert.equal(reloaded.getCloudSyncNotice(), null);
  assert.equal(values.get('tarotReadings'), 'saved readings');
  assert.equal(values.get('archiveBaseRevision'), 'revision-5');
});

test('a different warning or account remains visible and a stale close cannot hide it', () => {
  reportCloudSyncStatus('owner-scope', '云端有新记录');
  dismissCloudSyncNotice('owner-scope', '云端有新记录');
  reportCloudSyncStatus('owner-scope', '网络连接失败');
  dismissCloudSyncNotice('owner-scope', '云端有新记录');
  assert.equal(getCloudSyncNotice()?.message, '网络连接失败');
  reportCloudSyncStatus('other-owner', '云端有新记录');
  dismissCloudSyncNotice('owner-scope', '云端有新记录');
  assert.equal(getCloudSyncNotice()?.ownerId, 'other-owner');
  reportCloudSyncStatus('owner-scope', null);
  assert.equal(getCloudSyncNotice()?.ownerId, 'other-owner');
});

test('a successful sync clears the previous dismissal for a future incident', () => {
  reportCloudSyncStatus('owner-success', '云端有新记录');
  dismissCloudSyncNotice('owner-success', '云端有新记录');
  reportCloudSyncStatus('owner-success', null);
  assert.equal(getCloudSyncNotice(), null);
  reportCloudSyncStatus('owner-success', '云端有新记录');
  assert.equal(getCloudSyncNotice()?.message, '云端有新记录');
});

test('closing still works during the session if persistent storage is unavailable', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } });
  try {
    reportCloudSyncStatus('owner-private', '云端有新记录');
    dismissCloudSyncNotice('owner-private', '云端有新记录');
    reportCloudSyncStatus('owner-private', '云端有新记录');
    assert.equal(getCloudSyncNotice(), null);
    reportCloudSyncStatus('owner-private', null);
    reportCloudSyncStatus('owner-private', '云端有新记录');
    assert.equal(getCloudSyncNotice()?.message, '云端有新记录');
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  }
});
