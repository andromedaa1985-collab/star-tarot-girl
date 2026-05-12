export type AppEventType =
  | 'session_start'
  | 'tarot_draw'
  | 'daily_check_in'
  | 'daily_reward'
  | 'return_reward'
  | 'trial_start'
  | 'upgrade_prompt'
  | 'diary_save'
  | 'diary_review'
  | 'guardian_letter'
  | 'guardian_chat'
  | 'simulation_run';

export interface AppEvent {
  id: string;
  type: AppEventType;
  timestamp: number;
  meta?: Record<string, string | number | boolean | null>;
}

export interface EngagementState {
  firstSeenAt: string;
  lastActiveDate: string;
  activeDays: number;
  returnRewardDate: string | null;
  lastUpgradePromptAt: string | null;
}

export interface NextBestAction {
  id: 'tarot' | 'bazi' | 'diary' | 'guardian' | 'simulator' | 'plus';
  title: string;
  desc: string;
  cta: string;
  route?: string;
  prompt?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 240;

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const defaultEngagement: EngagementState = {
  firstSeenAt: new Date().toISOString(),
  lastActiveDate: getLocalDateKey(),
  activeDays: 1,
  returnRewardDate: null,
  lastUpgradePromptAt: null,
};

export function normalizeEngagement(value: unknown): EngagementState {
  if (!value || typeof value !== 'object') return defaultEngagement;
  const input = value as Partial<EngagementState>;
  return {
    firstSeenAt: typeof input.firstSeenAt === 'string' ? input.firstSeenAt : new Date().toISOString(),
    lastActiveDate: typeof input.lastActiveDate === 'string' ? input.lastActiveDate : getLocalDateKey(),
    activeDays: typeof input.activeDays === 'number' && input.activeDays > 0 ? input.activeDays : 1,
    returnRewardDate: typeof input.returnRewardDate === 'string' ? input.returnRewardDate : null,
    lastUpgradePromptAt: typeof input.lastUpgradePromptAt === 'string' ? input.lastUpgradePromptAt : null,
  };
}

export function activateToday(state: EngagementState, now = new Date()): EngagementState {
  const today = getLocalDateKey(now);
  if (state.lastActiveDate === today) return state;

  return {
    ...state,
    lastActiveDate: today,
    activeDays: state.activeDays + 1,
  };
}

export function recordAppEvent(
  events: AppEvent[],
  type: AppEventType,
  meta?: AppEvent['meta'],
  now = Date.now(),
) {
  const nextEvent: AppEvent = {
    id: `${type}-${now}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    timestamp: now,
    meta,
  };
  return [nextEvent, ...events].slice(0, MAX_EVENTS);
}

export function getDaysSince(dateKey: string | null, now = new Date()) {
  if (!dateKey) return 999;
  const target = new Date(`${dateKey}T00:00:00`).getTime();
  if (!Number.isFinite(target)) return 999;
  return Math.floor((new Date(getLocalDateKey(now)).getTime() - target) / DAY_MS);
}

export function getUserSegment(input: {
  plusActive: boolean;
  activeDays: number;
  tarotReadings: number;
  diaryEntries: number;
  simulationHistory: number;
  guardianMessages: number;
}) {
  if (input.plusActive) return 'Plus 用户';
  if (input.tarotReadings >= 10 || input.activeDays >= 5) return '高意向免费用户';
  if (input.tarotReadings >= 3 || input.diaryEntries >= 2 || input.simulationHistory >= 1 || input.guardianMessages >= 3) {
    return '已激活用户';
  }
  return '新用户';
}

export function getNextBestAction(input: {
  plusActive: boolean;
  tarotReadings: number;
  hasBaziProfile: boolean;
  wroteDiaryToday: boolean;
  hasGuardianLetterToday: boolean;
  simulatedRecently: boolean;
  activeDays: number;
}) {
  if (input.tarotReadings === 0) {
    return {
      id: 'tarot',
      title: '先完成第一次占卜',
      desc: '第一次牌迹会成为后续周报和长期记忆的起点。',
      cta: '抽今日牌',
      prompt: '今日运势',
    } satisfies NextBestAction;
  }

  if (!input.hasBaziProfile) {
    return {
      id: 'bazi',
      title: '补一份命理档案',
      desc: '有档案后，日记复盘、守护寄语和沙盘会更像“懂你”。',
      cta: '去建档案',
      route: '/app/bazi',
    } satisfies NextBestAction;
  }

  if (!input.wroteDiaryToday) {
    return {
      id: 'diary',
      title: '写下今天最卡的点',
      desc: '日记越多，周报越能看出你真正反复困住的地方。',
      cta: '写日记',
      route: '/app/diary',
    } satisfies NextBestAction;
  }

  if (!input.hasGuardianLetterToday) {
    return {
      id: 'guardian',
      title: '领取今日守护寄语',
      desc: '这是低成本回访点，适合每天回来打开一次。',
      cta: '去领取',
      route: '/app/guardian',
    } satisfies NextBestAction;
  }

  if (!input.simulatedRecently) {
    return {
      id: 'simulator',
      title: '把纠结丢进沙盘',
      desc: '二选一问题会比泛泛聊天更容易产生“值了”的感觉。',
      cta: '去推演',
      route: '/app/simulator',
    } satisfies NextBestAction;
  }

  if (!input.plusActive && (input.tarotReadings >= 7 || input.activeDays >= 4)) {
    return {
      id: 'plus',
      title: '你已经有付费价值了',
      desc: '现在最适合展示完整周报、长线牌迹和更多能量。',
      cta: '看 Plus',
      route: '/app/profile?plus=1',
    } satisfies NextBestAction;
  }

  return {
    id: 'tarot',
    title: '今天再问一个更小的问题',
    desc: '稳定的小问题比一次性审判人生更容易形成习惯。',
    cta: '再抽一张',
    prompt: '最近的烦恼',
  } satisfies NextBestAction;
}
