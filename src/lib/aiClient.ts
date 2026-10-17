import { apiFetch } from './apiClient';
import { authHeaders, getStoredAccountSession, isCurrentAccountSession } from './accountClient';

export const ENTITLEMENT_UPDATED_EVENT = 'astroRailEntitlementUpdated';

export async function aiFetch(type: 'bazi' | 'guardian' | 'simulator' | 'diary_review', init: RequestInit) {
  const session = getStoredAccountSession();
  const payload = JSON.parse(String(init.body || '{}'));
  const response = await apiFetch('/api/deepseek/chat', {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init.headers)), ...authHeaders(session?.token) },
    body: JSON.stringify({ ...payload, entitlement: { type } }),
  });
  if (response.ok && session) {
    const data = await response.clone().json();
    if (data.entitlement && isCurrentAccountSession(session) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ENTITLEMENT_UPDATED_EVENT, { detail: { userId: session.user.id, snapshot: data.entitlement } }));
    }
  }
  return response;
}
