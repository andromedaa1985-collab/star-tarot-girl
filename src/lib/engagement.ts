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

export interface SoftConversionTrigger {
  id: 'tarot_3' | 'diary_2' | 'day_4';
  title: string;
  desc: string;
  cta: string;
  reason: 'history' | 'weekly';
}

export interface DiaryThemeSource {
  id: string;
  date: string;
  mood: 'great' | 'good' | 'neutral' | 'bad' | 'awful';
  content: string;
  tags?: string[];
}

export interface DiaryThemeTrend {
  id: string;
  label: string;
  entryCount: number;
  score: number;
  moodSummary: string;
  evidence: string;
  keywords: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 240;
const DIARY_THEME_WINDOW_MS = 30 * DAY_MS;

const DIARY_THEME_BUCKETS = [
  {
    id: 'pressure',
    label: '压力与焦虑',
    keywords: ['焦虑', '压力', '烦', '崩溃', '担心', '害怕', '内耗', '紧张', '不安', '累', '疲惫'],
  },
  {
    id: 'work',
    label: '工作与责任',
    keywords: ['工作', '项目', '职场', '老板', '同事', '任务', '加班', '责任', '绩效', '面试', '学习'],
  },
  {
    id: 'relationship',
    label: '关系与边界',
    keywords: ['关系', '恋爱', '喜欢', '爱', '分手', '伴侣', '朋友', '家人', '父母', '边界', '沟通'],
  },
  {
    id: 'choice',
    label: '选择与方向',
    keywords: ['选择', '方向', '决定', '纠结', '要不要', '该不该', '机会', '未来', '迷茫', '目标'],
  },
  {
    id: 'self',
    label: '自我照顾',
    keywords: ['自己', '自我', '休息', '照顾', '身体', '睡眠', '失眠', '吃饭', '疗愈', '安全感'],
  },
  {
    id: 'money',
    label: '金钱与安全',
    keywords: ['钱', '工资', '收入', '花钱', '消费', '房租', '存款', '财务', '安全感', '稳定'],
  },
] as const;

const MOOD_WEIGHT: Record<DiaryThemeSource['mood'], number> = {
  great: 1,
  good: 1,
  neutral: 1,
  bad: 2,
  awful: 3,
};

const MOOD_LABEL: Record<DiaryThemeSource['mood'], string> = {
  great: '偏明亮',
  good: '较稳定',
  neutral: '较平',
  bad: '偏低落',
  awful: '很辛苦',
};

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

function isUpgradePromptCoolingDown(value: string | null, now = new Date()) {
  if (!value) return false;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  return getLocalDateKey(parsed) === getLocalDateKey(now);
}

function getDiaryEntryTime(date: string) {
  const direct = Date.parse(date);
  if (Number.isFinite(direct)) return direct;
  const [year, month, day] = date.split('-').map(Number);
  const fallback = new Date(year || 1970, (month || 1) - 1, day || 1).getTime();
  return Number.isFinite(fallback) ? fallback : 0;
}

function compactDiaryText(text: string, limit = 32) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function summarizeDiaryMoods(entries: DiaryThemeSource[]) {
  const ranked = Object.entries(
    entries.reduce<Record<string, number>>((acc, entry) => {
      const label = MOOD_LABEL[entry.mood] || '未记录';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return ranked[0]?.[0] || '未记录';
}

export function buildDiaryThemeTrends(
  entries: DiaryThemeSource[],
  options: { limit?: number; days?: number; now?: number } = {},
): DiaryThemeTrend[] {
  const limit = options.limit || 3;
  const windowMs = options.days ? options.days * DAY_MS : DIARY_THEME_WINDOW_MS;
  const now = options.now || Date.now();
  const recentEntries = [...entries]
    .filter((entry) => now - getDiaryEntryTime(entry.date) <= windowMs)
    .sort((a, b) => getDiaryEntryTime(b.date) - getDiaryEntryTime(a.date));
  const scope = recentEntries.length > 0 ? recentEntries : [...entries].sort((a, b) => getDiaryEntryTime(b.date) - getDiaryEntryTime(a.date));

  if (scope.length === 0) return [];

  const trends = DIARY_THEME_BUCKETS.map((bucket) => {
    const matchedEntries: DiaryThemeSource[] = [];
    const matchedKeywords = new Set<string>();
    let score = 0;

    scope.forEach((entry) => {
      const tags = entry.tags || [];
      const text = `${entry.content} ${tags.join(' ')}`;
      let entryScore = 0;

      bucket.keywords.forEach((keyword) => {
        const tagMatched = tags.some((tag) => tag.includes(keyword) || keyword.includes(tag));
        const textMatched = text.includes(keyword);
        if (tagMatched) entryScore += 3;
        else if (textMatched) entryScore += 1;
        if (tagMatched || textMatched) matchedKeywords.add(keyword);
      });

      if (entryScore > 0) {
        matchedEntries.push(entry);
        score += entryScore + MOOD_WEIGHT[entry.mood];
      }
    });

    const latest = matchedEntries[0];
    return {
      id: bucket.id,
      label: bucket.label,
      entryCount: matchedEntries.length,
      score,
      moodSummary: summarizeDiaryMoods(matchedEntries),
      evidence: latest ? `最近写到「${compactDiaryText(latest.content)}」` : '',
      keywords: [...matchedKeywords].slice(0, 4),
    } satisfies DiaryThemeTrend;
  }).filter((trend) => trend.score > 0);

  const fallbackTags = scope
    .flatMap((entry) => entry.tags || [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .reduce<Map<string, number>>((acc, tag) => {
      acc.set(tag, (acc.get(tag) || 0) + 1);
      return acc;
    }, new Map<string, number>());

  const fallbackTrends = [...fallbackTags.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({
      id: `tag:${tag}`,
      label: tag,
      entryCount: count,
      score: count,
      moodSummary: summarizeDiaryMoods(scope.filter((entry) => entry.tags?.includes(tag))),
      evidence: scope.find((entry) => entry.tags?.includes(tag))?.content
        ? `最近写到「${compactDiaryText(scope.find((entry) => entry.tags?.includes(tag))?.content || '')}」`
        : '',
      keywords: [tag],
    } satisfies DiaryThemeTrend));

  const merged = [...trends, ...fallbackTrends]
    .filter((trend, index, list) => list.findIndex((item) => item.label === trend.label) === index)
    .sort((a, b) => b.score - a.score || b.entryCount - a.entryCount)
    .slice(0, limit);

  if (merged.length >= limit || scope.length < 2) return merged;

  const fallbackPool = [
    {
      id: 'mood-flow',
      label: '情绪波动',
      entryCount: scope.length,
      score: scope.reduce((sum, entry) => sum + MOOD_WEIGHT[entry.mood], 0),
      moodSummary: summarizeDiaryMoods(scope),
      evidence: scope[0] ? `最近写到「${compactDiaryText(scope[0].content)}」` : '',
      keywords: ['情绪', '节奏'],
    },
    {
      id: 'life-rhythm',
      label: '生活节奏',
      entryCount: scope.length,
      score: Math.max(1, scope.length - 1),
      moodSummary: summarizeDiaryMoods(scope),
      evidence: scope[1] ? `也写到「${compactDiaryText(scope[1].content)}」` : '',
      keywords: ['日常', '节奏'],
    },
    {
      id: 'self-story',
      label: '自我叙事',
      entryCount: scope.length,
      score: Math.max(1, scope.length - 2),
      moodSummary: summarizeDiaryMoods(scope),
      evidence: scope[2] ? `还有「${compactDiaryText(scope[2].content)}」` : '',
      keywords: ['自己', '感受'],
    },
  ] satisfies DiaryThemeTrend[];

  return [...merged, ...fallbackPool]
    .filter((trend, index, list) => list.findIndex((item) => item.label === trend.label) === index)
    .slice(0, limit);
}

export function getSoftConversionTrigger(input: {
  plusActive: boolean;
  tarotReadings: number;
  diaryEntries: number;
  activeDays: number;
  lastUpgradePromptAt: string | null;
  weeklyReviewReady: boolean;
}) {
  if (input.plusActive || isUpgradePromptCoolingDown(input.lastUpgradePromptAt)) return null;

  if (input.weeklyReviewReady && input.tarotReadings >= 3) {
    return {
      id: 'tarot_3',
      title: '你已经有一条可复盘的牌迹线',
      desc: `已经留下 ${input.tarotReadings} 次牌迹，适合把反复出现的问题整理成 7 日复盘。`,
      cta: '看看完整复盘',
      reason: 'weekly',
    } satisfies SoftConversionTrigger;
  }

  if (input.diaryEntries >= 2) {
    return {
      id: 'diary_2',
      title: '日记已经能看出情绪底色了',
      desc: `你写下了 ${input.diaryEntries} 篇日记，Plus 会把它和牌迹接起来，找出反复卡住的地方。`,
      cta: '解锁深度复盘',
      reason: 'weekly',
    } satisfies SoftConversionTrigger;
  }

  if (input.activeDays >= 4 && input.tarotReadings + input.diaryEntries > 0) {
    return {
      id: 'day_4',
      title: '星轨已经陪你回访了几天',
      desc: `连续沉淀到第 ${input.activeDays} 天后，长期记忆和守护回访会比单次占卜更有用。`,
      cta: '查看 Plus 价值',
      reason: 'history',
    } satisfies SoftConversionTrigger;
  }

  return null;
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
