import { apiFetch } from './apiClient';
import type { AppEvent } from './engagement';

const CLIENT_ID_KEY = 'astroRailAnalyticsClientId';
const SENT_EVENT_IDS_KEY = 'astroRailAnalyticsSentEventIds';
const MAX_SENT_IDS = 320;

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function randomToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getAnalyticsClientId() {
  if (!canUseStorage()) return 'server';
  const saved = window.localStorage.getItem(CLIENT_ID_KEY);
  if (saved) return saved;
  const next = `client_${randomToken()}`;
  window.localStorage.setItem(CLIENT_ID_KEY, next);
  return next;
}

function getSentEventIds() {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SENT_EVENT_IDS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function rememberSentEventId(id: string) {
  if (!canUseStorage()) return;
  const next = [id, ...getSentEventIds().filter((item) => item !== id)].slice(0, MAX_SENT_IDS);
  window.localStorage.setItem(SENT_EVENT_IDS_KEY, JSON.stringify(next));
}

function hasSentEvent(id: string) {
  return getSentEventIds().includes(id);
}

export async function trackAnalyticsEvent(event: AppEvent) {
  if (!event?.id || hasSentEvent(event.id)) return;
  rememberSentEventId(event.id);

  try {
    await apiFetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: event.id,
        event: event.type,
        timestamp: event.timestamp,
        clientId: getAnalyticsClientId(),
        meta: event.meta || {},
      }),
    });
  } catch (error) {
    console.warn('Analytics event failed:', error);
  }
}
