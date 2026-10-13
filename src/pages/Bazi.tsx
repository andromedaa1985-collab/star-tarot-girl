import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, Calendar, Clock, User, Sparkles, MapPin, RefreshCw, Loader2, Star, Heart, Briefcase, Zap, Leaf, Flame, Mountain, Gem, Waves, Library, LockKeyhole, Link2, Check, ChevronDown, Search, Plus, Pencil } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppContext, type UserProfile } from '../store';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Solar } from 'lunar-javascript';
import { usePersistentDraft } from '../lib/usePersistentDraft';
import { hasFeatureAccess, isPlusActive } from '../lib/membership';
import { copyTextToClipboard } from '../lib/clipboard';
import { formatAppDateTime, getAppDateKey, getAppWeekday, getTrustedNow, useTrustedTime } from '../lib/trustedTime';
import { buildUserAddressInstruction, normalizeUserAddress, parseAiJson } from '../lib/aiPrompting';
import { DEEPSEEK_MAX_TOKENS, DEEPSEEK_TEXT_MODEL } from '../lib/aiModels';
import { SERVICE_FALLBACK, getPublicServiceError } from '../lib/serviceFeedback';
import { createGenerationTrace, createRecordId } from '../lib/generationTrace';
import { apiFetch } from '../lib/apiClient';
import PageHeader from '../components/ui/PageHeader';
import { validateBaziProfile, type BaziProfileField } from '../lib/baziProfileValidation';
import { shouldSubmitOnEnter } from '../lib/composerKeyboard';
import { getStoredAccountSession } from '../lib/accountClient';
import { writeWorkspaceStorage } from '../lib/workspacePersistence';
import { createBaziRequestSnapshot, filterBaziProfiles, getBaziBirthFingerprint, getBaziResultStatus, isBaziRequestCurrent, restoreBaziEditor, saveBaziProfile, type BaziEditorState, type BaziResultOwner } from '../lib/baziProfiles';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LIU_HE_PAIRS = ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'];
const CHONG_PAIRS = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
const SAN_HE_GROUPS = ['申子辰', '亥卯未', '寅午戌', '巳酉丑'];

function getProfileBranch(profile: UserProfile) {
  try {
    const [year, month, day] = profile.birthDate.split('-').map(Number);
    if (!year || !month || !day) return '';
    return Solar.fromYmd(year, month, day).getLunar().getYearZhi();
  } catch {
    return '';
  }
}

function getProfileAge(profile: UserProfile) {
  const year = Number(profile.birthDate.split('-')[0]);
  return year ? Number(getAppDateKey(getTrustedNow()).slice(0, 4)) - year : 0;
}

function calculateRelationshipMatch(a?: UserProfile, b?: UserProfile) {
  if (!a || !b || a.id === b.id) return null;

  const branchA = getProfileBranch(a);
  const branchB = getProfileBranch(b);
  const pair = `${branchA}${branchB}`;
  const reversePair = `${branchB}${branchA}`;
  let score = 58;
  const reasons: string[] = [];

  if (LIU_HE_PAIRS.includes(pair) || LIU_HE_PAIRS.includes(reversePair)) {
    score += 22;
    reasons.push('六合相吸');
  } else if (SAN_HE_GROUPS.some(group => group.includes(branchA) && group.includes(branchB))) {
    score += 16;
    reasons.push('三合有默契');
  } else if (CHONG_PAIRS.includes(pair) || CHONG_PAIRS.includes(reversePair)) {
    score -= 14;
    reasons.push('容易互相刺激');
  } else {
    reasons.push('节奏需要磨合');
  }

  const ageDiff = Math.abs(getProfileAge(a) - getProfileAge(b));
  if (ageDiff <= 2) {
    score += 6;
    reasons.push('成长阶段接近');
  } else if (ageDiff <= 6) {
    score += 3;
    reasons.push('视角差异可互补');
  } else {
    score -= 3;
    reasons.push('生活节奏差异明显');
  }

  if (a.currentLocation && b.currentLocation && a.currentLocation.slice(0, 2) === b.currentLocation.slice(0, 2)) {
    score += 4;
    reasons.push('现实距离较近');
  }

  score = Math.max(32, Math.min(96, score));
  const label = score >= 82 ? '高吸引' : score >= 68 ? '可发展' : score >= 52 ? '慢热磨合' : '谨慎观察';
  const advice = score >= 68
    ? '适合从轻松、持续的小互动开始，别一上来就逼对方给答案。'
    : '可以先看沟通成本，别把偶然的心动误判成长久的稳定。';
  const communicationCost = Math.max(18, Math.min(92, 106 - score + (reasons.some((item) => item.includes('刺激')) ? 12 : 0)));
  const stablePotential = Math.max(38, Math.min(96, score + (ageDiff <= 6 ? 6 : -4)));

  return {
    score,
    label,
    reasons: reasons.slice(0, 3),
    advice,
    branches: branchA && branchB ? `${branchA} × ${branchB}` : '资料不足',
    metrics: [
      { label: '吸引力', value: Math.min(96, score + 7), hint: score >= 68 ? '容易靠近' : '慢慢升温' },
      { label: '沟通成本', value: communicationCost, hint: communicationCost >= 62 ? '需要约定边界' : '相对轻松' },
      { label: '稳定潜力', value: stablePotential, hint: stablePotential >= 72 ? '适合长期观察' : '先看回应' },
    ],
    report: buildRelationshipReport(score, reasons, a, b),
  };
}

function buildRelationshipReport(score: number, reasons: string[], a?: UserProfile, b?: UserProfile) {
  const names = `${a?.name || '你'} 和 ${b?.name || 'TA'}`;
  const high = score >= 72;
  const tense = reasons.some((item) => item.includes('刺激') || item.includes('差异'));

  return {
    sweetSpot: high
      ? `${names} 的吸引力不只在新鲜感，而在于彼此容易看见对方的优点。适合把关系推进到稳定陪伴，而不是只靠情绪起伏维持热度。`
      : `${names} 的关系更像慢慢试探型。不要急着用“合不合”下结论，先观察对方是否愿意在小事上持续回应。`,
    conflict: tense
      ? '雷区在于节奏和控制感：一个人想快点确定，一个人可能需要空间。吵架时不要逼问态度，先约定冷静后的复盘时间。'
      : '主要雷区不是大冲突，而是把“我以为你懂”当成默认。越熟越要把需求说清楚，别让沉默变成误会。',
    language: high
      ? '相处语言适合“肯定 + 具体行动”。少说抽象承诺，多说今天能做什么、什么时候见、下一步怎么安排。'
      : '相处语言适合“轻问 + 慢确认”。不要一次谈太重，先用低压力的问题确认彼此边界。',
    task: high
      ? '7 日小任务：一起定一个很小的共同仪式，比如睡前互发一句今天最想被理解的事，连续 7 天。'
      : '7 日小任务：先不逼关系定义，每两天做一次轻量互动，观察对方是否稳定回应。',
  };
}

