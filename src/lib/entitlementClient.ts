import { apiFetch } from './apiClient';
import { authHeaders, getStoredAccountSession } from './accountClient';
import { normalizeMembership, type MembershipState } from './membership';
import type { Dispatch, SetStateAction } from 'react';

export interface EntitlementSnapshot {
  membership: MembershipState;
  energy: number;
  updatedAt: string;
  message?: string;
}

export interface ApplyOrderResult {
  status: 'paid' | 'waiting';
  order?: { id: string; planId: string; status: string };
  entitlement?: EntitlementSnapshot;
  message?: string;
}

function requireAccountToken() {
  const session = getStoredAccountSession();
  if (!session?.token) {
    throw new Error('请先登录星轨账户，再领取会员、兑换码或付费权益。');
  }
  return session.token;
}

async function readJsonResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || '权益校验失败，请稍后再试。');
  }
  return data;
}

function normalizeSnapshot(data: any): EntitlementSnapshot {
  return {
    membership: normalizeMembership(data?.membership),
    energy: Math.max(0, Math.floor(Number(data?.energy) || 0)),
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    message: typeof data?.message === 'string' ? data.message : undefined,
  };
}

export async function fetchCurrentEntitlements() {
  const token = requireAccountToken();
  const response = await apiFetch('/api/entitlements/me', {
    headers: authHeaders(token),
    cache: 'no-store',
  });
  return normalizeSnapshot(await readJsonResponse(response));
}

export async function startPlusTrialOnServer() {
  const token = requireAccountToken();
  const response = await apiFetch('/api/entitlements/trial', {
    method: 'POST',
    headers: authHeaders(token),
  });
  return normalizeSnapshot(await readJsonResponse(response));
}

export async function redeemEntitlementCode(code: string) {
  const token = requireAccountToken();
  const response = await apiFetch('/api/entitlements/redeem', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ code }),
  });
  return normalizeSnapshot(await readJsonResponse(response));
}

export async function applyPaidOrderEntitlement(orderId: string): Promise<ApplyOrderResult> {
  const token = requireAccountToken();
  const response = await apiFetch('/api/entitlements/apply-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ orderId }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 202) {
    return { status: 'waiting', order: data.order };
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || '订单权益校验失败，请稍后再试。');
  }
  return {
    status: 'paid',
    order: data.order,
    entitlement: normalizeSnapshot(data),
    message: typeof data?.message === 'string' ? data.message : undefined,
  };
}

export function applyEntitlementSnapshot(
  snapshot: EntitlementSnapshot,
  setters: {
    setMembership: Dispatch<SetStateAction<MembershipState>>;
    setEnergy: Dispatch<SetStateAction<number>>;
  },
) {
  setters.setMembership(snapshot.membership);
  setters.setEnergy(snapshot.energy);
}
