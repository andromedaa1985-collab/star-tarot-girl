export type MembershipPlan = 'free' | 'plus' | 'tester';
export type MembershipSource = 'trial' | 'payment' | 'manual' | 'tester';
export type PremiumFeature = 'bazi' | 'simulator' | 'guardian' | 'tarot_deep_report' | 'relationship_report' | 'relationship_weekly';

export interface MembershipState {
  plan: MembershipPlan;
  expiresAt: string | null;
  trialUsed: boolean;
  activatedAt: string | null;
  source: MembershipSource | null;
  unlocks: PremiumFeature[];
  dailyFortuneDeepCredits: number;
}

export const FREE_READING_LIMIT = 30;
export const PLUS_READING_LIMIT = 200;
export const PLUS_MONTHLY_DAYS = 31;
export const PLUS_TRIAL_HOURS = 24;
export const PLUS_TRIAL_LEDGER_KEY = 'starrail:plusTrialLedger';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PREMIUM_FEATURES: PremiumFeature[] = ['bazi', 'simulator', 'guardian', 'tarot_deep_report', 'relationship_report', 'relationship_weekly'];
const PLUS_INCLUDED_FEATURES: PremiumFeature[] = ['simulator', 'guardian'];

export const defaultMembership: MembershipState = {
  plan: 'free',
  expiresAt: null,
  trialUsed: false,
  activatedAt: null,
  source: null,
  unlocks: [],
  dailyFortuneDeepCredits: 0,
};

export function hasLocalPlusTrialLedger() {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(PLUS_TRIAL_LEDGER_KEY);
    if (!raw) return false;
    if (raw === 'used') return true;
    const parsed = JSON.parse(raw) as { used?: unknown; claimedAt?: unknown };
    return Boolean(parsed.used || parsed.claimedAt);
  } catch {
    return true;
  }
}

export function markLocalPlusTrialUsed(now = new Date()) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PLUS_TRIAL_LEDGER_KEY,
      JSON.stringify({ used: true, claimedAt: now.toISOString() }),
    );
  } catch {
    // Trial entitlement should not fail just because localStorage is temporarily unavailable.
  }
}

export function normalizeMembership(value: unknown): MembershipState {
  const trialUsedByLedger = hasLocalPlusTrialLedger();
  if (!value || typeof value !== 'object') return { ...defaultMembership, trialUsed: trialUsedByLedger };

  const input = value as Partial<MembershipState>;
  const unlocks = normalizeUnlocks(input.unlocks);
  const dailyFortuneDeepCredits =
    typeof input.dailyFortuneDeepCredits === 'number' && Number.isFinite(input.dailyFortuneDeepCredits)
      ? Math.max(0, Math.floor(input.dailyFortuneDeepCredits))
      : 0;

  return {
    plan: input.plan === 'plus' || input.plan === 'tester' ? input.plan : 'free',
    expiresAt: typeof input.expiresAt === 'string' ? input.expiresAt : null,
    trialUsed: Boolean(input.trialUsed) || trialUsedByLedger,
    activatedAt: typeof input.activatedAt === 'string' ? input.activatedAt : null,
    source:
      input.source === 'trial' || input.source === 'payment' || input.source === 'manual' || input.source === 'tester'
        ? input.source
        : null,
    unlocks,
    dailyFortuneDeepCredits,
  };
}

export function isPlusActive(membership: MembershipState, now = new Date()) {
  if (membership.plan === 'tester') return true;
  if (membership.plan !== 'plus') return false;
  if (!membership.expiresAt) return true;
  return new Date(membership.expiresAt).getTime() > now.getTime();
}

export function isTesterActive(membership: MembershipState) {
  return membership.plan === 'tester';
}

export function canStartPlusTrial(membership: MembershipState, now = new Date()) {
  return !membership.trialUsed && !hasLocalPlusTrialLedger() && !isPlusActive(membership, now);
}

export function hasFeatureAccess(membership: MembershipState, feature: PremiumFeature) {
  if (membership.plan === 'tester') return true;
  const unlocks = normalizeUnlocks(membership.unlocks);
  if (unlocks.includes(feature)) return true;
  return isPlusActive(membership) && PLUS_INCLUDED_FEATURES.includes(feature);
}