const RELATIONSHIP_WEEK_TASKS = [
  { day: 1, title: '观察回应速度', desc: '今天只看一个信号：你发出轻量互动后，对方是否愿意稳定回应。' },
  { day: 2, title: '安排一次低压力互动', desc: '选择一件很小的事一起做，重点不是结果，而是看相处时是否放松。' },
  { day: 3, title: '识别一个舒服边界', desc: '记录你们在哪个话题上最自然，哪个话题一碰就容易紧张。' },
  { day: 4, title: '看行动是否一致', desc: '少听承诺，多看对方是否把小安排落到实际行动里。' },
  { day: 5, title: '复盘一次小摩擦', desc: '如果最近有不舒服，先写下事实和感受，不急着给关系定性。' },
  { day: 6, title: '确认关系里的能量流向', desc: '看看是彼此补能，还是其中一方长期在迁就和消耗。' },
  { day: 7, title: '做一次清醒判断', desc: '回看这一周，对方是否让你更安稳、更真实，还是更焦虑。' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function getRelationshipWeekDay(startDate?: string, now = getTrustedNow()) {
  if (!startDate) return 1;
  const start = new Date(`${startDate}T00:00:00`).getTime();
  if (!Number.isFinite(start)) return 1;
  const today = new Date(`${getAppDateKey(now)}T00:00:00`).getTime();
  return Math.max(1, Math.min(7, Math.floor((today - start) / DAY_MS) + 1));
}

function getRelationshipPairKey(a?: UserProfile, b?: UserProfile) {
  if (!a || !b) return '';
  return [`${a.name}-${a.birthDate}-${a.birthTime}`, `${b.name}-${b.birthDate}-${b.birthTime}`].sort().join('__');
}

function getRelationshipPreview(text: string) {
  return text.length > 44 ? `${text.slice(0, 44)}...` : text;
}

function isLocalHostName(hostname: string) {
  return hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1' || hostname === '[::1]' || hostname.startsWith('127.');
}

function isLocalUrl(url: string) {
  try {
    return isLocalHostName(new URL(url).hostname);
  } catch {
    return false;
  }
}

function pickShareProfile(profile: UserProfile) {
  return {
    name: profile.name,
    gender: profile.gender,
    birthDate: profile.birthDate,
    birthTime: profile.birthTime,
    birthLocation: profile.birthLocation,
    currentLocation: profile.currentLocation,
  };
}

interface BaziResult extends BaziResultOwner {
  generationId?: string;
  generationKind?: string;
  generatedAt?: string;
  model?: string;
  usedFallback?: boolean;
  bazi: {
    year: [string, string];
    month: [string, string];
    day: [string, string];
    hour: [string, string];
  };
  pattern: {
    name: string;
    description: string;
  };
  wuxing: {
    strength: string;
    favorable: string[];
    luckyColors: string[];
    luckyDirections: string[];
    luckyNumbers: number[];
    elements: {
      name: string;
      percentage: number;
      gods: string;
      isDayMaster?: boolean;
    }[];
  };
  tenGods: {
    name: string;
    percentage: number;
    color: string;
  }[];
  shensha: {
    category: string;
    items: string[];
  }[];
  dailyLuck: {
    score: number;
    summary: string;
    luckyHours: string;
  };
  personality: string;
  career: string;
  romance: string;
}

type FiveElement = '木' | '火' | '土' | '金' | '水';
type TenGodName = '比肩' | '劫财' | '食神' | '伤官' | '正财' | '偏财' | '正官' | '七杀' | '正印' | '偏印';

const FIVE_ELEMENTS: FiveElement[] = ['木', '火', '土', '金', '水'];
const TEN_GODS: TenGodName[] = ['比肩', '劫财', '食神', '伤官', '正财', '偏财', '正官', '七杀', '正印', '偏印'];

const STEM_ELEMENT: Record<string, FiveElement> = {
  甲: '木', 乙: '木',
  丙: '火', 丁: '火',
  戊: '土', 己: '土',
  庚: '金', 辛: '金',
  壬: '水', 癸: '水',
};

const STEM_POLARITY: Record<string, 'yang' | 'yin'> = {
  甲: 'yang', 丙: 'yang', 戊: 'yang', 庚: 'yang', 壬: 'yang',
  乙: 'yin', 丁: 'yin', 己: 'yin', 辛: 'yin', 癸: 'yin',
};

const HIDDEN_STEMS: Record<string, Array<{ gan: string; weight: number }>> = {
  子: [{ gan: '癸', weight: 1 }],
  丑: [{ gan: '己', weight: 0.6 }, { gan: '癸', weight: 0.25 }, { gan: '辛', weight: 0.15 }],
  寅: [{ gan: '甲', weight: 0.6 }, { gan: '丙', weight: 0.25 }, { gan: '戊', weight: 0.15 }],
  卯: [{ gan: '乙', weight: 1 }],
  辰: [{ gan: '戊', weight: 0.6 }, { gan: '乙', weight: 0.25 }, { gan: '癸', weight: 0.15 }],
  巳: [{ gan: '丙', weight: 0.6 }, { gan: '戊', weight: 0.25 }, { gan: '庚', weight: 0.15 }],
  午: [{ gan: '丁', weight: 0.7 }, { gan: '己', weight: 0.3 }],
  未: [{ gan: '己', weight: 0.6 }, { gan: '丁', weight: 0.25 }, { gan: '乙', weight: 0.15 }],
  申: [{ gan: '庚', weight: 0.6 }, { gan: '壬', weight: 0.25 }, { gan: '戊', weight: 0.15 }],
  酉: [{ gan: '辛', weight: 1 }],
  戌: [{ gan: '戊', weight: 0.6 }, { gan: '辛', weight: 0.25 }, { gan: '丁', weight: 0.15 }],
  亥: [{ gan: '壬', weight: 0.7 }, { gan: '甲', weight: 0.3 }],
};

const BRANCH_SEASON_ELEMENT: Record<string, FiveElement> = {
  寅: '木', 卯: '木',
  巳: '火', 午: '火',
  辰: '土', 戌: '土', 丑: '土', 未: '土',
  申: '金', 酉: '金',
  亥: '水', 子: '水',
};

const GENERATES: Record<FiveElement, FiveElement> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CONTROLS: Record<FiveElement, FiveElement> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const ELEMENT_COLORS: Record<FiveElement, string[]> = {
  木: ['绿色', '青色'],
  火: ['红色', '紫色'],
  土: ['黄色', '棕色'],
  金: ['白色', '金色'],
  水: ['蓝色', '黑色'],
};
const ELEMENT_DIRECTIONS: Record<FiveElement, string[]> = {
  木: ['东方'],
  火: ['南方'],
  土: ['中宫', '西南'],
  金: ['西方'],
  水: ['北方'],
};
const ELEMENT_NUMBERS: Record<FiveElement, number[]> = {
  木: [3, 8],
  火: [2, 7],
  土: [5, 10],
  金: [4, 9],
  水: [1, 6],
};

function getGeneratingElement(element: FiveElement) {
  return FIVE_ELEMENTS.find((item) => GENERATES[item] === element) || element;
}

function getControllingElement(element: FiveElement) {
  return FIVE_ELEMENTS.find((item) => CONTROLS[item] === element) || element;
}

function normalizeScores<T extends string>(keys: readonly T[], scores: Record<T, number>) {
  const total = keys.reduce((sum, key) => sum + Math.max(0, scores[key] || 0), 0) || 1;
  const items = keys.map((key) => {
    const raw = (Math.max(0, scores[key] || 0) / total) * 100;
    return { key, raw, percentage: Math.round(raw) };
  });

  let diff = 100 - items.reduce((sum, item) => sum + item.percentage, 0);
  while (diff !== 0) {
    const candidates = items
      .filter((item) => diff > 0 || item.percentage > 0)
      .sort((a, b) => (diff > 0 ? b.raw - b.percentage - (a.raw - a.percentage) : b.percentage - a.percentage));
    const target = candidates[0];
    if (!target) break;
    target.percentage += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }

  return items;
}

function getTenGodName(dayGan: string, targetGan: string): TenGodName {
  const dayElement = STEM_ELEMENT[dayGan];
  const targetElement = STEM_ELEMENT[targetGan];
  const samePolarity = STEM_POLARITY[dayGan] === STEM_POLARITY[targetGan];

  if (!dayElement || !targetElement) return '比肩';
  if (dayElement === targetElement) return samePolarity ? '比肩' : '劫财';
  if (GENERATES[dayElement] === targetElement) return samePolarity ? '食神' : '伤官';
  if (CONTROLS[dayElement] === targetElement) return samePolarity ? '偏财' : '正财';
  if (CONTROLS[targetElement] === dayElement) return samePolarity ? '七杀' : '正官';
  return samePolarity ? '偏印' : '正印';
}

function buildWeightedBaziMetrics(baZi: any) {
  const dayGan = baZi.getDayGan();
  const dayElement = STEM_ELEMENT[dayGan] || '木';
  const monthZhi = baZi.getMonthZhi();
  const seasonElement = BRANCH_SEASON_ELEMENT[monthZhi];
  const pillars = [
    { key: 'year', gan: baZi.getYearGan(), zhi: baZi.getYearZhi(), weight: 0.82 },
    { key: 'month', gan: baZi.getMonthGan(), zhi: baZi.getMonthZhi(), weight: 1.48 },
    { key: 'day', gan: dayGan, zhi: baZi.getDayZhi(), weight: 1.1 },
    { key: 'hour', gan: baZi.getTimeGan(), zhi: baZi.getTimeZhi(), weight: 0.95 },
  ];
  const elementScores = Object.fromEntries(FIVE_ELEMENTS.map((element) => [element, 0])) as Record<FiveElement, number>;
  const tenGodScores = Object.fromEntries(TEN_GODS.map((god) => [god, 0])) as Record<TenGodName, number>;

  const addElement = (gan: string, weight: number) => {
    const element = STEM_ELEMENT[gan];
    if (element) elementScores[element] += weight;
  };
  const addTenGod = (gan: string, weight: number) => {
    tenGodScores[getTenGodName(dayGan, gan)] += weight;
  };

  pillars.forEach((pillar) => {
    addElement(pillar.gan, pillar.weight * 0.9);
    if (pillar.key !== 'day') addTenGod(pillar.gan, pillar.weight * 0.95);

    (HIDDEN_STEMS[pillar.zhi] || []).forEach((hidden) => {
      addElement(hidden.gan, pillar.weight * 1.12 * hidden.weight);
      addTenGod(hidden.gan, pillar.weight * 0.82 * hidden.weight);
    });
  });

  if (seasonElement) elementScores[seasonElement] *= 1.14;

  const elementItems = normalizeScores(FIVE_ELEMENTS, elementScores);
  const tenGodItems = normalizeScores(TEN_GODS, tenGodScores);
  const resourceElement = getGeneratingElement(dayElement);
  const outputElement = GENERATES[dayElement];
  const wealthElement = CONTROLS[dayElement];
  const officerElement = getControllingElement(dayElement);
  const totalElementScore = FIVE_ELEMENTS.reduce((sum, element) => sum + elementScores[element], 0) || 1;
  const supportRatio = (elementScores[dayElement] + elementScores[resourceElement] * 0.86) / totalElementScore;
  const strength =
    supportRatio >= 0.58 ? '身强' :
      supportRatio >= 0.5 ? '中和偏强' :
        supportRatio >= 0.43 ? '中和偏弱' : '身弱';
  const favorableCandidates = supportRatio >= 0.52
    ? [outputElement, wealthElement, officerElement]
    : [resourceElement, dayElement, officerElement];
  const favorable = [...new Set(favorableCandidates)]
    .sort((a, b) => elementScores[a] - elementScores[b])
    .slice(0, 2);

  const highest = Math.max(...elementItems.map((item) => item.percentage));
  const lowest = Math.min(...elementItems.map((item) => item.percentage));
  const elements = elementItems.map(({ key, percentage }) => {
    const labels = [
      key === dayElement ? '日主' : '',
      key === seasonElement ? '得令' : '',
      percentage >= highest - 2 ? '偏旺' : '',
      percentage <= lowest + 2 ? '偏弱' : '',
    ].filter(Boolean);
    return {
      name: key,
      percentage,
      gods: labels.slice(0, 2).join(' · '),
      isDayMaster: key === dayElement,
    };
  });

  const defaultColors: Record<TenGodName, string> = {
    比肩: '#FF8A80', 劫财: '#FF5252',
    食神: '#FFD180', 伤官: '#FFAB40',
    正财: '#FFE57F', 偏财: '#FFD740',
    正官: '#80D8FF', 七杀: '#40C4FF',
    正印: '#B9F6CA', 偏印: '#69F0AE',
  };

  return {
    elements,
    tenGods: tenGodItems.map(({ key, percentage }) => ({ name: key, percentage, color: defaultColors[key] })),
    strength,
    favorable,
    luckyColors: favorable.flatMap((element) => ELEMENT_COLORS[element]).slice(0, 3),
    luckyDirections: favorable.flatMap((element) => ELEMENT_DIRECTIONS[element]).slice(0, 2),
    luckyNumbers: favorable.flatMap((element) => ELEMENT_NUMBERS[element]).slice(0, 3),
  };
}

const buildRecentFortuneContext = (formData: any, now = getTrustedNow()) => {
  const base = [
    `当前时间：${formatAppDateTime(now)}（${getAppWeekday(now)}，北京时间）`,
    `现居地：${formData.currentLocation || '未填写'}`,
  ];

  try {
    const solar = Solar.fromYmdHms(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      0,
    );
    const currentEightChar = solar.getLunar().getEightChar();
    base.push(
      `近期推运参考：${currentEightChar.getYear()}年、${currentEightChar.getMonth()}月、${currentEightChar.getDay()}日、${currentEightChar.getTime()}时`,
    );
  } catch (error) {
    console.warn('Recent fortune context failed:', error);
  }

  return `${base.join('；')}。若用户询问最近、今日、本周、本月或今年运势，请结合命主原局与当前流年、流月、流日、流时来推断；若问题与近期运势无关，不要生硬提时间。`;
};

// ShenSha Calculation Helper
function calculateShenSha(bazi: { yearGan: string, yearZhi: string, monthGan: string, monthZhi: string, dayGan: string, dayZhi: string, timeGan: string, timeZhi: string }) {
  const { yearGan, yearZhi, monthGan, monthZhi, dayGan, dayZhi, timeGan, timeZhi } = bazi;
  const pillars = [
    { name: '年柱', gan: yearGan, zhi: yearZhi },
    { name: '月柱', gan: monthGan, zhi: monthZhi },
    { name: '日柱', gan: dayGan, zhi: dayZhi },
    { name: '时柱', gan: timeGan, zhi: timeZhi }
  ];

  const shensha: Record<string, string[]> = {
    '年柱': [],
    '月柱': [],
    '日柱': [],
    '时柱': []
  };

  const addSha = (pillarName: string, sha: string) => {
    if (!shensha[pillarName].includes(sha)) {
      shensha[pillarName].push(sha);
    }
  };

  const tianYi: Record<string, string[]> = { '甲': ['丑', '未'], '戊': ['丑', '未'], '庚': ['丑', '未'], '乙': ['子', '申'], '己': ['子', '申'], '丙': ['亥', '酉'], '丁': ['亥', '酉'], '壬': ['卯', '巳'], '癸': ['卯', '巳'], '辛': ['寅', '午'] };
  const taiJi: Record<string, string[]> = { '甲': ['子', '午'], '乙': ['子', '午'], '丙': ['卯', '酉'], '丁': ['卯', '酉'], '戊': ['辰', '戌', '丑', '未'], '己': ['辰', '戌', '丑', '未'], '庚': ['寅', '亥'], '辛': ['寅', '亥'], '壬': ['巳', '申'], '癸': ['巳', '申'] };
  const wenChang: Record<string, string> = { '甲': '巳', '乙': '午', '丙': '申', '丁': '酉', '戊': '申', '己': '酉', '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯' };
  const fuXing: Record<string, string[]> = { '甲': ['寅', '子'], '乙': ['丑', '亥'], '丙': ['子', '戌'], '丁': ['亥', '酉'], '戊': ['申'], '己': ['未'], '庚': ['午'], '辛': ['巳'], '壬': ['辰'], '癸': ['卯'] };
  const luShen: Record<string, string> = { '甲': '寅', '乙': '卯', '丙': '巳', '丁': '午', '戊': '巳', '己': '午', '庚': '申', '辛': '酉', '壬': '亥', '癸': '子' };
  // 羊刃按日干帝旺位查；部分流派只取阳干，这里保留阴干标注但按帝旺位落支。
  const yangRen: Record<string, string> = { '甲': '卯', '乙': '寅', '丙': '午', '丁': '巳', '戊': '午', '己': '巳', '庚': '酉', '辛': '申', '壬': '子', '癸': '亥' };
  const taoHua: Record<string, string> = { '申': '酉', '子': '酉', '辰': '酉', '寅': '卯', '午': '卯', '戌': '卯', '亥': '子', '卯': '子', '未': '子', '巳': '午', '酉': '午', '丑': '午' };
  const yiMa: Record<string, string> = { '申': '寅', '子': '寅', '辰': '寅', '寅': '申', '午': '申', '戌': '申', '亥': '巳', '卯': '巳', '未': '巳', '巳': '亥', '酉': '亥', '丑': '亥' };
  const huaGai: Record<string, string> = { '申': '辰', '子': '辰', '辰': '辰', '寅': '戌', '午': '戌', '戌': '戌', '亥': '未', '卯': '未', '未': '未', '巳': '丑', '酉': '丑', '丑': '丑' };
  const jiangXing: Record<string, string> = { '申': '子', '子': '子', '辰': '子', '寅': '午', '午': '午', '戌': '午', '亥': '卯', '卯': '卯', '未': '卯', '巳': '酉', '酉': '酉', '丑': '酉' };
  const jieSha: Record<string, string> = { '申': '巳', '子': '巳', '辰': '巳', '寅': '亥', '午': '亥', '戌': '亥', '亥': '申', '卯': '申', '未': '申', '巳': '寅', '酉': '寅', '丑': '寅' };
  const wangShen: Record<string, string> = { '申': '亥', '子': '亥', '辰': '亥', '寅': '巳', '午': '巳', '戌': '巳', '亥': '寅', '卯': '寅', '未': '寅', '巳': '申', '酉': '申', '丑': '申' };
  const zaiSha: Record<string, string> = { '申': '午', '子': '午', '辰': '午', '寅': '子', '午': '子', '戌': '子', '亥': '酉', '卯': '酉', '未': '酉', '巳': '卯', '酉': '卯', '丑': '卯' };
  const liuE: Record<string, string> = { '申': '卯', '子': '卯', '辰': '卯', '寅': '酉', '午': '酉', '戌': '酉', '亥': '午', '卯': '午', '未': '午', '巳': '子', '酉': '子', '丑': '子' };
  const tianDe: Record<string, string> = { '子': '巳', '丑': '庚', '寅': '丁', '卯': '申', '辰': '壬', '巳': '辛', '午': '亥', '未': '甲', '申': '癸', '酉': '寅', '戌': '丙', '亥': '乙' };
  const yueDe: Record<string, string> = { '寅': '丙', '午': '丙', '戌': '丙', '申': '壬', '子': '壬', '辰': '壬', '亥': '甲', '卯': '甲', '未': '甲', '巳': '庚', '酉': '庚', '丑': '庚' };
  const tianDeHe: Record<string, string> = { '子': '申', '丑': '乙', '寅': '壬', '卯': '巳', '辰': '丁', '巳': '丙', '午': '寅', '未': '己', '申': '戊', '酉': '亥', '戌': '辛', '亥': '庚' };
  const yueDeHe: Record<string, string> = { '寅': '辛', '午': '辛', '戌': '辛', '申': '丁', '子': '丁', '辰': '丁', '亥': '己', '卯': '己', '未': '己', '巳': '乙', '酉': '乙', '丑': '乙' };
  const deXiu: Record<string, string[]> = { '寅': ['丙', '丁', '戊', '癸'], '午': ['丙', '丁', '戊', '癸'], '戌': ['丙', '丁', '戊', '癸'], '申': ['壬', '癸', '戊', '己', '丙', '辛', '甲'], '子': ['壬', '癸', '戊', '己', '丙', '辛', '甲'], '辰': ['壬', '癸', '戊', '己', '丙', '辛', '甲'], '亥': ['甲', '乙', '丁', '壬'], '卯': ['甲', '乙', '丁', '壬'], '未': ['甲', '乙', '丁', '壬'], '巳': ['庚', '辛', '乙'], '酉': ['庚', '辛', '乙'], '丑': ['庚', '辛', '乙'] };
  const hongLuan: Record<string, string> = { '子': '卯', '丑': '寅', '寅': '丑', '卯': '子', '辰': '亥', '巳': '戌', '午': '酉', '未': '申', '申': '未', '酉': '午', '戌': '巳', '亥': '辰' };
  const tianXi: Record<string, string> = { '子': '酉', '丑': '申', '寅': '未', '卯': '午', '辰': '巳', '巳': '辰', '午': '卯', '未': '寅', '申': '丑', '酉': '子', '戌': '亥', '亥': '戌' };
  const guChen: Record<string, string> = { '亥': '寅', '子': '寅', '丑': '寅', '寅': '巳', '卯': '巳', '辰': '巳', '巳': '申', '午': '申', '未': '申', '申': '亥', '酉': '亥', '戌': '亥' };
  const guaSu: Record<string, string> = { '亥': '戌', '子': '戌', '丑': '戌', '寅': '丑', '卯': '丑', '辰': '丑', '巳': '辰', '午': '辰', '未': '辰', '申': '未', '酉': '未', '戌': '未' };
  const tianYiXing: Record<string, string> = { '寅': '丑', '卯': '寅', '辰': '卯', '巳': '辰', '午': '巳', '未': '午', '申': '未', '酉': '申', '戌': '酉', '亥': '戌', '子': '亥', '丑': '子' };

  pillars.forEach(pillar => {
    if (tianYi[dayGan]?.includes(pillar.zhi) || tianYi[yearGan]?.includes(pillar.zhi)) addSha(pillar.name, '天乙贵人');
    if (taiJi[dayGan]?.includes(pillar.zhi) || taiJi[yearGan]?.includes(pillar.zhi)) addSha(pillar.name, '太极贵人');
    if (wenChang[dayGan] === pillar.zhi || wenChang[yearGan] === pillar.zhi) addSha(pillar.name, '文昌贵人');
    if (fuXing[dayGan]?.includes(pillar.zhi) || fuXing[yearGan]?.includes(pillar.zhi)) addSha(pillar.name, '福星贵人');
    if (luShen[dayGan] === pillar.zhi) addSha(pillar.name, '禄神');
    if (yangRen[dayGan] === pillar.zhi) addSha(pillar.name, '羊刃');
    if (taoHua[yearZhi] === pillar.zhi || taoHua[dayZhi] === pillar.zhi) addSha(pillar.name, '桃花');
    if (yiMa[yearZhi] === pillar.zhi || yiMa[dayZhi] === pillar.zhi) addSha(pillar.name, '驿马');
    if (huaGai[yearZhi] === pillar.zhi || huaGai[dayZhi] === pillar.zhi) addSha(pillar.name, '华盖');
    if (jiangXing[yearZhi] === pillar.zhi || jiangXing[dayZhi] === pillar.zhi) addSha(pillar.name, '将星');
    if (jieSha[yearZhi] === pillar.zhi || jieSha[dayZhi] === pillar.zhi) addSha(pillar.name, '劫煞');
    if (wangShen[yearZhi] === pillar.zhi || wangShen[dayZhi] === pillar.zhi) addSha(pillar.name, '亡神');
    if (zaiSha[yearZhi] === pillar.zhi || zaiSha[dayZhi] === pillar.zhi) addSha(pillar.name, '灾煞');
    if (liuE[yearZhi] === pillar.zhi || liuE[dayZhi] === pillar.zhi) addSha(pillar.name, '六厄');
    if (tianDe[monthZhi] === pillar.zhi || tianDe[monthZhi] === pillar.gan) addSha(pillar.name, '天德贵人');
    if (yueDe[monthZhi] === pillar.gan) addSha(pillar.name, '月德贵人');
    if (tianDeHe[monthZhi] === pillar.gan) addSha(pillar.name, '天德合');
    if (yueDeHe[monthZhi] === pillar.gan) addSha(pillar.name, '月德合');
    if (deXiu[monthZhi]?.includes(pillar.gan)) addSha(pillar.name, '德秀贵人');
    if (tianYiXing[monthZhi] === pillar.zhi) addSha(pillar.name, '天医');
    if (hongLuan[yearZhi] === pillar.zhi) addSha(pillar.name, '红鸾');
    if (tianXi[yearZhi] === pillar.zhi) addSha(pillar.name, '天喜');
    if (guChen[yearZhi] === pillar.zhi) addSha(pillar.name, '孤辰');
    if (guaSu[yearZhi] === pillar.zhi) addSha(pillar.name, '寡宿');
  });

  return shensha;
}

export default function Bazi() {
  useTrustedTime();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { energy, setEnergy, membership, settings, setSettings, baziResult: storedBaziResult, setBaziResult, baziFormData, setBaziFormData, baziMessages, setBaziMessages, profiles, setProfiles, activeProfileId, setActiveProfileId, userName, preferredAddress } = useAppContext();
  const plusActive = isPlusActive(membership);
  const baziUnlocked = hasFeatureAccess(membership, 'bazi');
  const relationshipUnlocked = hasFeatureAccess(membership, 'relationship_report');
  const relationshipWeekUnlocked = hasFeatureAccess(membership, 'relationship_weekly');
  const userAddress = normalizeUserAddress(preferredAddress) || normalizeUserAddress(userName) || baziFormData.name || '你';
  const userAddressInstruction = buildUserAddressInstruction(preferredAddress, userName);

  const [isCalculating, setIsCalculating] = useState(false);
  const [chatInput, setChatInput, clearChatDraft] = usePersistentDraft('draft:bazi:chat', '');
  const [isChatting, setIsChatting] = useState(false);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [profileQuery, setProfileQuery] = useState('');
  const initialEditorRef = useRef(restoreBaziEditor(profiles, activeProfileId, baziFormData, settings.baziEditor));
  const editorOwnerRef = useRef<BaziEditorState>(initialEditorRef.current.editor);
  const previousActiveProfileRef = useRef(activeProfileId);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(initialEditorRef.current.editor.profileId);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [showFormValidation, setShowFormValidation] = useState(false);
  const [useRecentFortuneContext, setUseRecentFortuneContext] = useState(true);
  const [recentFortuneStatus, setRecentFortuneStatus] = useState<string | null>(null);
  const [matchAId, setMatchAId] = useState('');
  const [matchBId, setMatchBId] = useState('');
  const [relationshipExpanded, setRelationshipExpanded] = useState(false);
  const [relationshipShareStatus, setRelationshipShareStatus] = useState<string | null>(null);
  const [isCreatingInviteLink, setIsCreatingInviteLink] = useState(false);
  const [invitedProfileName, setInvitedProfileName] = useState<string | null>(null);
  const [relationshipTaskDone, setRelationshipTaskDone] = useState<Record<string, number[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem('relationshipTaskDone') || '{}');
    } catch {
      return {};
    }
  });
  const [relationshipWeekStartedAt, setRelationshipWeekStartedAt] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('relationshipWeekStartedAt') || '{}');
    } catch {
      return {};
    }
  });
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const workspaceOwnerRef = useRef(getStoredAccountSession()?.user.id || null);
  const chatRequestRef = useRef(false);
  const processedInviteRef = useRef<string | null>(null);
  const requestRevisionRef = useRef(0);
  const mountedRef = useRef(true);
  const currentProfileRef = useRef<UserProfile | null>(null);
  const activeProfile = profiles.find(profile => profile.id === activeProfileId);
  currentProfileRef.current = activeProfile && editingProfileId === activeProfile.id ? { id: activeProfile.id, ...baziFormData } : null;
  const resultStatus = editingProfileId !== activeProfileId ? storedBaziResult ? 'other-profile' : 'empty' : getBaziResultStatus(storedBaziResult, activeProfile, baziFormData);
  const baziResult: BaziResult | null = resultStatus === 'current' ? storedBaziResult : null;
  const filteredProfiles = filterBaziProfiles(profiles, profileQuery);
  const editingProfile = profiles.find(profile => profile.id === editingProfileId);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; requestRevisionRef.current += 1; };
  }, []);

  React.useEffect(() => {
    if (profiles.length >= 2) {
      setMatchAId(prev => prev || profiles[0].id);
      setMatchBId(prev => prev || profiles[1].id);
    }
  }, [profiles]);

  React.useEffect(() => {
    void writeWorkspaceStorage(workspaceOwnerRef.current, 'relationshipTaskDone', JSON.stringify(relationshipTaskDone)).catch(() => undefined);
  }, [relationshipTaskDone]);

  React.useEffect(() => {
    void writeWorkspaceStorage(workspaceOwnerRef.current, 'relationshipWeekStartedAt', JSON.stringify(relationshipWeekStartedAt)).catch(() => undefined);
  }, [relationshipWeekStartedAt]);

  React.useEffect(() => {
    const legacyPair = searchParams.get('pair');
    if (legacyPair) {
      const next = new URLSearchParams(searchParams);
      next.delete('pair');
      setSearchParams(next, { replace: true });
      setRelationshipShareStatus('旧版邀请链接已升级保护隐私，请让对方重新生成一次。');
      setRelationshipExpanded(true);
      return;
    }

    const inviteToken = searchParams.get('invite');
    if (!inviteToken || processedInviteRef.current === inviteToken) return;
    processedInviteRef.current = inviteToken;

    let cancelled = false;
    const importInvite = async () => {
      try {
        setRelationshipShareStatus('正在读取邀请档案...');
        const response = await apiFetch(`/api/relationship/invites/${encodeURIComponent(inviteToken)}`, {
          headers: { 'Cache-Control': 'no-store' },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || '邀请链接已失效。');

        const incomingValidation = validateBaziProfile(data.profile || {}, getAppDateKey(getTrustedNow()));
        if (!incomingValidation.isValid) throw new Error(`邀请档案资料无效：${incomingValidation.message}`);
        const incomingProfile: Omit<UserProfile, 'id'> = incomingValidation.value;
        if (cancelled) return;

        const existing = profiles.find(profile =>
          profile.name === incomingProfile.name &&
          profile.birthDate === incomingProfile.birthDate &&
          profile.birthTime === incomingProfile.birthTime,
        );

        if (existing) {
          setMatchAId(existing.id);
          setInvitedProfileName(existing.name);
          setRelationshipShareStatus(`${existing.name} 的档案已在这里。现在填写或选择你的档案，点“生成合盘”就能加入。`);
        } else {
          const importedProfile = {
            id: `invite-${Date.now()}`,
            ...incomingProfile,
          };
          setProfiles(prev => [...prev, importedProfile]);
          setMatchAId(importedProfile.id);
          setInvitedProfileName(incomingProfile.name);
          setRelationshipShareStatus(`${incomingProfile.name} 的档案已带入。现在填写或选择你的档案，点“生成合盘”就能加入。`);
        }

        const next = new URLSearchParams(searchParams);
        next.delete('invite');
        setSearchParams(next, { replace: true });
        setRelationshipExpanded(true);
      } catch (error: any) {
        if (!cancelled) {
          setRelationshipShareStatus(error.message || '邀请链接已失效，请让对方重新生成一次。');
          setRelationshipExpanded(true);
        }
      }
    };

    importInvite();
    return () => {
      cancelled = true;
    };
  }, [profiles, searchParams, setProfiles, setSearchParams]);

  const matchA = profiles.find(profile => profile.id === matchAId);
  const matchB = profiles.find(profile => profile.id === matchBId);
  const relationshipMatch = calculateRelationshipMatch(matchA, matchB);
  const relationshipPairKey = getRelationshipPairKey(matchA, matchB);
  const completedRelationshipTasks = relationshipPairKey ? relationshipTaskDone[relationshipPairKey] || [] : [];
  const relationshipWeekStartDate = relationshipPairKey ? relationshipWeekStartedAt[relationshipPairKey] : '';
  const relationshipWeekDay = getRelationshipWeekDay(relationshipWeekStartDate, getTrustedNow());
  const nextRelationshipTask = RELATIONSHIP_WEEK_TASKS.find(task => task.day === Math.min(7, relationshipWeekDay + 1));
  const relationshipFlowSteps = [
    { label: invitedProfileName ? `${invitedProfileName} 已带入` : '先建一份档案', done: profiles.length >= 1 },
    { label: profiles.length >= 2 ? '两份档案已就绪' : '补上第二个人', done: profiles.length >= 2 },
    { label: relationshipMatch ? '查看默契分' : '生成合盘', done: Boolean(relationshipMatch) },
  ];
  const relationshipSummary = relationshipMatch
    ? `${matchA?.name || '你'} × ${matchB?.name || 'TA'} · ${relationshipMatch.score} 分`
    : profiles.length >= 2
      ? '已保存两份档案，可以生成默契分。'
      : profiles.length === 1
        ? '再补一份 TA 的资料，就能做双人合盘。'
        : '情侣、暧昧、前任复盘都可以从这里开始。';
  const handleCopyRelationshipLink = async () => {
    const sourceProfile = matchA || profiles.find(profile => profile.id === activeProfileId) || profiles[0];
    if (!sourceProfile) {
      setRelationshipShareStatus('先保存一个档案，再生成邀请链接。');
      setRelationshipExpanded(true);
      scrollToProfileForm();
      return;
    }
    setIsCreatingInviteLink(true);
    try {
      const response = await apiFetch('/api/relationship/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: pickShareProfile(sourceProfile) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error('邀请链接生成失败，请稍后再试。');
      const inviteUrl = data.inviteUrl || `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(data.token)}`;

      if (isLocalUrl(inviteUrl)) {
        setRelationshipShareStatus('邀请功能暂不可用，请稍后再试。');
        setRelationshipExpanded(true);
        return;
      }

      const copied = await copyTextToClipboard(inviteUrl);
      setRelationshipShareStatus(
        copied
          ? '邀请链接已复制。下一步：发给 TA。TA 打开后填写自己的出生资料，就能加入这次合盘。'
          : `浏览器暂时不允许自动复制，请手动复制这段链接发给 TA：${inviteUrl}`,
      );
      setRelationshipExpanded(true);
    } catch (error: any) {
      const message = typeof error?.message === 'string' && /[\u4e00-\u9fff]/.test(error.message)
        ? error.message
        : '邀请链接生成失败，请稍后再试。';
      setRelationshipShareStatus(message);
      setRelationshipExpanded(true);
    } finally {
      setIsCreatingInviteLink(false);
    }
  };

  const openRelationshipPayment = () => {
    navigate('/app/profile?plus=1&plan=bazi_full_archive');
  };

  const openRelationshipWeekPayment = () => {
    navigate('/app/profile?plus=1&plan=bazi_full_archive');
  };

  const openCouplePlusPayment = () => {
    navigate('/app/profile?plus=1&plan=couple_plus_monthly');
  };

  const toggleRelationshipTask = (day: number) => {
    if (!relationshipPairKey || !relationshipWeekUnlocked) return;
    if (day > relationshipWeekDay) return;
    setRelationshipTaskDone(prev => {
      const current = prev[relationshipPairKey] || [];
      const next = current.includes(day) ? current.filter(item => item !== day) : [...current, day];
      return { ...prev, [relationshipPairKey]: next };
    });
  };

  React.useEffect(() => {
    if (!relationshipWeekUnlocked || !relationshipPairKey || relationshipWeekStartedAt[relationshipPairKey]) return;
    setRelationshipWeekStartedAt(prev => ({ ...prev, [relationshipPairKey]: getAppDateKey(getTrustedNow()) }));
  }, [relationshipWeekUnlocked, relationshipPairKey, relationshipWeekStartedAt]);

  const openBaziPayment = () => {
    navigate('/app/profile?plus=1&plan=bazi_full_archive');
  };

  const scrollToProfileForm = () => {
    setShowProfileForm(true);
    requestAnimationFrame(() => document.getElementById('bazi-profile-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const rememberEditorOwner = (profileId: string | null, activeId: string | null) => {
    const editor = { profileId, activeProfileId: activeId };
    editorOwnerRef.current = editor;
    setSettings(previous => previous.baziEditor?.profileId === editor.profileId && previous.baziEditor?.activeProfileId === editor.activeProfileId
      ? previous : { ...previous, baziEditor: editor });
  };

  const applyRestoredEditor = (restored: ReturnType<typeof restoreBaziEditor>) => {
    requestRevisionRef.current += 1;
    setEditingProfileId(restored.editor.profileId);
    setBaziFormData(restored.form);
    currentProfileRef.current = restored.editor.profileId ? { ...restored.form, id: restored.editor.profileId } : null;
    rememberEditorOwner(restored.editor.profileId, restored.editor.activeProfileId);
    if (restored.reason === 'active-changed') {
      setBaziMessages([]);
      setRecentFortuneStatus(null);
      setFormNotice('已切换到当前档案的资料，请核对后再保存。');
      setShowProfileForm(true);
    } else if (restored.reason === 'unconfirmed-draft') {
      setFormNotice('这份旧草稿的归属尚未确认，已保留为新建草稿。保存会新增档案；要更新已有档案，请先在上方选择对应的人。');
      setShowProfileForm(true);
    }
  };

  React.useLayoutEffect(() => {
    applyRestoredEditor(initialEditorRef.current);
  }, []);

  React.useLayoutEffect(() => {
    if (previousActiveProfileRef.current === activeProfileId) return;
    previousActiveProfileRef.current = activeProfileId;
    if (editorOwnerRef.current.activeProfileId === activeProfileId) return;
    applyRestoredEditor(restoreBaziEditor(profiles, activeProfileId, baziFormData, editorOwnerRef.current));
  }, [activeProfileId, profiles]);

  const selectProfileForEdit = (profile: UserProfile) => {
    requestRevisionRef.current += 1;
    currentProfileRef.current = profile;
    setActiveProfileId(profile.id);
    setEditingProfileId(profile.id);
    rememberEditorOwner(profile.id, profile.id);
    setBaziFormData(pickShareProfile(profile));
    setShowFormValidation(false);
    setFormNotice(null);
    setShowProfileForm(true);
    if (profile.id !== activeProfileId) setBaziMessages([]);
  };

  const startNewProfile = () => {
    requestRevisionRef.current += 1;
    currentProfileRef.current = null;
    setActiveProfileId(null);
    setEditingProfileId(null);
    rememberEditorOwner(null, null);
    setBaziFormData({ name: '', gender: 'male', birthDate: '', birthTime: '', birthLocation: '', currentLocation: '' });
    setBaziMessages([]);
    setShowFormValidation(false);
    setFormNotice('正在新建档案，保存后会新增一份，不会覆盖已有档案。');
    setShowProfileForm(true);
  };

  React.useEffect(() => {
    const requestedProfileId = searchParams.get('profile');
    const requestedNew = searchParams.get('new') === '1';
    if (!requestedProfileId && !requestedNew) return;
    if (requestedNew) startNewProfile();
    else {
      const requestedProfile = profiles.find(profile => profile.id === requestedProfileId);
      if (requestedProfile) selectProfileForEdit(requestedProfile);
      else {
        setFormNotice('这份档案已不存在。请选择已有档案，或新建一份。');
        setShowProfileForm(true);
      }
    }
    const next = new URLSearchParams(searchParams);
    next.delete('profile');
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, profiles, setSearchParams]);

  const maxBirthDate = getAppDateKey(getTrustedNow());
  const formValidation = validateBaziProfile(baziFormData, maxBirthDate);
  const fieldError = (field: BaziProfileField) =>
    showFormValidation || Boolean(baziFormData[field]) ? formValidation.errors[field] : undefined;
  const updateFormField = (field: BaziProfileField | 'gender', value: string) => {
    const next = { ...baziFormData, [field]: value };
    if (baziFormData[field] !== value) requestRevisionRef.current += 1;
    currentProfileRef.current = activeProfile && editingProfileId === activeProfile.id ? { ...next, id: activeProfile.id } : null;
    setBaziFormData(next);
    setFormNotice(null);
  };

  const upsertProfileFromForm = (silent = false) => {
    if (editorOwnerRef.current.activeProfileId !== activeProfileId || editorOwnerRef.current.profileId !== editingProfileId) {
      applyRestoredEditor(restoreBaziEditor(profiles, activeProfileId, baziFormData, editorOwnerRef.current));
      setFormNotice('档案选择发生了变化，已重新确认资料归属。请核对后再保存。');
      return null;
    }
    const validation = validateBaziProfile(baziFormData, getAppDateKey(getTrustedNow()));
    setShowFormValidation(true);
    if (!validation.isValid) {
      setFormNotice(validation.message);
      return null;
    }

    const payload = validation.value;
    setBaziFormData(payload);
    try {
      const saved = saveBaziProfile(profiles, payload, editingProfileId, createRecordId('profile'));
      requestRevisionRef.current += 1;
      currentProfileRef.current = saved.profile;
      setProfiles(prev => saveBaziProfile(prev, payload, editingProfileId, saved.profile.id).profiles);
      setActiveProfileId(saved.profile.id);
      setEditingProfileId(saved.profile.id);
      rememberEditorOwner(saved.profile.id, saved.profile.id);
      if (saved.changed) {
        setBaziResult(null);
        setBaziMessages([]);
        setRecentFortuneStatus(null);
      }
      if (!silent) setFormNotice(saved.created
        ? `${payload.name} 的新档案已保存，已有档案未改动。可以选择两份档案做关系合盘。`
        : saved.changed ? `${payload.name} 的资料已更新，旧排盘和追问已失效，请重新推演。` : `${payload.name} 的档案已保存，资料没有变化。`);
      return saved.profile;
    } catch (error) {
      setFormNotice(error instanceof Error ? error.message : '档案保存未完成，请重新选择档案。');
      return null;
    }
  };

  const handleSaveProfileOnly = () => {
    upsertProfileFromForm(false);
  };

  React.useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [baziMessages]);

  const handleCalculate = async () => {
    if (isCalculating) return;
    const validation = validateBaziProfile(baziFormData, getAppDateKey(getTrustedNow()));
    setShowFormValidation(true);
    if (!validation.isValid) {
      setFormNotice(validation.message);
      return;
    }
    if (!baziUnlocked) {
      setFormNotice("完整八字推演需要先解锁命理档案。你也可以先保存两个人档案，免费看看关系默契分。");
      return;
    }
    if (!plusActive && energy <= 0) {
      setFormNotice("能量不够了。先补充能量再推演，已经填写的资料不会丢。");
      return;
    }
    setFormNotice(null);

    const calculationProfile = upsertProfileFromForm(true);
    if (!calculationProfile) return;
    const calculationRequest = createBaziRequestSnapshot(calculationProfile, requestRevisionRef.current);
    const calculationIsCurrent = () => mountedRef.current && isBaziRequestCurrent(calculationRequest, currentProfileRef.current, requestRevisionRef.current);

    setIsCalculating(true);
    setBaziResult(null);
    setBaziMessages([]);
    if (!plusActive) {
      setEnergy(prev => prev - 1);
    }

    try {
      const [yearStr, monthStr, dayStr] = validation.value.birthDate.split('-');
      const [hourStr, minuteStr] = validation.value.birthTime.split(':');

      const solar = Solar.fromYmdHms(
        parseInt(yearStr),
        parseInt(monthStr),
        parseInt(dayStr),
        parseInt(hourStr),
        parseInt(minuteStr),
        0
      );
      const lunar = solar.getLunar();
      const baZi = lunar.getEightChar();

      const exactBazi = {
        year: [baZi.getYearGan(), baZi.getYearZhi()] as [string, string],
        month: [baZi.getMonthGan(), baZi.getMonthZhi()] as [string, string],
        day: [baZi.getDayGan(), baZi.getDayZhi()] as [string, string],
        hour: [baZi.getTimeGan(), baZi.getTimeZhi()] as [string, string]
      };

      const weightedMetrics = buildWeightedBaziMetrics(baZi);
      const exactElements = weightedMetrics.elements;
      const exactTenGods = weightedMetrics.tenGods;

      // Calculate ShenSha precisely
      const shenshaData = calculateShenSha({
        yearGan: baZi.getYearGan(), yearZhi: baZi.getYearZhi(),
        monthGan: baZi.getMonthGan(), monthZhi: baZi.getMonthZhi(),
        dayGan: baZi.getDayGan(), dayZhi: baZi.getDayZhi(),
        timeGan: baZi.getTimeGan(), timeZhi: baZi.getTimeZhi()
      });

      const exactBaziStr = `年柱：${baZi.getYear()}，月柱：${baZi.getMonth()}，日柱：${baZi.getDay()}，时柱：${baZi.getTime()}
五行分布：${JSON.stringify(exactElements)}
十神分布：${JSON.stringify(exactTenGods)}
神煞分布：
年柱神煞：${shenshaData['年柱'].join('、') || '无'}
月柱神煞：${shenshaData['月柱'].join('、') || '无'}
日柱神煞：${shenshaData['日柱'].join('、') || '无'}
时柱神煞：${shenshaData['时柱'].join('、') || '无'}`;

      const prompt = `用户姓名：${validation.value.name}
性别：${validation.value.gender === 'male' ? '男' : '女'}
出生日期（公历）：${validation.value.birthDate}
出生时间：${validation.value.birthTime}
出生地：${validation.value.birthLocation}
现居地：${validation.value.currentLocation}

【重要：我已经为你计算了该用户的八字、加权五行、加权十神和神煞。五行与十神包含天干、地支藏干、月令权重，不是简单八字等分；请务必严格基于此数据进行推演，绝不能自己瞎算！】
精确八字与神煞：
${exactBaziStr}

请你扮演一位精通中国传统命理、八字排盘的国学大师。请根据上述精确八字和神煞，进行八字排盘和命理分析。
必须返回合法的JSON格式，结构如下：
{
  "pattern": {
    "name": "格局名称（必须是传统八字标准格局，如：正官格、七杀格、正印格、偏印格、食神格、伤官格、正财格、偏财格、建禄格、羊刃格、杂气伤官格等，绝不能用长句描述）",
    "description": "格局简述（一句话描述该格局的特点）"
  },
  "wuxing": {
    "strength": "身强/身弱",
    "favorable": ["喜用神1", "喜用神2"],
    "luckyColors": ["颜色1", "颜色2"],
    "luckyDirections": ["方位1", "方位2"],
    "luckyNumbers": [数字1, 数字2]
  },
  "shensha": [
    { "category": "吉神相助", "items": ["吉神1", "吉神2"] },
    { "category": "凶煞警惕", "items": ["凶煞1", "凶煞2"] },
    { "category": "其他神煞", "items": ["其他神煞1", "其他神煞2"] }
  ],
  "dailyLuck": {
    "score": 85,
    "summary": "今日运势简述（50字左右）",
    "luckyHours": "吉时（如：辰时 07:00-09:00）"
  },
  "personality": "性格特质分析（100字左右）",
  "career": "近期事业/学业运势预测（100字左右）",
  "romance": "感情运势预测（100字左右）"
}
注意：
1. 神煞部分【必须完全使用我提供的精确神煞数据】，将其分类为“吉神相助”、“凶煞警惕”、“其他神煞”三类，【一个都不能漏掉】！绝对不能自己编造或遗漏。
2. 请严格按照上述 JSON 结构返回，不要包含任何其他文字或Markdown标记。`;

      const fallbackInterpretation: Partial<BaziResult> = {
        pattern: {
          name: `${weightedMetrics.strength}参考盘`,
          description: '精确排盘已完成，智能格局文字暂时不稳定，先以五行、十神和神煞结果作为参考。',
        },
        wuxing: {
          strength: weightedMetrics.strength,
          favorable: weightedMetrics.favorable,
          luckyColors: weightedMetrics.luckyColors,
          luckyDirections: weightedMetrics.luckyDirections,
          luckyNumbers: weightedMetrics.luckyNumbers,
          elements: exactElements,
        },
        shensha: Object.entries(shenshaData).map(([category, items]) => ({
          category,
          items: items.length ? items : ['无明显神煞'],
        })),
        dailyLuck: {
          score: 60,
          summary: '智能流日文字暂时不稳定。今天先看一个现实动作：把最耗神的事拆成 10 分钟能开始的一步。',
          luckyHours: '以实际作息为准',
        },
        personality: '精确排盘已保留。保底解读先看结构：日主、五行权重和十神分布比单一断语更值得参考。',
        career: '事业或学业先不做绝对判断。今天适合选一个能验证的小动作，避免把长期压力一次压到自己身上。',
        romance: '关系判断先看互动事实，不急着下命定结论。先观察对方是否有稳定回应，再决定下一步。',
      };
      let aiText = "";
      let usedPartialBaziFallback = false;

      try {
        const res = await apiFetch('/api/deepseek/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: DEEPSEEK_TEXT_MODEL,
            temperature: 0.1,
            max_tokens: DEEPSEEK_MAX_TOKENS.baziCalculation,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: '你是一位精通八字命理的国学大师。请务必返回合法的JSON对象。' },
              { role: 'user', content: prompt }
            ]
          })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error?.message || '八字推演请求失败');
        const aiContent = data.choices?.[0]?.message?.content;
        if (!aiContent) throw new Error('八字推演返回为空');
        aiText = aiContent;
      } catch (err) {
        console.error("DeepSeek Error:", err);
        aiText = JSON.stringify(fallbackInterpretation);
        usedPartialBaziFallback = true;
      }

      let parsedResult: Partial<BaziResult>;
      try {
        parsedResult = parseAiJson<Partial<BaziResult>>(aiText);
      } catch (parseError) {
        console.error("Bazi JSON Parse Error:", parseError);
        parsedResult = fallbackInterpretation;
        usedPartialBaziFallback = true;
      }

      // Merge exact calculations with LLM interpretations
      const finalResult: BaziResult = {
        profileId: calculationProfile.id,
        birthFingerprint: getBaziBirthFingerprint(calculationProfile),
        profileSnapshot: pickShareProfile(calculationProfile),
        bazi: exactBazi,
        pattern: parsedResult.pattern,
        wuxing: {
          ...parsedResult.wuxing,
          strength: weightedMetrics.strength,
          favorable: weightedMetrics.favorable,
          luckyColors: weightedMetrics.luckyColors,
          luckyDirections: weightedMetrics.luckyDirections,
          luckyNumbers: weightedMetrics.luckyNumbers,
          elements: exactElements
        },
        tenGods: exactTenGods,
        shensha: parsedResult.shensha,
        dailyLuck: parsedResult.dailyLuck,
        personality: parsedResult.personality,
        career: parsedResult.career,
        romance: parsedResult.romance,
        ...createGenerationTrace('bazi_calculation', {
          model: DEEPSEEK_TEXT_MODEL,
          usedFallback: usedPartialBaziFallback,
        }),
      };

      if (!calculationIsCurrent()) return;
      setBaziResult(finalResult);
      setShowProfileForm(false);
      setBaziMessages([{
        id: createRecordId('bazi'),
        role: 'ai',
        text: `你好，${userAddress}。我已经为你排好了八字。关于这份命理档案，有什么想进一步了解的吗？`,
        timestamp: Date.now(),
        ...createGenerationTrace('bazi_calculation', {
          model: 'system',
          usedFallback: false,
        }),
      }]);
      if (usedPartialBaziFallback) setFormNotice(SERVICE_FALLBACK.baziPartial);
    } catch (error: any) {
      console.error("Bazi Calculation Error:", error);
      if (calculationIsCurrent()) setFormNotice(getPublicServiceError(error, SERVICE_FALLBACK.baziCalculation));
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSendMessage = async () => {
    if (isChatting || chatRequestRef.current || !chatInput.trim() || !baziResult) return;
    if (!baziUnlocked) {
      setFormNotice('完整八字档案需要先解锁。解锁后可以继续查看排盘，并向大师追问近期运势。');
      openBaziPayment();
      return;
    }

    chatRequestRef.current = true;
    const chatProfile = currentProfileRef.current;
    if (!chatProfile) { chatRequestRef.current = false; return; }
    const chatRequest = createBaziRequestSnapshot(chatProfile, requestRevisionRef.current);
    const chatIsCurrent = () => mountedRef.current && isBaziRequestCurrent(chatRequest, currentProfileRef.current, requestRevisionRef.current);
    const newUserMsg = {
      id: createRecordId('bazi'),
      role: 'user' as const,
      text: chatInput,
      timestamp: Date.now()
    };

    setBaziMessages(prev => [...prev, newUserMsg]);
    clearChatDraft('');
    setIsChatting(true);
    const recentFortuneContext = useRecentFortuneContext ? buildRecentFortuneContext(baziFormData) : '未启用近期时间参考，只按命主原局和既有排盘回答。';
    setRecentFortuneStatus(
      useRecentFortuneContext ? '本次会参考当前日期、现居地与流年流月流日来推最近运势。' : null,
    );

    try {
      let usedFallbackChat = false;
      const contextPrompt = `你是一位精通八字命理的国学大师，正在与缘主面对面交流。
用户八字排盘结果如下：
${JSON.stringify(baziResult, null, 2)}

${userAddressInstruction}

提问时的近期时间参考：
${recentFortuneContext}

请根据上述八字信息，回答用户的提问。
【重要要求】：
1. 语气要专业、神秘、温和，充满人文关怀，就像一位真正的国学大师在面对面解惑。
2. 绝对不要使用任何 Markdown 格式（如 **加粗**、# 标题、* 列表等），请使用纯文本格式，段落之间用换行分隔即可。
3. 绝对不要说“作为AI”、“根据提供的数据”等暴露人工智能身份的词语，要完全沉浸在大师的角色中。
4. 如果用户问“最近运势”“今天如何”“这个月怎么样”“近期事业/感情”等问题，请重点结合近期时间参考与命主原局推断未来 7 到 30 天的走势，并给出可执行建议。

用户的问题是：${chatInput}`;

      let aiText = "";
      try {
        const res = await apiFetch('/api/deepseek/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: DEEPSEEK_TEXT_MODEL,
            isInternetMode: useRecentFortuneContext,
            max_tokens: DEEPSEEK_MAX_TOKENS.baziChat,
            messages: [
              { role: 'system', content: '你是一位精通八字命理的国学大师。' },
              ...baziMessages.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
              { role: 'user', content: contextPrompt }
            ]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        aiText = data.choices[0].message.content;
      } catch (err) {
        console.error("DeepSeek Error:", err);
        aiText = SERVICE_FALLBACK.baziChat;
        usedFallbackChat = true;
      }

      // Clean up any residual markdown
      aiText = aiText.replace(/\*\*/g, '').replace(/#/g, '');

      if (!chatIsCurrent()) return;
      setBaziMessages(prev => [...prev, {
        id: createRecordId('bazi'),
        role: 'ai',
        text: aiText,
        timestamp: Date.now(),
        ...createGenerationTrace('bazi_chat', {
          model: DEEPSEEK_TEXT_MODEL,
          usedFallback: usedFallbackChat,
        }),
      }]);

    } catch (error) {
      console.error("Chat Error:", error);
      if (!chatIsCurrent()) return;
      setBaziMessages(prev => [...prev, {
        id: createRecordId('bazi'),
        role: 'ai',
        text: SERVICE_FALLBACK.baziChat,
        timestamp: Date.now(),
        ...createGenerationTrace('bazi_chat', {
          model: DEEPSEEK_TEXT_MODEL,
          usedFallback: true,
        }),
      }]);
    } finally {
      chatRequestRef.current = false;
      setIsChatting(false);
    }
  };

  return (
    <div className="rail-page">
      <PageHeader eyebrow="个人档案与关系" title="生辰八字" description="从生辰资料出发，阅读你的性格、节奏与关系线索。" />
      <div className="rail-page-content min-w-0 space-y-6">
        <section className="rail-panel min-w-0" aria-labelledby="bazi-archives-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="bazi-archives-title" className="rail-section-title">我的生辰档案</h2>
              <p className="rail-muted mt-1">已保存 {profiles.length} 份。选择要编辑的人，或单独新建一份。</p>
            </div>
            <button type="button" className="rail-button-secondary" onClick={startNewProfile}><Plus size={16} aria-hidden="true" />新建档案</button>
          </div>
          {profiles.length > 0 && <>
            <label htmlFor="bazi-profile-search" className="mt-4 block text-[13px] text-apple-text-muted">查找档案</label>
            <div className="relative mt-2">
              <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-apple-text-muted" />
              <input id="bazi-profile-search" type="search" value={profileQuery} onChange={event => setProfileQuery(event.target.value)} placeholder="称呼、出生日期或地点" className="rail-field w-full pl-10" />
            </div>
            <p role="status" className="mt-2 text-[13px] text-apple-text-muted">找到 {filteredProfiles.length} 份档案{activeProfile ? ` · 当前：${activeProfile.name}` : ' · 正在新建'}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {filteredProfiles.map(profile => <button key={profile.id} type="button" onClick={() => selectProfileForEdit(profile)} aria-pressed={activeProfileId === profile.id} className={cn('min-w-0 rounded-2xl border p-3 text-left', activeProfileId === profile.id ? 'border-apple-gold/40 bg-apple-gold/10' : 'border-apple-border bg-apple-surface hover:bg-apple-surface-hover')}>
                <span className="flex items-center justify-between gap-2 text-[15px] font-medium text-apple-text"><span className="min-w-0 break-words">{profile.name}</span><Pencil size={15} aria-hidden="true" className="shrink-0 text-apple-text-muted" /></span>
                <span className="mt-1 block text-[13px] leading-6 text-apple-text-muted">{profile.birthDate} {profile.birthTime}</span>
                <span className="block break-words text-[13px] leading-6 text-apple-text-muted">出生：{profile.birthLocation} · 现居：{profile.currentLocation}</span>
                <span className="mt-2 block text-[13px] text-apple-text-muted">{activeProfileId === profile.id ? '编辑当前档案' : '打开并编辑'}</span>
              </button>)}
            </div>
            {filteredProfiles.length === 0 && <div className="mt-3 rounded-2xl border border-dashed border-apple-border p-5 text-center">
              <p className="text-[15px] text-apple-text">没有找到匹配的档案</p>
              <p className="rail-muted mt-1">试试称呼、完整出生日期或城市，也可以新建档案。</p>
              <button type="button" onClick={() => setProfileQuery('')} className="rail-button-secondary mt-3">清除搜索</button>
            </div>}
          </>}
          {profiles.length === 0 && <p className="rail-muted mt-4">先保存自己的资料。再新建第二个人的档案，就能做关系合盘。</p>}
        </section>
        {storedBaziResult && resultStatus !== 'current' && <div role="status" className="rounded-2xl border border-apple-border bg-apple-surface p-4">
          <p className="text-[15px] font-medium text-apple-text">{resultStatus === 'legacy' ? '这份旧排盘需要重新确认归属' : resultStatus === 'changed' ? '资料已变化，旧排盘暂不可用' : '当前档案尚未排盘'}</p>
          <p className="rail-muted mt-2">{resultStatus === 'legacy' ? '旧存档没有记录对应档案和生辰快照。请确认下面的资料后重新推演，再继续追问。' : '排盘和追问只用于生成时的那份资料。保存当前资料并重新推演后，可以继续查看解读。'}</p>
          <button type="button" onClick={scrollToProfileForm} className="rail-button-secondary mt-3">核对资料并重新推演</button>
        </div>}
        <section className="rail-panel w-full max-w-full overflow-hidden">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-400/14 text-rose-600 dark:text-rose-400">
                <Heart size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="rail-section-title">双人关系合盘</h2>
                <p className="mt-1 text-[13px] leading-5 text-apple-text-muted">免费先看默契分，完整报告适合两个人一起看。</p>
              </div>
            </div>
            {relationshipMatch && (
              <div className="shrink-0 rounded-full border border-apple-gold/18 bg-apple-gold/10 px-3 py-1 text-[13px] font-semibold text-apple-gold">
                {relationshipMatch.score} 分
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setRelationshipExpanded(prev => !prev)}
            className="flex w-full min-w-0 items-center justify-between gap-3 rounded-[24px] border border-apple-border bg-apple-surface px-3 py-3 text-left transition-all active:scale-[0.99]"
            aria-expanded={relationshipExpanded}
            aria-controls="relationship-detail"
          >
            <span className="min-w-0 truncate text-[13px] font-medium text-apple-text-muted">{relationshipSummary}</span>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-apple-surface-hover px-2.5 py-1 text-[13px] font-semibold text-apple-text-muted">
              {relationshipExpanded ? '收起' : '展开'}
              <ChevronDown size={13} className={cn('transition-transform', relationshipExpanded && 'rotate-180')} />
            </span>
          </button>

          <AnimatePresence initial={false}>
            {relationshipExpanded && (
              <motion.div
                key="relationship-body" id="relationship-detail"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="pt-4">

          <div className="mb-4 grid grid-cols-3 gap-2">
            {relationshipFlowSteps.map((step, index) => (
              <div
                key={step.label}
                className={cn(
                  'rounded-2xl border px-2 py-2 text-center text-[13px] font-semibold leading-tight',
                  step.done
                    ? 'border-apple-gold/24 bg-apple-gold/12 text-apple-gold'
                    : 'border-apple-border bg-apple-surface text-apple-text-muted',
                )}
              >
                <div className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-apple-surface-hover">
                  {step.done ? <Check size={12} /> : index + 1}
                </div>
                <div className="min-h-[24px]">{step.label}</div>
              </div>
            ))}
          </div>

          {profiles.length >= 2 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="选择第一位关系档案"
                  value={matchAId}
                  onChange={event => setMatchAId(event.target.value)}
                  className="rail-field min-w-0"
                >
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
                <select aria-label="选择第二位关系档案"
                  value={matchBId}
                  onChange={event => setMatchBId(event.target.value)}
                  className="rail-field min-w-0"
                >
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
              </div>

              {relationshipMatch ? (
                <div className="rounded-[20px] border border-apple-border bg-apple-surface p-3">
                  <div className="grid grid-cols-[96px_1fr] gap-3">
                    <div
                      className="relative h-24 w-24 rounded-full p-1"
                      style={{ background: `conic-gradient(var(--app-gold) ${relationshipMatch.score * 3.6}deg, rgba(116,105,94,0.18) 0deg)` }}
                    >
                      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-apple-surface">
                        <div className="text-2xl font-semibold text-apple-gold">{relationshipMatch.score}</div>
                        <div className="text-[13px] font-medium text-apple-text-muted">默契分</div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-apple-text">{relationshipMatch.label}</div>
                        <div className="rounded-full bg-apple-gold/10 px-2 py-0.5 text-[13px] font-semibold text-apple-gold">
                          {relationshipMatch.branches}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {relationshipMatch.reasons.map((reason) => (
                          <span key={reason} className="rounded-full border border-apple-border bg-apple-surface px-2 py-1 text-[13px] font-medium text-apple-text-muted">
                            {reason}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-[13px] leading-relaxed text-apple-text-muted">{relationshipMatch.advice}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {relationshipMatch.metrics.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-apple-border bg-apple-surface px-3 py-2">
                        <div className="mb-1 flex items-center justify-between text-[13px]">
                          <span className="font-semibold text-apple-text">{item.label}</span>
                          <span className="text-apple-text-muted">{item.hint}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#d9cbb7]">
                          <div className="h-full rounded-full bg-apple-gold" style={{ width: `${item.value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-apple-border bg-apple-surface p-3 text-[13px] text-apple-text-muted">
                  请选择两个不同档案。
                </div>
              )}
              {relationshipMatch && (
                <div className="rounded-[20px] border border-apple-gold/18 bg-apple-gold/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold text-apple-text">完整关系报告</div>
                      <div className="mt-1 text-[13px] leading-relaxed text-apple-text-muted">
                        吸引点、冲突雷区、沟通方式和关系时间线。
                      </div>
                    </div>
                    {!relationshipUnlocked && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-apple-surface-hover text-apple-gold">
                        <LockKeyhole size={17} />
                      </div>
                    )}
                  </div>

                  {relationshipUnlocked ? (
                    <div className="mt-3 grid gap-2">
                      {[
                        ['相处甜点', relationshipMatch.report.sweetSpot],
                        ['冲突雷区', relationshipMatch.report.conflict],
                        ['沟通方式', relationshipMatch.report.language],
                        ['7 日小任务', relationshipMatch.report.task],
                      ].map(([title, content]) => (
                        <div key={title} className="rounded-2xl border border-apple-border bg-apple-surface p-3">
                          <div className="text-[13px] font-semibold text-apple-gold">{title}</div>
                          <div className="mt-1 text-[13px] leading-relaxed text-apple-text-muted">{content}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 overflow-hidden rounded-2xl border border-apple-border bg-apple-surface p-3">
                      <div className="mb-3 rounded-2xl border border-apple-gold/16 bg-apple-gold/10 p-3">
                        <div className="text-[13px] font-semibold text-apple-gold">免费预览</div>
                        <p className="mt-1 text-[13px] leading-relaxed text-apple-text-muted">
                          {getRelationshipPreview(relationshipMatch.report.sweetSpot)}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-[13px] text-apple-text-muted">
                        {['TA 的安全感', '吵架雷区', '7 日任务'].map((item) => (
                          <div key={item} className="rounded-2xl border border-apple-border bg-apple-surface px-2 py-2">
                            <div className="font-semibold text-apple-text">{item}</div>
                            <div>待解锁</div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={openRelationshipPayment}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-apple-text py-3 text-[15px] font-semibold text-apple-bg"
                      >
                        <Sparkles size={16} />
                        解锁完整档案包 ¥19.9
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyRelationshipLink}
                    disabled={isCreatingInviteLink}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-apple-border bg-apple-surface py-2.5 text-[13px] font-medium text-apple-text-muted"
                  >
                    <Link2 size={14} />
                    {isCreatingInviteLink ? '正在生成...' : '邀请 TA 加入这次合盘'}
                  </button>
                  <RelationshipInviteGuide compact />
                  {relationshipShareStatus && (
                    <div className="mt-2 rounded-2xl bg-apple-gold/10 px-3 py-2 text-center text-[13px] leading-relaxed text-apple-gold">{relationshipShareStatus}</div>
                  )}
                </div>
              )}
              {relationshipMatch && (
                <div className="rounded-[20px] border border-apple-border bg-apple-surface p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold text-apple-text">关系时间线</div>
                      <div className="mt-1 text-[13px] text-apple-text-muted">把这段关系从一次心动变成可回看的记录。</div>
                    </div>
                    {!relationshipUnlocked && <LockKeyhole size={16} className="text-apple-text-muted" />}
                  </div>
                  <div className="space-y-2">
                    {[
                      ['已建双人档案', `${matchA?.name || '你'} × ${matchB?.name || 'TA'}`],
                      ['完成默契速配', `${relationshipMatch.score} 分 · ${relationshipMatch.label}`],
                      ['下一步观察', relationshipUnlocked ? relationshipMatch.report.language : getRelationshipPreview(relationshipMatch.report.language)],
                    ].map(([title, content], index) => (
                      <div key={title} className="grid grid-cols-[24px_1fr] gap-2">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-full text-[13px] font-semibold',
                            index < 2 || relationshipUnlocked ? 'bg-apple-text text-apple-bg' : 'bg-apple-surface-hover text-apple-text-muted',
                          )}>
                            {index < 2 || relationshipUnlocked ? <Check size={12} /> : <LockKeyhole size={11} />}
                          </div>
                          {index < 2 && <div className="mt-1 h-8 w-px bg-apple-border" />}
                        </div>
                        <div className="pb-2">
                          <div className="text-[13px] font-semibold text-apple-text">{title}</div>
                          <div className={cn('mt-0.5 text-[13px] leading-relaxed', index < 2 || relationshipUnlocked ? 'text-apple-text-muted' : 'text-apple-text-muted/70')}>
                            {content}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!relationshipUnlocked && (
                    <button
                      type="button"
                      onClick={openRelationshipPayment}
                      className="mt-2 w-full rounded-full border border-apple-gold/22 bg-apple-gold/10 py-2.5 text-[13px] font-semibold text-apple-gold"
                    >
                      解锁完整档案包
                    </button>
                  )}
                </div>
              )}
              {relationshipMatch && (
                <div className="rounded-[20px] border border-apple-border bg-apple-surface p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold text-apple-text">7 日关系陪伴</div>
                      <div className="mt-1 text-[13px] text-apple-text-muted">
                        {relationshipWeekUnlocked ? `第 ${relationshipWeekDay} 天 · 已完成 ${completedRelationshipTasks.length}/7 天` : '每天一个低压力观察任务，适合暧昧期和磨合期。'}
                      </div>
                    </div>
                    {!relationshipWeekUnlocked && (
                      <div className="rounded-full bg-apple-gold/12 px-2 py-1 text-[13px] font-semibold text-apple-gold">档案包内</div>
                    )}
                  </div>
                  {relationshipWeekUnlocked && (
                    <div className="mb-3 rounded-2xl border border-apple-border bg-apple-surface p-3">
                      <div className="mb-2 flex items-center justify-between text-[13px] text-apple-text-muted">
                        <span>陪伴进度</span>
                        <span>{completedRelationshipTasks.length}/7</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#d9cbb7]">
                        <div
                          className="h-full rounded-full bg-apple-gold transition-all"
                          style={{ width: `${Math.round((completedRelationshipTasks.length / 7) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-2 text-[13px] leading-relaxed text-apple-text-muted">
                        {completedRelationshipTasks.length >= 7
                          ? '一周观察已完成，可以回看任务记录，判断这段关系是否让你更稳定。'
                          : nextRelationshipTask
                            ? `明天继续看「${nextRelationshipTask.title}」。`
                            : '今天先完成当前任务，别急着给关系下结论。'}
                      </div>
                    </div>
                  )}
                  <div className="grid gap-2">
                    {RELATIONSHIP_WEEK_TASKS.map((task) => {
                      const visible = relationshipWeekUnlocked ? task.day <= relationshipWeekDay : task.day <= 2;
                      const done = completedRelationshipTasks.includes(task.day);
                      return (
                        <button
                          key={task.day}
                          type="button"
                          onClick={() => toggleRelationshipTask(task.day)}
                          className={cn(
                            'rounded-2xl border p-3 text-left transition-all',
                            visible ? 'border-apple-border bg-apple-surface' : 'border-apple-border bg-apple-surface opacity-55',
                            done && 'border-apple-gold/35 bg-apple-gold/10',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <div className={cn(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
                              done ? 'bg-apple-text text-apple-bg' : 'bg-apple-surface-hover text-apple-text-muted',
                            )}>
                              {visible ? (done ? <Check size={13} /> : task.day) : <LockKeyhole size={12} />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-apple-text">
                                {visible ? task.title : relationshipWeekUnlocked ? `第 ${task.day} 天后解锁` : `第 ${task.day} 天任务`}
                              </div>
                              <div className="mt-1 text-[13px] leading-relaxed text-apple-text-muted">
                                {visible ? task.desc : relationshipWeekUnlocked ? '按天慢慢观察，不一次性把关系推到结论。' : '解锁后继续查看。'}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {!relationshipWeekUnlocked && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={openRelationshipWeekPayment}
                        className="rounded-full bg-apple-text py-2.5 text-[13px] font-semibold text-apple-bg"
                      >
                        开通完整档案
                      </button>
                      <button
                        type="button"
                        onClick={openCouplePlusPayment}
                        className="rounded-full border border-apple-border bg-apple-surface py-2.5 text-[13px] font-medium text-apple-text-muted"
                      >
                        看双人 Plus
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-apple-border bg-apple-surface p-4 text-[13px] leading-relaxed text-apple-text-muted">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                <div className="rounded-2xl border border-apple-border bg-apple-surface px-3 py-3">
                  <div className="text-[15px] font-semibold text-apple-text">{profiles[0]?.name || '你'}</div>
                  <div className="mt-1">已准备</div>
                </div>
                <Heart size={16} className="text-apple-gold" />
                <div className="rounded-2xl border border-dashed border-apple-border bg-apple-surface px-3 py-3">
                  <div className="text-[15px] font-semibold text-apple-text-muted">TA</div>
                  <div className="mt-1">待建档</div>
                </div>
              </div>
              <p className="mt-3">先给自己和想看的那个人各建一个档案。情侣、暧昧对象、前任复盘都适合从这里开始。</p>
              <RelationshipInviteGuide />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={scrollToProfileForm}
                  className="flex items-center justify-center gap-2 rounded-full bg-apple-text py-2.5 text-[13px] font-semibold text-apple-bg"
                >
                  <Sparkles size={14} />
                  去建档案
                </button>
                <button
                  type="button"
                  onClick={handleCopyRelationshipLink}
                  disabled={isCreatingInviteLink}
                  className="flex items-center justify-center gap-2 rounded-full border border-apple-gold/22 bg-apple-gold/10 py-2.5 text-[13px] font-medium text-apple-gold"
                >
                  <Link2 size={14} />
                  {isCreatingInviteLink ? '生成中' : '复制给 TA 填资料'}
                </button>
              </div>
              {relationshipShareStatus && (
                <div className="mt-2 rounded-2xl bg-apple-gold/10 px-3 py-2 text-center text-[13px] leading-relaxed text-apple-gold">{relationshipShareStatus}</div>
              )}
            </div>
          )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {baziResult && !baziUnlocked && !isCalculating && (
          <div className="rounded-[20px] border border-apple-gold/22 bg-apple-gold/[0.08] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apple-gold/14 text-apple-gold">
                <LockKeyhole size={19} />
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-apple-text">完整命理档案已上锁</div>
                <p className="mt-1 text-[13px] leading-relaxed text-apple-text-muted">
                  免费版可以保存出生资料和做关系默契分；完整排盘、用神、神煞、近期运势和大师追问需要解锁八字档案。
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openBaziPayment}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-apple-text py-3 text-[15px] font-semibold text-apple-bg active:scale-[0.99]"
            >
              <Sparkles size={17} />
              解锁八字完整档案 ¥19.9
            </button>
          </div>
        )}

        {(showProfileForm || !baziResult || !baziUnlocked) && !isCalculating && (
          <motion.div
            id="bazi-profile-form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rail-panel w-full min-w-0 overflow-hidden"
          >
            <h2 className="rail-section-title">{editingProfile ? `编辑档案：${editingProfile.name}` : '新建生辰档案'}</h2>
            <p id="bazi-form-hint" className="rail-muted mt-2">{editingProfile ? '保存会更新这份档案；资料变更后需要重新排盘。' : '保存会新增一份档案，不会覆盖已有的人。'}姓名、日期、时间和两处地点都需要填写。</p>
            <p className="rail-muted mt-2 mb-6">出生日期使用公历，时间按填写的钟表时间排盘；目前未按出生地换算时区或真太阳时。出生地用于解读参考，现居地用于近期时间参考。</p>
            <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="bazi-name" className="mb-2 flex items-center gap-2 text-[15px] font-medium text-apple-text"><User size={16} aria-hidden="true" />姓名/称呼</label>
                <input id="bazi-name" required aria-invalid={Boolean(fieldError('name'))} aria-describedby={`bazi-form-hint${fieldError('name') ? ' bazi-name-error' : ''}`}
                  type="text"
                  value={baziFormData.name}
                  onChange={e => updateFormField('name', e.target.value)}
                  placeholder="输入你的名字"
                  className="rail-field min-w-0"
                />
                <ProfileFieldError id="bazi-name-error" message={fieldError('name')} />
              </div>

              <div>
                <p id="bazi-gender-label" className="mb-2 text-[15px] font-medium text-apple-text">性别</p>
                <div className="flex min-w-0 gap-3" role="group" aria-labelledby="bazi-gender-label">
                  <button
                    aria-pressed={baziFormData.gender === 'male'}
                    onClick={() => updateFormField('gender', 'male')}
                    className={cn(
                      "min-w-0 flex-1 py-3.5 rounded-2xl border transition-all font-medium",
                      baziFormData.gender === 'male'
                        ? "bg-apple-gold/20 text-apple-gold border-apple-gold/50"
                        : "bg-apple-surface border-apple-border text-apple-text-muted"
                    )}
                  >
                    男
                  </button>
                  <button
                    aria-pressed={baziFormData.gender === 'female'}
                    onClick={() => updateFormField('gender', 'female')}
                    className={cn(
                      "min-w-0 flex-1 py-3.5 rounded-2xl border transition-all font-medium",
                      baziFormData.gender === 'female'
                        ? "bg-apple-gold/20 text-apple-gold border-apple-gold/50"
                        : "bg-apple-surface border-apple-border text-apple-text-muted"
                    )}
                  >
                    女
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="bazi-birthDate" className="mb-2 flex items-center gap-2 text-[15px] font-medium text-apple-text"><Calendar size={16} aria-hidden="true" />出生日期 (公历)</label>
                <input id="bazi-birthDate" required aria-invalid={Boolean(fieldError('birthDate'))} aria-describedby={`bazi-form-hint${fieldError('birthDate') ? ' bazi-birthDate-error' : ''}`}
                  type="date"
                  max={maxBirthDate}
                  value={baziFormData.birthDate}
                  onChange={e => updateFormField('birthDate', e.target.value)}
                  onBlur={e => updateFormField('birthDate', e.currentTarget.value)}
                  className="rail-field min-w-0"
                />
                <ProfileFieldError id="bazi-birthDate-error" message={fieldError('birthDate')} />
              </div>

              <div>
                <label htmlFor="bazi-birthTime" className="mb-2 flex items-center gap-2 text-[15px] font-medium text-apple-text"><Clock size={16} aria-hidden="true" />出生时间</label>
                <input id="bazi-birthTime" required aria-invalid={Boolean(fieldError('birthTime'))} aria-describedby={`bazi-form-hint${fieldError('birthTime') ? ' bazi-birthTime-error' : ''}`}
                  type="time"
                  value={baziFormData.birthTime}
                  onChange={e => updateFormField('birthTime', e.target.value)}
                  onBlur={e => updateFormField('birthTime', e.currentTarget.value)}
                  className="rail-field min-w-0"
                />
                <ProfileFieldError id="bazi-birthTime-error" message={fieldError('birthTime')} />
              </div>

              <div>
                <label htmlFor="bazi-birthLocation" className="mb-2 flex items-center gap-2 text-[15px] font-medium text-apple-text"><MapPin size={16} aria-hidden="true" />出生地</label>
                <input id="bazi-birthLocation" required aria-invalid={Boolean(fieldError('birthLocation'))} aria-describedby={`bazi-form-hint${fieldError('birthLocation') ? ' bazi-birthLocation-error' : ''}`}
                  type="text"
                  value={baziFormData.birthLocation}
                  onChange={e => updateFormField('birthLocation', e.target.value)}
                  placeholder="如：北京市朝阳区"
                  className="rail-field min-w-0"
                />
                <ProfileFieldError id="bazi-birthLocation-error" message={fieldError('birthLocation')} />
              </div>

              <div>
                <label htmlFor="bazi-currentLocation" className="mb-2 flex items-center gap-2 text-[15px] font-medium text-apple-text"><MapPin size={16} aria-hidden="true" />现居地</label>
                <input id="bazi-currentLocation" required aria-invalid={Boolean(fieldError('currentLocation'))} aria-describedby={`bazi-form-hint${fieldError('currentLocation') ? ' bazi-currentLocation-error' : ''}`}
                  type="text"
                  value={baziFormData.currentLocation}
                  onChange={e => updateFormField('currentLocation', e.target.value)}
                  placeholder="如：上海市浦东新区"
                  className="rail-field min-w-0"
                />
                <ProfileFieldError id="bazi-currentLocation-error" message={fieldError('currentLocation')} />
              </div>

              {formNotice && (
                <div role="status" className="md:col-span-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-[15px] leading-7 text-apple-text">
                  {formNotice}
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveProfileOnly}
                className="rail-button-secondary w-full md:col-span-2"
              >
                <Library size={18} />
                {editingProfile ? `保存 ${editingProfile.name} 的修改` : '保存新档案'}
              </button>

              {!baziUnlocked ? (
                <button
                  type="button"
                  onClick={openBaziPayment}
                  className="rail-button w-full md:col-span-2"
                >
                  <Sparkles size={18} />
                  解锁完整八字档案 ¥19.9
                </button>
              ) : !plusActive && energy <= 0 ? (
                <button
                  onClick={() => {
                    navigate('/app/profile?plus=1&plan=plus_monthly');
                  }}
                  className="rail-button w-full md:col-span-2"
                >
                  <Zap size={18} />
                  查看能量与陪伴权益
                </button>
              ) : (
                <button
                  onClick={handleCalculate}
                  disabled={isCalculating}
                  className="rail-button w-full md:col-span-2"
                >
                  <Sparkles size={18} />
                  {plusActive ? '开始推演（Plus 已包含）' : '开始推演（消耗 1 能量）'}
                </button>
              )}
            </div>
          </motion.div>
        )}

        {isCalculating && (
          <motion.div role="status" aria-label="正在推演星轨与命理"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rail-panel flex flex-col items-center justify-center py-20"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-apple-gold/20 rounded-full blur-xl animate-pulse"></div>
              <Compass className="w-16 h-16 text-apple-gold animate-spin-slow relative z-10" />
            </div>
            <p className="mt-6 text-apple-gold font-sans animate-pulse">正在推演星轨与命理...</p>
          </motion.div>
        )}

        {baziUnlocked && baziResult && !isCalculating && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {/* Bazi Chart Card */}
            <div className="rail-panel overflow-hidden relative">

              <div className="flex justify-between items-center mb-6 relative z-10">
                <h2 className="font-sans text-xl font-medium text-apple-gold flex items-center gap-2">
                  <Compass size={20} />
                  生辰排盘
                </h2>
                <button
                  onClick={scrollToProfileForm}
                  className="flex items-center gap-1 text-[15px] text-apple-text-muted hover:text-apple-gold transition-colors bg-apple-surface px-3 py-1.5 rounded-full border border-apple-border"
                >
                  <RefreshCw size={14} /> 编辑资料 / 重新推演
                </button>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-6 relative z-10">
                {[
                  { label: '年柱', data: baziResult.bazi.year },
                  { label: '月柱', data: baziResult.bazi.month },
                  { label: '日柱', data: baziResult.bazi.day },
                  { label: '时柱', data: baziResult.bazi.hour }
                ].map((col, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <div className="text-[13px] text-apple-text-muted mb-2">{col.label}</div>
                    <div className="w-full bg-apple-surface border border-apple-border rounded-2xl py-5 flex flex-col items-center gap-4">
                      <span className="font-serif text-2xl font-medium text-apple-text">{col.data[0]}</span>
                      <div className="w-6 h-px bg-apple-gold/30"></div>
                      <span className="font-serif text-2xl font-medium text-apple-text">{col.data[1]}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pattern */}
              <div className="bg-apple-surface rounded-2xl p-4 border border-apple-border relative z-10">
                <div className="flex items-start gap-3">
                  <div className="bg-apple-gold/20 text-apple-gold border border-apple-gold/30 text-[13px] font-medium px-2 py-1 rounded mt-0.5 whitespace-nowrap">格局</div>
                  <div>
                    <h3 className="rail-section-title mb-2">{baziResult.pattern.name}</h3>
                    <p className="rail-body">{baziResult.pattern.description}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Luck Card */}
            {baziResult.dailyLuck && (
              <div className="rail-panel text-apple-text relative overflow-hidden">

                <h3 className="font-sans text-lg font-semibold mb-4 flex items-center gap-2 text-apple-gold">
                  <Sparkles size={20} className="text-apple-gold" />
                  今日运势
                </h3>
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center justify-center w-20 h-20 rounded-full border-4 border-apple-gold/30 bg-apple-surface-hover">
                    <span className="text-2xl font-medium font-serif text-apple-gold">{baziResult.dailyLuck.score}</span>
                    <span className="text-[13px] opacity-80 text-apple-gold">分</span>
                  </div>
                  <div className="flex-1">
                    <p className="rail-body mb-3">{baziResult.dailyLuck.summary}</p>
                    <div className="inline-block bg-apple-surface-hover border border-apple-border px-3 py-1 rounded-lg text-[13px] text-apple-gold">
                      吉时：{baziResult.dailyLuck.luckyHours}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Wuxing & Favorable Elements */}
            <div className="rail-panel">
              <h3 className="font-sans text-lg font-semibold text-apple-gold mb-4 flex items-center gap-2">
                <Zap size={20} />
                五行强弱与喜用
              </h3>

              <div className="flex items-center gap-4 mb-6">
                <div className="bg-apple-gold/20 border border-apple-gold/30 text-apple-gold px-4 py-2 rounded-xl font-medium font-serif text-lg">
                  {baziResult.wuxing.strength}
                </div>
                <div className="flex-1 bg-apple-surface rounded-xl p-3 border border-apple-border flex items-center justify-center gap-2">
                  <span className="text-[15px] text-apple-text-muted">喜用神</span>
                  <span className="font-medium text-apple-text">{baziResult.wuxing.favorable.join('、')}</span>
                </div>
              </div>

              {/* Simple Wuxing Bars */}
              <div className="space-y-4 mt-6">
                {baziResult.wuxing.elements.map((el: any, idx: number) => {
                  const colors: Record<string, string> = {
                    '木': 'bg-[#4ADE80]',
                    '火': 'bg-[#F87171]',
                    '土': 'bg-[#FBBF24]',
                    '金': 'bg-[#9CA3AF]',
                    '水': 'bg-[#60A5FA]'
                  };

                  const getWuxingIcon = (name: string) => {
                    switch (name) {
                      case '木': return <Leaf size={24} className="text-[#4ADE80] mb-1" />;
                      case '火': return <Flame size={24} className="text-[#F87171] mb-1" />;
                      case '土': return <Mountain size={24} className="text-[#FBBF24] mb-1" />;
                      case '金': return <Gem size={24} className="text-[#9CA3AF] mb-1" />;
                      case '水': return <Waves size={24} className="text-[#60A5FA] mb-1" />;
                      default: return <Sparkles size={24} className="text-apple-text-muted mb-1" />;
                    }
                  };

                  return (
                    <div key={idx} className="flex items-center gap-3 text-[15px]">
                      <div className="w-10 flex flex-col items-center relative">
                        {getWuxingIcon(el.name)}
                        <span className="font-medium text-[13px] text-apple-text">{el.name}</span>
                        {el.isDayMaster && <span className="absolute -top-1 -right-2 text-[8px] bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">主</span>}
                      </div>
                      <div className="flex-1 h-3 bg-apple-surface rounded-full overflow-hidden border border-apple-border">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${el.percentage}%` }}
                          transition={{ duration: 1, delay: idx * 0.1 }}
                          className={cn("h-full rounded-full", colors[el.name] || 'bg-gray-400')}
                        />
                      </div>
                      <div className="w-10 text-right text-apple-text-muted font-medium">{el.percentage}%</div>
                      <div className="w-24 text-right text-[13px] leading-tight text-apple-text-muted">{el.gods}</div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="bg-apple-surface rounded-xl p-3 border border-apple-border text-center">
                  <div className="text-[13px] text-apple-text-muted mb-1">幸运颜色</div>
                  <div className="text-[15px] font-medium text-apple-text">{baziResult.wuxing.luckyColors.join(' ')}</div>
                </div>
                <div className="bg-apple-surface rounded-xl p-3 border border-apple-border text-center">
                  <div className="text-[13px] text-apple-text-muted mb-1">幸运方位</div>
                  <div className="text-[15px] font-medium text-apple-text">{baziResult.wuxing.luckyDirections.join(' ')}</div>
                </div>
                <div className="bg-apple-surface rounded-xl p-3 border border-apple-border text-center">
                  <div className="text-[13px] text-apple-text-muted mb-1">幸运数字</div>
                  <div className="text-[15px] font-medium text-apple-text">{baziResult.wuxing.luckyNumbers.join(' ')}</div>
                </div>
              </div>
            </div>

            {/* Ten Gods Chart */}
            <div className="rail-panel">
              <h3 className="font-sans text-lg font-semibold text-apple-gold mb-6 flex items-center gap-2">
                <Star size={20} />
                十神占比
              </h3>
              <div className="flex h-48 items-end gap-1 justify-between pt-4">
                {baziResult.tenGods.map((god: any, idx: number) => (
                  <div key={idx} className="flex flex-col items-center flex-1 h-full">
                    <div className="text-[13px] text-apple-text-muted mb-1">{god.percentage}%</div>
                    <div className="w-full flex-1 flex items-end justify-center relative">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(god.percentage, 2)}%` }}
                        transition={{ duration: 1, delay: idx * 0.05 }}
                        className="w-full rounded-t-md opacity-80 absolute bottom-0"
                        style={{ backgroundColor: god.color }}
                      />
                    </div>
                    <div className="text-[13px] font-medium text-apple-text mt-2" style={{ writingMode: 'vertical-rl' }}>{god.name}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Shensha */}
            <div className="rail-panel">
              <h3 className="font-sans text-lg font-semibold text-apple-gold mb-4 flex items-center gap-2">
                <Sparkles size={20} />
                神煞解析
              </h3>
              <div className="space-y-4">
                {baziResult.shensha.map((group: any, idx: number) => {
                  const isBad = group.category.includes('凶') || group.category.includes('煞') || group.category.includes('忌');
                  return (
                    <div key={idx}>
                      <div className={cn(
                        "text-[15px] font-medium mb-2 flex items-center gap-2",
                        isBad ? "text-rose-400" : "text-apple-gold"
                      )}>
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          isBad ? "bg-rose-500" : "bg-apple-gold"
                        )}></div>
                        {group.category}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.items.map((item: string, i: number) => (
                          <span key={i} className={cn(
                            "px-3 py-1.5 rounded-lg text-[15px] border",
                            isBad
                              ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                              : "bg-apple-surface border-apple-border text-apple-text"
                          )}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Analysis Cards */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <AnalysisCard
                icon={<User className="text-apple-gold" size={20} />}
                title="性格特质"
                content={baziResult.personality}
              />
              <AnalysisCard
                icon={<Briefcase className="text-apple-gold" size={20} />}
                title="事业学业"
                content={baziResult.career}
              />
              <AnalysisCard
                icon={<Heart className="text-apple-gold" size={20} />}
                title="感情运势"
                content={baziResult.romance}
              />
            </div>

            {/* Chat Interface */}
            <div className="rail-panel mt-8">
              <h3 className="font-sans text-lg font-semibold text-apple-gold mb-4 flex items-center gap-2">
                <Sparkles size={20} />
                大师解惑
              </h3>
              <button
                type="button"
                aria-pressed={useRecentFortuneContext}
                onClick={() => {
                  setUseRecentFortuneContext((value) => {
                    const next = !value;
                    if (!next) setRecentFortuneStatus(null);
                    return next;
                  });
                }}
                className={cn(
                  'mb-4 flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                  useRecentFortuneContext
                    ? 'border-apple-gold/45 bg-apple-gold/12 text-apple-text'
                    : 'border-apple-border bg-apple-surface text-apple-text-muted',
                )}
              >
                <span className="flex min-w-0 items-start gap-3">
                  <Clock size={17} className="mt-0.5 shrink-0 text-apple-gold" />
                  <span>
                    <span className="block text-[15px] font-medium">近期运势参考</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-apple-text-muted">
                      问最近、今日、本月运势时，大师会结合当前日期、现居地、流年流月流日推断。
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    'relative h-7 w-12 shrink-0 rounded-full border transition-colors',
                    useRecentFortuneContext ? 'border-apple-gold/60 bg-apple-gold/35' : 'border-apple-border bg-apple-surface-hover',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1 h-5 w-5 rounded-full bg-white transition-transform',
                      useRecentFortuneContext ? 'translate-x-5' : 'translate-x-1',
                    )}
                  />
                </span>
              </button>
              {recentFortuneStatus && (
                <div className="mb-4 rounded-2xl border border-apple-accent/20 bg-apple-accent/10 p-3 text-[13px] leading-relaxed text-apple-text-muted">
                  {recentFortuneStatus}
                </div>
              )}

              <div
                ref={chatContainerRef}
                role="log" aria-label="命理问答记录" aria-live="polite"
                className="h-64 overflow-y-auto mb-4 space-y-4 pr-2 scrollbar-thin scrollbar-thumb-[#D4AF37]/50 scrollbar-track-transparent"
              >
                {baziMessages.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[90%] rounded-2xl p-4 text-base leading-7 whitespace-pre-wrap break-words",
                      msg.role === 'user'
                        ? "bg-apple-gold/20 text-apple-gold border border-apple-gold/30 rounded-br-sm"
                        : "bg-apple-surface border border-apple-border text-apple-text rounded-bl-sm"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isChatting && (
                  <div className="flex justify-start">
                    <div className="bg-apple-surface border border-apple-border rounded-2xl rounded-bl-sm p-4 flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-apple-gold" />
                      <span className="text-[15px] text-apple-text-muted">大师正在推演...</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <input aria-label="向命理大师提问"
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (!shouldSubmitOnEnter(e.nativeEvent)) return;
                    e.preventDefault();
                    void handleSendMessage();
                  }}
                  placeholder="比如：我最近事业运怎么样？"
                  className="rail-field min-w-0 flex-1"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || isChatting}
                  className="rail-button"
                >
                  发送
                </button>
              </div>
            </div>

          </motion.div>
        )}
      </div>
    </div>
  );
}

function ProfileFieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="mt-2 text-[13px] leading-5 text-amber-700 dark:text-amber-300">{message}</p> : null;
}

function AnalysisCard({ icon, title, content }: { icon: React.ReactNode, title: string, content: string }) {
  return (
    <div className="rail-panel">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-xl bg-apple-surface border border-apple-border">
          {icon}
        </div>
        <h3 className="font-sans text-lg font-semibold text-apple-text">{title}</h3>
      </div>
      <p className="rail-reader">
        {content}
      </p>
    </div>
  );
}

function RelationshipInviteGuide({ compact = false }: { compact?: boolean }) {
  const steps = compact
    ? ['复制', '发给 TA', 'TA 打开加入']
    : ['复制链接', '微信发给 TA', 'TA 打开后补资料'];

  return (
    <div className={cn(
      'mt-3 rounded-2xl border border-apple-gold/18 bg-apple-gold/[0.07] text-apple-text-muted',
      compact ? 'p-2.5' : 'p-3',
    )}>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-apple-gold">
        <Link2 size={13} />
        邀请加入方式
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {steps.map((step, index) => (
          <div key={step} className="rounded-xl border border-apple-border bg-apple-surface px-2 py-2 text-center">
            <div className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-apple-text text-[13px] font-semibold text-apple-bg">
              {index + 1}
            </div>
            <div className="text-[13px] font-medium leading-snug text-apple-text">{step}</div>
          </div>
        ))}
      </div>
      {!compact && (
        <p className="mt-2 text-[13px] leading-relaxed">
          TA 打开链接后，会自动带入你的档案；如果微信里打不开，让 TA 点右上角用浏览器打开。
        </p>
      )}
    </div>
  );
}
