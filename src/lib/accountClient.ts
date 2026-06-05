import type { AppBackup } from './appBackup';
import { apiFetch } from './apiClient';

const SESSION_STORAGE_KEY = 'astroRailAccountSession';

export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  archiveUpdatedAt: string | null;
  archiveRecordCount: number;
}

export interface AccountSession {
  token: string;
  user: AccountUser;
}

async function readJsonResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toPublicErrorMessage(data?.error?.message));
  }
  return data;
}

function toPublicErrorMessage(message: unknown) {
  if (typeof message !== 'string' || !message.trim()) return '请求失败，请稍后再试。';
  if (
    message.includes('AUTH_SESSION_SECRET') ||
    message.includes('Netlify') ||
    message.includes('Blobs') ||
    message.includes('Vercel') ||
    message.includes('Upstash') ||
    message.includes('UPSTASH_REDIS_REST')
  ) {
    return '账户服务暂时不可用，请稍后再试。';
  }
  return message;
}

export function authHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getStoredAccountSession(): AccountSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeAccountSession(session: AccountSession) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearAccountSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export async function registerAccount(input: { email: string; password: string; displayName: string }) {
  const response = await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const session = await readJsonResponse(response) as AccountSession;
  storeAccountSession(session);
  return session;
}

export async function loginAccount(input: { email: string; password: string }) {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const session = await readJsonResponse(response) as AccountSession;
  storeAccountSession(session);
  return session;
}

export async function refreshAccountSession(session: AccountSession) {
  const response = await apiFetch('/api/auth/me', {
    headers: authHeaders(session.token),
    cache: 'no-store',
  });
  const data = await readJsonResponse(response) as { user: AccountUser };
  const nextSession = { ...session, user: data.user };
  storeAccountSession(nextSession);
  return nextSession;
}

export async function uploadCloudArchive(session: AccountSession, archive: AppBackup) {
  const response = await apiFetch('/api/auth/archive', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(session.token),
    },
    body: JSON.stringify({ archive }),
  });
  const data = await readJsonResponse(response) as Pick<AccountUser, 'archiveUpdatedAt' | 'archiveRecordCount'>;
  const nextSession = {
    ...session,
    user: {
      ...session.user,
      archiveUpdatedAt: data.archiveUpdatedAt,
      archiveRecordCount: data.archiveRecordCount,
    },
  };
  storeAccountSession(nextSession);
  return nextSession;
}

export async function downloadCloudArchive(session: AccountSession) {
  const response = await apiFetch('/api/auth/archive', {
    headers: authHeaders(session.token),
    cache: 'no-store',
  });
  return await readJsonResponse(response) as {
    archive: AppBackup;
    archiveUpdatedAt: string;
    archiveRecordCount: number;
  };
}
