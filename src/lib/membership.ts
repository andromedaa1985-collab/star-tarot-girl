export type MembershipPlan = 'free' | 'plus';
export type MembershipSource = 'trial' | 'payment' | 'manual';

export interface MembershipState {
  plan: MembershipPlan;
  expiresAt: string | null;
  trialUsed: boolean;
  activatedAt: string | null;
  source: MembershipSource | null;
}

export const FREE_READING_LIMIT = 30;
export const PLUS_READING_LIMIT = 200;
export const PLUS_MONTHLY_DAYS = 31;
export const PLUS_TRIAL_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const defaultMembership: MembershipState = {
  plan: 'free',
  expiresAt: null,
  trialUsed: false,
  activatedAt: null,
  source: null,
};

export function normalizeMembership(value: unknown): MembershipState {
  if (!value || typeof value !== 'object') return defaultMembership;

  const input = value as Partial<MembershipState>;
  return {
    plan: input.plan === 'plus' ? 'plus' : 'free',
    expiresAt: typeof input.expiresAt === 'string' ? input.expiresAt : null,
    trialUsed: Boolean(input.trialUsed),
    activatedAt: typeof input.activatedAt === 'string' ? input.activatedAt : null,
    source: input.source === 'trial' || input.source === 'payment' || input.source === 'manual' ? input.source : null,
  };
}

export function isPlusActive(membership: MembershipState, now = new Date()) {
  if (membership.plan !== 'plus') return false;
  if (!membership.expiresAt) return true;
  return new Date(membership.expiresAt).getTime() > now.getTime();
}

export function getPlusDaysLeft(membership: MembershipState, now = new Date()) {
  if (!isPlusActive(membership, now) || !membership.expiresAt) return 0;
  const diff = new Date(membership.expiresAt).getTime() - now.getTime();
  return Math.max(1, Math.ceil(diff / DAY_MS));
}

export function getReadingLimit(membership: MembershipState) {
  return isPlusActive(membership) ? PLUS_READING_LIMIT : FREE_READING_LIMIT;
}

export function getDailyCheckInEnergy(membership: MembershipState) {
  return isPlusActive(membership) ? 2 : 1;
}

export function getDailyMissionEnergy(membership: MembershipState) {
  return isPlusActive(membership) ? 6 : 3;
}

export function startPlusTrial(membership: MembershipState, now = new Date()): MembershipState {
  if (membership.trialUsed || isPlusActive(membership, now)) return membership;

  return {
    plan: 'plus',
    expiresAt: new Date(now.getTime() + PLUS_TRIAL_HOURS * HOUR_MS).toISOString(),
    trialUsed: true,
    activatedAt: now.toISOString(),
    source: 'trial',
  };
}

export function activatePlusDays(membership: MembershipState, days = PLUS_MONTHLY_DAYS, now = new Date()): MembershipState {
  const currentExpiry = membership.expiresAt ? new Date(membership.expiresAt).getTime() : 0;
  const startAt = Math.max(now.getTime(), Number.isFinite(currentExpiry) ? currentExpiry : 0);

  return {
    plan: 'plus',
    expiresAt: new Date(startAt + days * DAY_MS).toISOString(),
    trialUsed: membership.trialUsed,
    activatedAt: membership.activatedAt || now.toISOString(),
    source: 'payment',
  };
}

export function getMembershipLabel(membership: MembershipState) {
  if (!isPlusActive(membership)) return '免费版';
  const daysLeft = getPlusDaysLeft(membership);
  if (membership.source === 'trial') return `Plus 试用中，约 ${daysLeft} 天后结束`;
  return `Plus 生效中，剩余约 ${daysLeft} 天`;
}