export function getPlusDaysLeft(membership: MembershipState, now = new Date()) {
  if (membership.plan === 'tester') return 9999;
  if (!isPlusActive(membership, now) || !membership.expiresAt) return 0;
  const diff = new Date(membership.expiresAt).getTime() - now.getTime();
  return Math.max(1, Math.ceil(diff / DAY_MS));
}

export function getReadingLimit(membership: MembershipState) {
  if (membership.plan === 'tester') return 999999;
  return isPlusActive(membership) ? PLUS_READING_LIMIT : FREE_READING_LIMIT;
}

export function getDailyCheckInEnergy(membership: MembershipState) {
  if (membership.plan === 'tester') return 99;
  return isPlusActive(membership) ? 2 : 1;
}

export function getDailyMissionEnergy(membership: MembershipState) {
  if (membership.plan === 'tester') return 99;
  return isPlusActive(membership) ? 6 : 3;
}

export function getDailyFortuneDeepCredits(membership: MembershipState) {
  return Math.max(0, Math.floor(membership.dailyFortuneDeepCredits || 0));
}

export function hasDailyFortuneDeepAccess(membership: MembershipState) {
  return isPlusActive(membership) || getDailyFortuneDeepCredits(membership) > 0;
}

export function addDailyFortuneDeepCredits(membership: MembershipState, credits = 1): MembershipState {
  return {
    ...membership,
    dailyFortuneDeepCredits: getDailyFortuneDeepCredits(membership) + Math.max(0, Math.floor(credits)),
  };
}

export function consumeDailyFortuneDeepCredit(membership: MembershipState): MembershipState {
  if (isPlusActive(membership)) return membership;
  return {
    ...membership,
    dailyFortuneDeepCredits: Math.max(0, getDailyFortuneDeepCredits(membership) - 1),
  };
}

export function startPlusTrial(membership: MembershipState, now = new Date()): MembershipState {
  if (!canStartPlusTrial(membership, now)) {
    return hasLocalPlusTrialLedger() ? { ...membership, trialUsed: true } : membership;
  }

  markLocalPlusTrialUsed(now);

  return {
    plan: 'plus',
    expiresAt: new Date(now.getTime() + PLUS_TRIAL_HOURS * HOUR_MS).toISOString(),
    trialUsed: true,
    activatedAt: now.toISOString(),
    source: 'trial',
    unlocks: normalizeUnlocks(membership.unlocks),
    dailyFortuneDeepCredits: getDailyFortuneDeepCredits(membership),
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
    unlocks: normalizeUnlocks(membership.unlocks),
    dailyFortuneDeepCredits: getDailyFortuneDeepCredits(membership),
  };
}

export function activateTesterAccess(now = new Date()): MembershipState {
  return {
    plan: 'tester',
    expiresAt: null,
    trialUsed: true,
    activatedAt: now.toISOString(),
    source: 'tester',
    unlocks: ['bazi', 'simulator', 'guardian', 'tarot_deep_report', 'relationship_report', 'relationship_weekly'],
    dailyFortuneDeepCredits: 999999,
  };
}

export function addFeatureUnlock(membership: MembershipState, feature: PremiumFeature): MembershipState {
  const unlocks = normalizeUnlocks(membership.unlocks);
  if (unlocks.includes(feature)) return membership;
  return {
    ...membership,
    unlocks: [...unlocks, feature],
  };
}

export function getMembershipLabel(membership: MembershipState) {
  if (membership.plan === 'tester') return '全部功能已解锁';
  if (!isPlusActive(membership)) return '免费版';
  const daysLeft = getPlusDaysLeft(membership);
  if (membership.source === 'trial') return `Plus 试用中，约 ${daysLeft} 天后结束`;
  return `Plus 生效中，剩余约 ${daysLeft} 天`;
}

function normalizeUnlocks(value: unknown): PremiumFeature[] {
  return Array.isArray(value) ? value.filter((item): item is PremiumFeature => PREMIUM_FEATURES.includes(item)) : [];
}
