import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crown,
  Gift,
  Globe,
  History,
  Loader2,
  Lock,
  Mic,
  Moon,
  RefreshCw,
  Send,
  Shirt,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import {
  LEVEL_THRESHOLDS,
  LEVEL_TITLES,
  type CompanionMessage,
  type DiaryEntry,
  type Message,
  type SimulationHistoryEntry,
  type TarotReading,
  type UserProfile,
  useAppContext,
} from '../store';
import {
  canStartPlusTrial,
  getDailyCheckInEnergy,
  getDailyMissionEnergy,
  getMembershipLabel,
  getReadingLimit,
  isPlusActive,
  isTesterActive,
  startPlusTrial,
} from '../lib/membership';
import { buildDiaryThemeTrends, getNextBestAction, getSoftConversionTrigger, recordAppEvent } from '../lib/engagement';
import { usePersistentDraft } from '../lib/usePersistentDraft';
import { copyTextToClipboard } from '../lib/clipboard';
import { TAROT_SYSTEM_PROMPT } from '../lib/aiPrompting';

type DrawnCard = {
  name: string;
  position: '正位' | '逆位';
  image: string;
};

const TAROT_CARDS = [
  { name: '愚者', file: '0-愚者_3.png' },
  { name: '魔术师', file: '1-魔术师_2.png' },
  { name: '女祭司', file: '2-女祭司_2.png' },
  { name: '女皇', file: '3-女皇_1.png' },
  { name: '皇帝', file: '4-皇帝_1.png' },
  { name: '教皇', file: '5-教皇_3.png' },
  { name: '恋人', file: '6-恋人_4.png' },
  { name: '战车', file: '7-战车_3.png' },
  { name: '力量', file: '8-力量_1.png' },
  { name: '隐士', file: '9-隐士_2.png' },
  { name: '命运之轮', file: '10-命运之轮_3.png' },
  { name: '正义', file: '11-正义_4.png' },
  { name: '倒吊人', file: '12-倒吊人_1.png' },
  { name: '死神', file: '13-死神_4.png' },
  { name: '节制', file: '14-节制_2.png' },
  { name: '恶魔', file: '15-恶魔_4.png' },
  { name: '塔', file: '16-塔_3.png' },
  { name: '星星', file: '17-星星_4.png' },
  { name: '月亮', file: '18-月亮_4.png' },
  { name: '太阳', file: '19-太阳_4.png' },
  { name: '审判', file: '20-审判_4.png' },
  { name: '世界', file: '21-世界_4.png' },
];

const TAROT_IMAGE_PATHS = TAROT_CARDS.map((card) => `/tarot/${card.file}`);
const preloadedImages = new Set<string>();

const preloadImage = (src: string) =>
  new Promise<void>((resolve) => {
    if (!src || preloadedImages.has(src) || typeof window === 'undefined') {
      resolve();
      return;
    }

    const image = new Image();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      preloadedImages.add(src);
      resolve();
    };

    image.onload = finish;
    image.onerror = finish;
    image.decoding = 'async';
    image.src = src;
    if (image.complete) finish();
  });

const preloadImages = (sources: string[]) =>
  Promise.all(Array.from(new Set(sources)).map((src) => preloadImage(src))).then(() => undefined);

const QUICK_PROMPTS = ['今日运势', '感情指引', '事业发展', '最近的烦恼'];

const SPREADS = [
  { name: '单张指引', prompt: '帮我抽一张单张指引牌' },
  { name: '圣三角', prompt: '用圣三角牌阵看过去、现在和未来' },
  { name: '爱情十字', prompt: '用爱情十字牌阵看看这段关系' },
  { name: '事业岔路', prompt: '用事业岔路牌阵帮我判断选择' },
];

const COMPOSER_SUGGESTIONS = [
  { label: '今日运势', prompt: '今日运势' },
  { label: '恋爱十字', prompt: '用恋爱十字牌阵看看这段关系' },
  { label: '圣三角', prompt: '用圣三角牌阵看过去、现在和未来' },
  { label: '事业岔路', prompt: '用事业岔路牌阵帮我判断选择' },
];

const COMPANION_OUTFITS = [
  {
    id: 'auto',
    name: '随羁绊',
    desc: '等级到了自动换形象',
    image: '',
    minLevel: 1,
    tone: 'from-[#F4CF83]/20 to-[#B8C7FF]/20',
  },
  {
    id: 'moon',
    name: '月白初心',
    desc: '初始守护形态',
    image: '/default-pet.png',
    minLevel: 1,
    tone: 'from-white/20 to-[#B8C7FF]/20',
  },
  {
    id: 'moon-oracle',
    name: '月白神谕',
    desc: 'LV.2 解锁 · 光羽礼服',
    image: '/outfits/moon-oracle.png',
    minLevel: 2,
    tone: 'from-white/24 to-[#F4CF83]/14',
  },
  {
    id: 'star-cloak',
    name: '午夜星斗篷',
    desc: 'LV.3 解锁 · 星图斗篷',
    image: '/outfits/star-cloak.png',
    minLevel: 3,
    tone: 'from-[#7C9CFF]/22 to-[#17213A]/28',
  },
  {
    id: 'academy-tarot',
    name: '学院占星',
    desc: 'LV.4 解锁 · 占星书包',
    image: '/outfits/academy-tarot.png',
    minLevel: 4,
    tone: 'from-[#F4CF83]/16 to-[#B8C7FF]/18',
  },
  {
    id: 'glass-robe',
    name: '液态玻璃礼装',
    desc: 'LV.5 解锁 · 极光礼裙',
    image: '/outfits/glass-robe.png',
    minLevel: 5,
    tone: 'from-[#B8F7D4]/16 to-[#B8C7FF]/22',
  },
];

const PRELOAD_IMAGE_PATHS = Array.from(
  new Set([
    '/default-card.png',
    '/default-pet.png',
    '/avatar.png',
    ...TAROT_IMAGE_PATHS,
    ...COMPANION_OUTFITS.map((outfit) => outfit.image).filter(Boolean),
  ]),
);

const DRAW_ANIMATION_MIN_MS = 4800;

const getAutoCompanionOutfit = (level: number) =>
  COMPANION_OUTFITS.filter((outfit) => outfit.id !== 'auto' && outfit.minLevel <= level)
    .sort((a, b) => b.minLevel - a.minLevel)[0] ?? COMPANION_OUTFITS[1];

const PET_MURMURS = [
  '你今天的心事有点吵，我先帮你把声音调小。',
  '别急着选答案。真正卡住你的，通常是代价。',
  '我刚刚把星尘扫开一点，路还在，不算坏。',
  '今天适合问小一点的问题，答案会更准。',
  '你不用一次想明白，先把最刺的一句放桌上。',
];

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getRandomInt = (maxExclusive: number) => {
  if (maxExclusive <= 1) return 0;
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    return Math.floor(Math.random() * maxExclusive);
  }

  const bucketSize = 0x100000000;
  const limit = Math.floor(bucketSize / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  let value = 0;

  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return value % maxExclusive;
};

const shuffleTarotDeck = () => {
  const deck = [...TAROT_CARDS];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = getRandomInt(index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
};

const drawCards = (count = 1): DrawnCard[] => {
  const drawCount = Math.max(1, Math.min(count, TAROT_CARDS.length));
  const deck = shuffleTarotDeck();
  return deck.slice(0, drawCount).map((card) => ({
    name: card.name,
    position: getRandomInt(2) === 0 ? '正位' : '逆位',
    image: `/tarot/${card.file}`,
  }));
};

const formatCards = (cards: DrawnCard[]) =>
  cards.map((card) => `${card.name}（${card.position}）`).join('，');

const getDrawCount = (question: string) => {
  if (question.includes('圣三角')) return 3;
  if (question.includes('十字') || question.includes('岔路')) return 5;
  return 1;
};

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type SendMode = 'auto' | 'draw' | 'current';

const NEW_READING_KEYWORDS = [
  '抽',
  '抽牌',
  '今日运势',
  '牌阵',
  '圣三角',
  '十字',
  '岔路',
  '占卜',
  '塔罗',
  '运势',
  '感情指引',
  '事业发展',
  '最近的烦恼',
  '感情',
  '恋爱',
  '爱情',
  '复合',
  '关系',
  '事业',
  '工作',
  '财运',
  '学业',
  '考试',
  '选择',
  '要不要',
  '该不该',
  '会不会',
  '能不能',
  '适合',
  '未来',
  '桃花',
  'draw',
  'tarot',
  'spread',
];

const CURRENT_READING_KEYWORDS = [
  '解读',
  '解释',
  '展开',
  '详细',
  '继续',
  '刚才',
  '这张',
  '这几张',
  '当前',
  '上一张',
  '牌面',
  '什么意思',
  '为什么',
  '怎么办',
  '总结',
  'reading',
  'explain',
];

const includesKeyword = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));

const shouldCreateNewReading = (question: string, hasCurrentReading: boolean) => {
  if (hasCurrentReading && includesKeyword(question, CURRENT_READING_KEYWORDS)) return false;
  if (includesKeyword(question, NEW_READING_KEYWORDS)) return true;
  return !hasCurrentReading;
};

const getActiveProfile = (profiles: UserProfile[], activeProfileId: string | null) =>
  profiles.find((profile) => profile.id === activeProfileId) || profiles[0] || null;

const getBaziResultSummary = (baziResult: any | null | undefined) => {
  if (!baziResult || typeof baziResult !== 'object') return '';

  const pattern = baziResult.pattern?.name ? `格局倾向：${baziResult.pattern.name}` : '';
  const strength = baziResult.wuxing?.strength ? `五行状态：${baziResult.wuxing.strength}` : '';
  const favorable = Array.isArray(baziResult.wuxing?.favorable) && baziResult.wuxing.favorable.length
    ? `喜用参考：${baziResult.wuxing.favorable.join('、')}`
    : '';
  const dailyLuck = baziResult.dailyLuck?.summary ? `近期气象：${getShortText(baziResult.dailyLuck.summary, 42)}` : '';

  return [pattern, strength, favorable, dailyLuck].filter(Boolean).join('；');
};

const buildProfileTarotContext = (profile: UserProfile | null, baziResult: any | null | undefined) => {
  if (!profile) return '';
  const baziSummary = getBaziResultSummary(baziResult);
  return [
    '活跃八字档案（只能轻量引用，不要把塔罗变成排盘报告）：',
    `姓名：${profile.name}；性别：${profile.gender === 'female' ? '女' : '男'}；出生：${profile.birthDate} ${profile.birthTime}；出生地：${profile.birthLocation || '未填写'}；现居：${profile.currentLocation || '未填写'}。`,
    baziSummary ? `档案倾向：${baziSummary}。` : '档案倾向：出生资料已保存，但完整排盘摘要还未生成。',
    '回答要求：如果这次问题涉及状态、关系、选择或行动，请自然加入一句“你的档案倾向...”或同等表达；只点到为止，不要强行下命定结论。',
  ].join('\n');
};

const buildPrompt = (question: string, cards: DrawnCard[], isInternetMode: boolean) => {
  const modeHint = isInternetMode
    ? '如果问题涉及现实信息，请提醒用户需要结合最新事实判断。'
    : '不需要联网，专注情绪、选择和自我理解。';

  return `用户问题：${question}
抽到的塔罗牌：${formatCards(cards)}

请用中文回答，语气客观但温柔，像一位塔罗少女在轻声陪伴用户，不吓人、不审判，也不堆玄学词。不要使用 Markdown 星号、加粗符号或井号标题。结构：
1. 先用一句温柔但清醒的话说出核心。
2. 解释牌意和问题的关系，注意给用户留一点余地。
3. 给一个今天能执行的小建议。
${modeHint}`;
};

const fallbackAnswer = (question: string, cards: DrawnCard[]) => {
  const first = cards[0];
  return `一句话说：你现在真正卡住的不是答案，而是还没决定要承受哪一种代价。\n\n你抽到的是「${first.name}（${first.position}）」。这张牌提醒你，${question.includes('感情') ? '关系里最重要的不是猜对方，而是看自己有没有被稳定对待。' : '先把问题拆小，别试图一次解决整个人生。'}\n\n今天只做一件事：写下你最害怕的结果，再写下如果它发生了你能怎么收场。能收场，就没那么可怕。`;
};

const cleanTarotAnswer = (text: string) =>
  text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const buildCurrentReadingPrompt = (
  question: string,
  currentReading: TarotReading | undefined,
  currentCardImage: string,
  isInternetMode: boolean,
) => {
  const currentContext = currentReading
    ? `上一轮问题：${currentReading.question}
已有牌面：${currentReading.cards}
上一轮摘要：${currentReading.summary}`
    : `当前牌图：${currentCardImage || '暂无明确牌图'}`;
  const modeHint = isInternetMode
    ? '如果用户追问涉及现实信息，请提醒需要结合最新事实判断。'
    : '不需要联网，专注于已有牌面、情绪和选择。';

  return `用户这次追问：${question}

${currentContext}

请不要重新抽牌，也不要假装出现了新牌。基于已有牌面继续解读，语气客观但温柔，像一位塔罗少女在轻声陪伴用户。不要使用 Markdown 星号、加粗符号或井号标题，回答要简洁、有行动建议。
${modeHint}`;
};

const fallbackCurrentReadingAnswer = (question: string, currentReading?: TarotReading) => {
  if (!currentReading) {
    return '现在还没有可继续解读的牌。你可以先抽一张牌，我再沿着那张牌陪你往下看。';
  }
  return `我先不重新抽牌，就沿着刚才这组牌继续看。

你问的是「${question}」。这组牌的核心不是给你一个立刻冲出去执行的答案，而是提醒你先把问题拆小：哪一部分是事实，哪一部分只是你害怕它会发生。

今天先做一个动作：把刚才那张牌对应到一个现实选择上，只问自己“下一步最小的动作是什么”。`;
};

const MEMORY_WINDOW_MS = 7 * 86400000;

const MEMORY_THEME_BUCKETS = [
  {
    label: '工作选择',
    keywords: ['工作', '事业', '职场', '跳槽', '项目', '公司', '创业', '赚钱', '执行', '机会'],
    action: '看执行阻力',
    prompt: '结合我最近关于工作选择的牌迹，帮我看今天最需要处理的执行阻力。',
  },
  {
    label: '关系状态',
    keywords: ['感情', '恋爱', '喜欢', '关系', '复合', '分手', '暧昧', '对方', '伴侣', '情侣'],
    action: '看关系走向',
    prompt: '结合我最近关于关系状态的记录，帮我看这段关系现在最需要被看见的地方。',
  },
  {
    label: '自我状态',
    keywords: ['焦虑', '迷茫', '状态', '情绪', '自己', '压力', '未来', '烦', '累', '害怕'],
    action: '看情绪出口',
    prompt: '结合我最近的状态，帮我看今天可以先松开哪一部分压力。',
  },
  {
    label: '人生选择',
    keywords: ['选择', '要不要', '怎么办', '方向', '决定', '该不该', '能不能', '适合', '机会'],
    action: '看下一步',
    prompt: '结合我最近反复纠结的选择，帮我看下一步最小但有效的行动。',
  },
];

type MemoryTheme = (typeof MEMORY_THEME_BUCKETS)[number] & { count: number };

type MemoryInsight = {
  label: string;
  text: string;
  tone: 'tarot' | 'diary' | 'choice' | 'profile' | 'starter';
};

type MemoryRecall = {
  title: string;
  desc: string;
  cta: string;
  prompt?: string;
  meta: string;
  contextLines: string[];
  insights: MemoryInsight[];
};

type TarotArchiveReport = {
  title: string;
  dateRangeLabel: string;
  recordCount: number;
  keywords: string[];
  signals: Array<{
    label: string;
    value: string;
    desc: string;
  }>;
  evidence: string[];
  timeline: Array<{
    id: string;
    date: string;
    title: string;
    card: string;
    summary: string;
  }>;
  advice: string[];
  prompt: string;
};

const getMemoryTime = (value?: string) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
};

const getRecentItems = <T extends { date: string }>(items: T[], now = Date.now()) =>
  [...items]
    .filter((item) => now - getMemoryTime(item.date) <= MEMORY_WINDOW_MS)
    .sort((a, b) => getMemoryTime(b.date) - getMemoryTime(a.date));

const getTodaysSimulation = (items: SimulationHistoryEntry[], todayKey = getLocalDateKey()) =>
  [...items]
    .filter((item) => {
      const parsed = new Date(item.date);
      return !Number.isNaN(parsed.getTime()) && getLocalDateKey(parsed) === todayKey;
    })
    .sort((a, b) => getMemoryTime(b.date) - getMemoryTime(a.date))[0] || null;

const getRecentGuardianMessages = (items: CompanionMessage[], now = Date.now()) =>
  [...items]
    .filter((item) => item.role === 'ai' && now - item.timestamp <= MEMORY_WINDOW_MS)
    .sort((a, b) => b.timestamp - a.timestamp);

const getThemeFromReadings = (readings: TarotReading[]) => {
  const ranked = MEMORY_THEME_BUCKETS.map((bucket) => ({
    ...bucket,
    count: readings.filter((reading) =>
      bucket.keywords.some((keyword) => reading.question.includes(keyword) || reading.summary.includes(keyword)),
    ).length,
  })).sort((a, b) => b.count - a.count);

  return ranked[0]?.count ? ranked[0] : null;
};

const getMoodLabel = (mood: DiaryEntry['mood']) => {
  const labels: Record<DiaryEntry['mood'], string> = {
    great: '很亮的心情',
    good: '还不错的状态',
    neutral: '平淡的一天',
    bad: '有点低落',
    awful: '很辛苦的时刻',
  };
  return labels[mood];
};

const getShortText = (text: string, max = 28) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
};

const buildMemoryInsights = (input: {
  recentReadings: TarotReading[];
  latestReading?: TarotReading | null;
  latestDiary?: DiaryEntry | null;
  todaysSimulation?: SimulationHistoryEntry | null;
  activeProfile?: UserProfile | null;
  theme?: MemoryTheme | null;
}): MemoryInsight[] => {
  const insights: MemoryInsight[] = [];

  if (input.theme && input.recentReadings.length >= 2) {
    insights.push({
      label: '反复主题',
      text: `最近 7 天有 ${input.theme.count} 次线索落在「${input.theme.label}」，适合继续追问同一处阻力。`,
      tone: 'tarot',
    });
  }

  if (input.latestReading) {
    insights.push({
      label: '最近牌迹',
      text: `你问过「${getShortText(input.latestReading.question, 30)}」，牌面留下「${getShortText(input.latestReading.cards, 28)}」。`,
      tone: 'tarot',
    });
  }

  if (input.latestDiary) {
    insights.push({
      label: '情绪线索',
      text: `最近日记是${getMoodLabel(input.latestDiary.mood)}：「${getShortText(input.latestDiary.content, 34)}」。`,
      tone: 'diary',
    });
  }

  if (input.todaysSimulation) {
    insights.push({
      label: '今日选择',
      text: `你正在「${getShortText(input.todaysSimulation.choiceA, 16)}」和「${getShortText(input.todaysSimulation.choiceB, 16)}」之间权衡。`,
      tone: 'choice',
    });
  }

  if (input.activeProfile) {
    insights.push({
      label: '命理档案',
      text: `当前档案是「${input.activeProfile.name}」，之后的解读会优先沿着这份上下文沉淀。`,
      tone: 'profile',
    });
  }

  return insights.length
    ? insights.slice(0, 3)
    : [
        {
          label: '第一条线索',
          text: '抽一张今日牌、写一篇日记，或建一份档案后，这里会开始沉淀你的个人上下文。',
          tone: 'starter',
        },
      ];
};

const normalizeReadingText = (text: string) => text.replace(/\s+/g, ' ').trim();

const shouldCollapseReadingText = (text: string, maxLength: number) =>
  normalizeReadingText(text).length > maxLength || text.split(/\n+/).filter(Boolean).length > 3;

const isProbablyCutSummary = (text: string) => {
  const trimmed = text.trim();
  return trimmed.length >= 135 && !/[。！？.!?」”）)]$/.test(trimmed);
};

const getFullReadingSummary = (reading: TarotReading, messages: Message[] = []) => {
  const storedSummary = reading.summary?.trim() || '';
  const readingTime = Date.parse(reading.date);
  const imageSet = new Set([reading.cardImage || '', ...(reading.cardImages || [])].filter(Boolean));
  const candidates = messages
    .filter((message) => {
      if (message.role !== 'ai' || !message.text?.trim()) return false;
      const timeClose = Number.isFinite(readingTime) ? Math.abs(message.timestamp - readingTime) < 3 * 60 * 1000 : true;
      const imageMatched =
        imageSet.size === 0 ||
        Boolean(message.cardImage && imageSet.has(message.cardImage)) ||
        Boolean(message.cardImages?.some((image) => imageSet.has(image)));
      return timeClose && imageMatched;
    })
    .sort((a, b) => Math.abs(a.timestamp - readingTime) - Math.abs(b.timestamp - readingTime));
  const recovered = candidates[0]?.text?.trim();

  if (!storedSummary) return recovered || '这次牌面已经留在档案里。';
  if (!recovered) return storedSummary;

  const normalizedStored = normalizeReadingText(storedSummary);
  const normalizedRecovered = normalizeReadingText(recovered);
  const sameOpening = normalizedRecovered.startsWith(normalizedStored.slice(0, 42));
  if (isProbablyCutSummary(storedSummary) || sameOpening || normalizedRecovered.includes(normalizedStored.slice(0, 42))) {
    return recovered;
  }

  return storedSummary;
};

const formatArchiveDate = (date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => {
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return '最近';
  return parsed.toLocaleDateString('zh-CN', options);
};

const getPrimaryCardName = (cards: string) => cards.split(/[，,、]/)[0]?.trim() || '未记录牌面';

const buildTarotArchiveReport = (
  readings: TarotReading[],
  messages: Message[] = [],
  diaryEntries: DiaryEntry[] = [],
  guardianMessages: CompanionMessage[] = [],
  activeProfile: UserProfile | null = null,
  baziResult: any | null = null,
): TarotArchiveReport => {
  const sorted = [...readings].sort((a, b) => getMemoryTime(b.date) - getMemoryTime(a.date));
  const recent = getRecentItems(sorted);
  const scope = recent.length > 0 ? recent : sorted.slice(0, 7);
  const recentDiaries = getRecentItems(diaryEntries);
  const recentGuardian = getRecentGuardianMessages(guardianMessages);
  const diaryTrends = buildDiaryThemeTrends(recentDiaries, { limit: 3 });
  const recordCount = scope.length + recentDiaries.length + recentGuardian.length;
  const first = scope[scope.length - 1];
  const last = scope[0];
  const dateRangeLabel =
    first && last
      ? `${formatArchiveDate(first.date)} - ${formatArchiveDate(last.date)}`
      : '还没有时间线';

  const theme = getThemeFromReadings(scope);
  const keywordScores = MEMORY_THEME_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: scope.filter((reading) =>
      bucket.keywords.some((keyword) => reading.question.includes(keyword) || reading.summary.includes(keyword)),
    ).length,
  })).filter((item) => item.count > 0);

  const cardRank = Object.entries(
    scope.reduce<Record<string, number>>((acc, reading) => {
      const card = getPrimaryCardName(reading.cards);
      if (card) acc[card] = (acc[card] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([card]) => card);

  const keywords = [
    ...keywordScores.sort((a, b) => b.count - a.count).map((item) => item.label),
    ...diaryTrends.map((trend) => trend.label),
    ...cardRank.slice(0, 2),
  ].filter((keyword, index, list) => list.indexOf(keyword) === index).slice(0, 5);

  const timeline = scope.slice(0, 5).map((reading) => ({
    id: reading.id,
    date: formatArchiveDate(reading.date, { month: 'numeric', day: 'numeric' }),
    title: reading.question || '一次没有命名的问题',
    card: getPrimaryCardName(reading.cards) || '未记录牌面',
    summary: getFullReadingSummary(reading, messages),
  }));

  const topCard = cardRank[0] || '还没有代表牌';
  const themeLabel = theme?.label || keywordScores[0]?.label || '自我状态';
  const diaryMoodRank = Object.entries(
    recentDiaries.reduce<Record<string, number>>((acc, entry) => {
      const mood = getMoodLabel(entry.mood);
      acc[mood] = (acc[mood] || 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const topDiaryMood = diaryMoodRank[0]?.[0] || '等待日记';
  const topDiaryTrend = diaryTrends[0];
  const profileArchiveSummary = activeProfile ? getBaziResultSummary(baziResult) : '';
  const latestGuardian = recentGuardian[0];
  const signals = [
    {
      label: '反复主题',
      value: theme?.count ? `${themeLabel} · ${theme.count} 次` : themeLabel,
      desc: scope.length >= 2 ? '牌迹里已经出现可追踪的重复问题。' : '先积累到 2-3 次牌迹，主题会更稳定。',
    },
    {
      label: '情绪底色',
      value: topDiaryTrend
        ? `${topDiaryTrend.label} · ${topDiaryTrend.entryCount} 次`
        : recentDiaries.length
          ? `${topDiaryMood} · ${recentDiaries.length} 篇`
          : '等待日记',
      desc: topDiaryTrend
        ? `${topDiaryTrend.moodSummary}，${topDiaryTrend.evidence}。`
        : recentDiaries.length
          ? `最近日记提到「${getShortText(recentDiaries[0].content, 28)}」。`
          : '写下心情后，复盘会更像在看真实的你。',
    },
    {
      label: '守护回声',
      value: recentGuardian.length ? `${recentGuardian.length} 封来信` : '等待守护',
      desc: latestGuardian ? `最近守护提到「${getShortText(latestGuardian.text, 32)}」。` : '守护聊天会成为周报里的陪伴线索。',
    },
    activeProfile
      ? {
          label: '档案倾向',
          value: activeProfile.name,
          desc: profileArchiveSummary
            ? `你的档案倾向显示：${getShortText(profileArchiveSummary, 42)}。`
            : '已保存出生档案，后续牌迹会沿着这份个人上下文沉淀。',
        }
      : null,
  ].filter(Boolean) as TarotArchiveReport['signals'];
  const evidence = [
    scope[0] ? `最近牌迹：${getShortText(scope[0].question, 34)} / ${getShortText(scope[0].cards, 24)}` : '',
    topDiaryTrend ? `日记趋势：${topDiaryTrend.label}，${topDiaryTrend.evidence}` : '',
    activeProfile ? `活跃档案：${activeProfile.name}${profileArchiveSummary ? `，${getShortText(profileArchiveSummary, 46)}` : ''}` : '',
    recentDiaries[0] ? `最近日记：${getMoodLabel(recentDiaries[0].mood)}，${getShortText(recentDiaries[0].content, 42)}` : '',
    latestGuardian ? `守护回应：${getShortText(latestGuardian.text, 46)}` : '',
  ].filter(Boolean);
  const advice =
    scope.length === 0
      ? ['先抽一张今日牌，让第一条牌迹成为档案起点。', '问题越具体，后续复盘越能看出变化。']
      : [
          `先把这周的问题收束到「${themeLabel}」，不要同时审判所有方向。`,
          activeProfile ? `结合「${activeProfile.name}」的档案倾向时，只取一个现实切入点，不要把自己交给结论。` : '',
          topDiaryTrend ? `日记里的「${topDiaryTrend.label}」适合转成一个今天能照顾到自己的小动作。` : '',
          `代表牌「${topCard}」出现后，适合写下一个今天就能验证的小动作。`,
          scope.length >= 3 ? '下一次追问可以直接问“我反复卡住的地方是什么”。' : '再留下两三次牌迹后，时间线会更有参考价值。',
        ].filter(Boolean);

  return {
    title: scope.length > 0 ? `${themeLabel}观察档案` : '新的牌迹档案',
    dateRangeLabel,
    recordCount,
    keywords: keywords.length > 0 ? keywords : ['等待第一张牌'],
    signals,
    evidence,
    timeline,
    advice,
    prompt:
      scope.length > 0
        ? `结合我这份「${themeLabel}观察档案」和最近牌迹，帮我继续看下一步最该注意什么。`
        : '帮我抽一张今日牌，作为我的第一份牌迹档案。',
  };
};

const buildMemoryRecall = (input: {
  tarotReadings: TarotReading[];
  diaryEntries: DiaryEntry[];
  simulationHistory: SimulationHistoryEntry[];
  profiles: UserProfile[];
  activeProfileId: string | null;
}): MemoryRecall => {
  const recentReadings = getRecentItems(input.tarotReadings);
  const recentDiaries = getRecentItems(input.diaryEntries);
  const latestReading = recentReadings[0] || input.tarotReadings[0];
  const latestDiary = recentDiaries[0] || input.diaryEntries[0];
  const todaysSimulation = getTodaysSimulation(input.simulationHistory);
  const activeProfile =
    input.profiles.find((profile) => profile.id === input.activeProfileId) || input.profiles[0] || null;
  const theme = getThemeFromReadings(recentReadings);
  const memoryCount =
    input.tarotReadings.length + input.diaryEntries.length + input.simulationHistory.length + input.profiles.length;

  const contextLines = [
    activeProfile
      ? `命理档案：${activeProfile.name}，${activeProfile.gender === 'female' ? '女' : '男'}，出生地${activeProfile.birthLocation || '未填写'}，现居${activeProfile.currentLocation || '未填写'}。`
      : '',
    theme ? `最近 7 天高频主题：${theme.label}，相关牌迹 ${theme.count} 次。` : '',
    latestReading ? `最近牌迹：问题“${getShortText(latestReading.question, 46)}”，牌面“${getShortText(latestReading.cards, 42)}”。` : '',
    latestDiary ? `最近日记：${getMoodLabel(latestDiary.mood)}，内容“${getShortText(latestDiary.content, 54)}”。` : '',
    todaysSimulation
      ? `今日沙盘：在“${getShortText(todaysSimulation.dilemma, 42)}”里权衡“${getShortText(todaysSimulation.choiceA, 18)}”和“${getShortText(todaysSimulation.choiceB, 18)}”。`
      : '',
  ].filter(Boolean);
  const insights = buildMemoryInsights({
    recentReadings,
    latestReading,
    latestDiary,
    todaysSimulation,
    activeProfile,
    theme,
  });

  if (theme && recentReadings.length >= 2) {
    return {
      title: `我记得你这几天常在问「${theme.label}」`,
      desc: `已经留下 ${recentReadings.length} 次近期牌迹。今天可以先不换方向，直接看卡住你的那一小段阻力。`,
      cta: theme.action,
      prompt: theme.prompt,
      meta: `${memoryCount} 份线索`,
      contextLines,
      insights,
    };
  }

  if (latestDiary) {
    return {
      title: `我记得你上次写下的是「${getMoodLabel(latestDiary.mood)}」`,
      desc: latestDiary.content
        ? `那篇日记里有一句“${getShortText(latestDiary.content, 34)}”。今天可以先看看情绪最需要被放在哪里。`
        : '今天可以先从情绪出口开始，不急着立刻解决所有事。',
      cta: '看情绪出口',
      prompt: '结合我最近的日记状态，帮我看今天最需要放下的压力和一个能执行的小动作。',
      meta: `${memoryCount} 份线索`,
      contextLines,
      insights,
    };
  }

  if (todaysSimulation) {
    return {
      title: '我记得你还在权衡一个选择',
      desc: `今天的沙盘里，你把“${getShortText(todaysSimulation.choiceA, 18)}”和“${getShortText(todaysSimulation.choiceB, 18)}”放在一起比较过。`,
      cta: '继续看下一步',
      prompt: '结合我今天的沙盘选择，帮我看更适合先验证哪一步。',
      meta: `${memoryCount} 份线索`,
      contextLines,
      insights,
    };
  }

  if (latestReading) {
    return {
      title: '我记得你上一张牌留下的问题',
      desc: `上次你问的是“${getShortText(latestReading.question, 34)}”。如果还没完全放下，可以沿着这张牌继续看。`,
      cta: '接着解读',
      prompt: '结合我上一轮牌面，帮我继续看现在最需要注意的一点。',
      meta: `${memoryCount} 份线索`,
      contextLines,
      insights,
    };
  }

  if (activeProfile) {
    return {
      title: `我已经记住了「${activeProfile.name}」这份档案`,
      desc: '之后牌迹、日记和沙盘会围绕这份档案慢慢沉淀，不用每次重新介绍自己。',
      cta: '看今日状态',
      prompt: `结合${activeProfile.name}的命理档案，帮我看今天最适合关注的状态。`,
      meta: `${memoryCount} 份线索`,
      contextLines,
      insights,
    };
  }

  return {
    title: '先留下一条属于你的线索',
    desc: '抽一张今日牌、写一篇日记，或者建一份档案。之后星轨就能沿着你的上下文继续陪你看。',
    cta: '抽今日牌',
    prompt: '今日运势',
    meta: '新档案',
    contextLines,
    insights,
  };
};

export default function Home() {
  const navigate = useNavigate();
  const {
    bondExp,
    setBondExp,
    bondLevel,
    setBondLevel,
    energy,
    setEnergy,
    messages,
    setMessages,
    cardImage,
    setCardImage,
    theme,
    setTheme,
    baziResult,
    diaryEntries,
    simulationHistory,
    profiles,
    activeProfileId,
    checkInStreak,
    setCheckInStreak,
    lastCheckInDate,
    setLastCheckInDate,
    dailyRewardDate,
    setDailyRewardDate,
    tarotReadings,
    setTarotReadings,
    companionOutfit,
    setCompanionOutfit,
    membership,
    setMembership,
    engagement,
    setEngagement,
    dailyLetterDate,
    guardianMessages,
    setAppEvents,
  } = useAppContext();

  const [inputText, setInputText, clearInputDraft] = usePersistentDraft('draft:home:input', '');
  const [isThinking, setIsThinking] = useState(false);
  const [isInternetMode, setIsInternetMode] = useState(false);
  const [showDailyPanel, setShowDailyPanel] = useState(false);
  const [showSpreadTools, setShowSpreadTools] = useState(false);
  const [showReadingLog, setShowReadingLog] = useState(false);
  const [showWardrobe, setShowWardrobe] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isDrawingCards, setIsDrawingCards] = useState(false);
  const [drawingCards, setDrawingCards] = useState<DrawnCard[]>([]);
  const [composerFocused, setComposerFocused] = useState(false);
  const [autoScrollOnNextMessage, setAutoScrollOnNextMessage] = useState(false);
  const [floatingExp, setFloatingExp] = useState<number | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'energy' | 'history' | 'weekly'>('energy');
  const [petOffset, setPetOffset] = useState({ x: 0, y: 0 });

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialChatScrollDoneRef = useRef(false);
  const petDragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);

  const todayKey = getLocalDateKey();
  const yesterdayKey = getLocalDateKey(new Date(Date.now() - 86400000));
  const hasCheckedInToday = lastCheckInDate === todayKey;
  const askedToday = messages.some(
    (msg) => msg.role === 'user' && getLocalDateKey(new Date(msg.timestamp)) === todayKey,
  );
  const wroteDiaryToday = diaryEntries.some((entry) => {
    if (entry.date === todayKey) return true;
    const parsed = new Date(entry.date);
    return !Number.isNaN(parsed.getTime()) && getLocalDateKey(parsed) === todayKey;
  });
  const simulatedToday = Boolean(getTodaysSimulation(simulationHistory, todayKey));
  const missionCount = [askedToday, wroteDiaryToday, simulatedToday].filter(Boolean).length;
  const hasClaimedDailyReward = dailyRewardDate === todayKey;
  const canClaimDailyReward = missionCount >= 3 && !hasClaimedDailyReward;
  const canClaimReturnReward = engagement.activeDays >= 2 && engagement.returnRewardDate !== todayKey;
  const plusActive = isPlusActive(membership);
  const testerActive = isTesterActive(membership);
  const trialAvailable = canStartPlusTrial(membership);
  const readingLimit = getReadingLimit(membership);
  const dailyCheckInEnergy = getDailyCheckInEnergy(membership);
  const dailyMissionEnergy = getDailyMissionEnergy(membership);
  const membershipLabel = getMembershipLabel(membership);
  const hasGuardianLetterToday = dailyLetterDate === new Date().toLocaleDateString('zh-CN');
  const nextBestAction = getNextBestAction({
    plusActive,
    tarotReadings: tarotReadings.length,
    hasBaziProfile: profiles.length > 0,
    wroteDiaryToday,
    hasGuardianLetterToday,
    simulatedRecently: simulatedToday,
    activeDays: engagement.activeDays,
  });

  const nextLevelExp = LEVEL_THRESHOLDS[bondLevel] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const progressPercent = Math.min(100, Math.round((bondExp / nextLevelExp) * 100));
  const visibleMessages = messages.filter((message) => message.id !== 'init');
  const hasDrawnCard = cardImage && cardImage !== '/default-card.png' && cardImage !== 'default-card.png';
  const memoryRecall = useMemo(
    () => buildMemoryRecall({ tarotReadings, diaryEntries, simulationHistory, profiles, activeProfileId }),
    [tarotReadings, diaryEntries, simulationHistory, profiles, activeProfileId],
  );
  const activeProfile = useMemo(() => getActiveProfile(profiles, activeProfileId), [profiles, activeProfileId]);
  const visibleMemoryInsights = memoryRecall.insights.slice(0, plusActive ? 3 : 1);
  const memoryContextText = memoryRecall.contextLines.length
    ? `已知用户上下文（可以轻轻引用，不要机械复述）：\n${memoryRecall.contextLines.join('\n')}`
    : '';
  const profileTarotContextText = useMemo(
    () => buildProfileTarotContext(activeProfile, baziResult),
    [activeProfile, baziResult],
  );
  const archiveSignals = useMemo(() => {
    const guardianReplyCount = guardianMessages.filter((message) => message.role === 'ai').length;
    return [
      {
        id: 'tarot',
        label: '牌迹',
        value: `${tarotReadings.length} 条`,
        done: tarotReadings.length > 0,
        desc: tarotReadings.length > 0 ? '已经能回看问题和牌面变化' : '先抽一张牌作为起点',
      },
      {
        id: 'diary',
        label: '日记',
        value: `${diaryEntries.length} 篇`,
        done: diaryEntries.length >= 2,
        desc: diaryEntries.length >= 2 ? '可以提取情绪关键词趋势' : '写到 2 篇后会出现趋势',
      },
      {
        id: 'profile',
        label: '档案',
        value: activeProfile ? activeProfile.name : '未建立',
        done: Boolean(activeProfile),
        desc: activeProfile ? '塔罗会轻量引用档案倾向' : '建档后解读会更个人化',
      },
      {
        id: 'guardian',
        label: '守护',
        value: `${guardianReplyCount} 次`,
        done: guardianReplyCount > 0,
        desc: guardianReplyCount > 0 ? '回访线索已纳入周报' : '领取来信后形成回访线',
      },
    ];
  }, [activeProfile, diaryEntries.length, guardianMessages, tarotReadings.length]);
  const archiveMaturityScore = Math.min(100, archiveSignals.reduce((score, signal) => score + (signal.done ? 25 : 0), 0));
  const archiveMaturityLabel =
    archiveMaturityScore >= 75 ? '长期档案已成形' : archiveMaturityScore >= 50 ? '个人线索正在合流' : archiveMaturityScore >= 25 ? '已经有第一批线索' : '等待第一条线索';
  const archiveNextSignal = archiveSignals.find((signal) => !signal.done);
  const companionBubbleText = isDrawingCards
    ? '别盯着牌背看，它会紧张。'
    : isThinking
      ? '我在翻星轨，你先别急着给自己判刑。'
      : hasDrawnCard
        ? memoryRecall.contextLines.length
          ? '我把你留下的线索放在下面了，今天可以接着看。'
          : PET_MURMURS[(tarotReadings.length + bondLevel) % PET_MURMURS.length]
        : memoryRecall.contextLines.length
          ? '我把你留下的线索放在下面了，今天可以接着看。'
          : '今天先问一个小问题，不要一上来就审判人生。';
  const autoOutfit = getAutoCompanionOutfit(bondLevel);
  const selectedOutfit = COMPANION_OUTFITS.find((item) => item.id === companionOutfit);
  const activeOutfit =
    companionOutfit === 'auto' || !selectedOutfit || selectedOutfit.minLevel > bondLevel
      ? autoOutfit
      : selectedOutfit;
  const activeCompanionImage = activeOutfit.image || autoOutfit.image || '/default-pet.png';
  const activePetImage = activeOutfit.image || autoOutfit.image || '/default-pet.png';
  const isFullBodyPet = activeOutfit.id !== 'moon';
  const petStageClass = isFullBodyPet
    ? 'left-1/2 top-[248px] h-[190px] w-[190px] -translate-x-1/2 sm:top-[236px] sm:h-[220px] sm:w-[220px]'
    : 'left-1/2 top-[292px] h-[132px] w-[132px] -translate-x-1/2 sm:h-[150px] sm:w-[150px]';
  const petDockClass = isFullBodyPet
    ? 'bottom-[104px] left-2 h-[124px] w-[124px] sm:left-6 sm:h-[136px] sm:w-[136px]'
    : 'bottom-[104px] left-4 h-[88px] w-[88px] sm:left-6';
  const handlePetPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const baseLeft = rect.left - petOffset.x;
    const baseTop = rect.top - petOffset.y;
    const edge = 8;
    petDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: petOffset.x,
      originY: petOffset.y,
      minX: edge - baseLeft,
      maxX: window.innerWidth - edge - rect.width - baseLeft,
      minY: edge - baseTop,
      maxY: window.innerHeight - edge - rect.height - baseTop,
    };
  };
  const handlePetPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!petDragRef.current) return;
    const nextX = petDragRef.current.originX + event.clientX - petDragRef.current.startX;
    const nextY = petDragRef.current.originY + event.clientY - petDragRef.current.startY;
    setPetOffset({
      x: clampNumber(nextX, petDragRef.current.minX, petDragRef.current.maxX),
      y: clampNumber(nextY, petDragRef.current.minY, petDragRef.current.maxY),
    });
  };
  const handlePetPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    petDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const isTarotImage = (image?: string) => Boolean(image && image.startsWith('/tarot/'));
  const cardStackImages = useMemo(() => {
    const images = [
      hasDrawnCard ? cardImage : '',
      ...tarotReadings.map((reading) => reading.cardImage || ''),
    ].filter(Boolean);
    return images.filter((image, index) => index === 0 || image !== images[index - 1]).slice(0, 5);
  }, [cardImage, hasDrawnCard, tarotReadings]);

  const weekReadings = useMemo(
    () => tarotReadings.filter((reading) => Date.now() - new Date(reading.date).getTime() < 7 * 86400000),
    [tarotReadings],
  );
  const weekDiaries = useMemo(() => getRecentItems(diaryEntries), [diaryEntries]);
  const weekGuardianMessages = useMemo(() => getRecentGuardianMessages(guardianMessages), [guardianMessages]);
  const weeklyMaterialCount = weekReadings.length + weekDiaries.length + weekGuardianMessages.length;
  const weeklyReviewReady = weeklyMaterialCount >= 3;
  const softConversionTrigger = getSoftConversionTrigger({
    plusActive,
    tarotReadings: tarotReadings.length,
    diaryEntries: diaryEntries.length,
    activeDays: engagement.activeDays,
    lastUpgradePromptAt: engagement.lastUpgradePromptAt,
    weeklyReviewReady,
  });

  const weeklyReportText = useMemo(() => {
    if (weekReadings.length === 0) return '本周还没有足够牌迹，先抽一张今日牌。';
    if (!plusActive && weekReadings.length >= 3) {
      return `本周已有 ${weekReadings.length} 次牌迹。Plus 会把高频问题、代表牌和情绪走向整理成完整周报。`;
    }
    const themeBuckets = [
      { label: '感情关系', keywords: ['感情', '恋爱', '喜欢', '关系', '复合', '桃花'] },
      { label: '学业事业', keywords: ['工作', '事业', '学习', '考试', '升职', '赚钱'] },
      { label: '自我状态', keywords: ['焦虑', '迷茫', '情绪', '状态', '自己', '未来'] },
      { label: '生活选择', keywords: ['选择', '要不要', '怎么办', '方向', '机会'] },
    ];
    const topTheme = themeBuckets
      .map((themeItem) => ({
        label: themeItem.label,
        count: weekReadings.filter((reading) =>
          themeItem.keywords.some((keyword) => reading.question.includes(keyword)),
        ).length,
      }))
      .sort((a, b) => b.count - a.count)[0];

    const topCard =
      Object.entries(
        weekReadings.reduce<Record<string, number>>((acc, reading) => {
          const card = reading.cards.split(/[，,、]/)[0]?.trim();
          if (card) acc[card] = (acc[card] || 0) + 1;
          return acc;
        }, {}),
      ).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] || '还没有代表牌';

    return `这周你更常问「${topTheme?.count ? topTheme.label : '自我状态'}」，代表牌是「${topCard}」。`;
  }, [weekReadings, plusActive]);
  const weeklyReviewText = useMemo(() => {
    if (weeklyMaterialCount === 0) return '本周还没有足够线索，先抽一张今日牌。';
    if (!plusActive && weeklyReviewReady) {
      return `本周已经沉淀 ${weeklyMaterialCount} 条材料。Plus 会把牌迹、日记和守护回应整理成完整 7 日复盘。`;
    }
    const diaryLine = weekDiaries[0] ? `最近日记是${getMoodLabel(weekDiaries[0].mood)}` : '日记线索还在等待补充';
    const guardianLine = weekGuardianMessages[0] ? '守护回应已经纳入复盘' : '守护回应还未形成稳定线索';
    const profileLine = activeProfile
      ? `活跃档案是${activeProfile.name}${getBaziResultSummary(baziResult) ? '，会轻量参与塔罗判断' : ''}`
      : '命理档案还未形成线索';
    return `${weeklyReportText} ${diaryLine}，${guardianLine}，${profileLine}。`;
  }, [weekDiaries, weekGuardianMessages, weeklyMaterialCount, weeklyReviewReady, weeklyReportText, plusActive, activeProfile, baziResult]);

  const scrollConversationToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const run = () => {
      endRef.current?.scrollIntoView({ behavior, block: 'end' });
      const scrollNode = scrollRef.current;
      if (scrollNode) {
        scrollNode.scrollTo({ top: scrollNode.scrollHeight, behavior });
      }
    };

    window.requestAnimationFrame(run);
    window.setTimeout(run, 80);
    window.setTimeout(run, 320);
  };

  useEffect(() => {
    const timers = PRELOAD_IMAGE_PATHS.map((src, index) =>
      window.setTimeout(() => {
        void preloadImage(src);
      }, index < 8 ? 0 : index * 42),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (initialChatScrollDoneRef.current || visibleMessages.length === 0) return;
    initialChatScrollDoneRef.current = true;
    scrollConversationToBottom('auto');
  }, [visibleMessages.length]);

  useEffect(() => {
    if (!autoScrollOnNextMessage) return;
    scrollConversationToBottom();
    if (!isThinking) setAutoScrollOnNextMessage(false);
  }, [messages.length, isThinking, autoScrollOnNextMessage]);

  const addExp = (amount: number) => {
    const nextExp = bondExp + amount;
    setBondExp(nextExp);
    if (bondLevel < LEVEL_THRESHOLDS.length && nextExp >= LEVEL_THRESHOLDS[bondLevel]) {
      setBondLevel((level) => Math.min(level + 1, LEVEL_THRESHOLDS.length));
    }
    setFloatingExp(amount);
    window.setTimeout(() => setFloatingExp(null), 1400);
  };

  const openUpgradePrompt = (reason: 'energy' | 'history' | 'weekly') => {
    setUpgradeReason(reason);
    setShowUpgradePrompt(true);
    setEngagement((current) => ({ ...current, lastUpgradePromptAt: new Date().toISOString() }));
    setAppEvents((events) => recordAppEvent(events, 'upgrade_prompt', { reason }));
  };

  const dismissSoftConversion = () => {
    setEngagement((current) => ({ ...current, lastUpgradePromptAt: new Date().toISOString() }));
    setAppEvents((events) => recordAppEvent(events, 'upgrade_prompt', { reason: 'soft_dismiss' }));
  };

  const handleSoftConversion = () => {
    if (!softConversionTrigger) return;
    openUpgradePrompt(softConversionTrigger.reason);
  };

  const handleStartTrial = () => {
    if (!trialAvailable) return;
    setMembership((current) => startPlusTrial(current));
    setEnergy((value) => Math.max(value, 12));
    setShowUpgradePrompt(false);
    setAppEvents((events) => recordAppEvent(events, 'trial_start', { source: upgradeReason }));
    addExp(20);
  };

  const handleOpenPlusPage = () => {
    setShowUpgradePrompt(false);
    navigate('/app/profile?plus=1');
  };

  const handleDailyCheckIn = () => {
    if (hasCheckedInToday) return;
    setCheckInStreak(lastCheckInDate === yesterdayKey ? checkInStreak + 1 : 1);
    setLastCheckInDate(todayKey);
    setEnergy((value) => value + dailyCheckInEnergy);
    setAppEvents((events) => recordAppEvent(events, 'daily_check_in', { energy: dailyCheckInEnergy }));
    addExp(15);
  };

  const handleClaimDailyReward = () => {
    if (!canClaimDailyReward) return;
    setDailyRewardDate(todayKey);
    setEnergy((value) => value + dailyMissionEnergy);
    setAppEvents((events) => recordAppEvent(events, 'daily_reward', { energy: dailyMissionEnergy }));
    addExp(30);
  };

  const handleClaimReturnReward = () => {
    if (!canClaimReturnReward) return;
    const amount = plusActive ? 3 : 2;
    setEngagement((current) => ({ ...current, returnRewardDate: todayKey }));
    setEnergy((value) => value + amount);
    setAppEvents((events) => recordAppEvent(events, 'return_reward', { energy: amount, activeDays: engagement.activeDays }));
    addExp(10);
  };

  const handleNextBestAction = () => {
    if (nextBestAction.prompt) {
      handleSend(nextBestAction.prompt);
      return;
    }
    if (nextBestAction.route) navigate(nextBestAction.route);
  };

  const handleMemoryRecallAction = () => {
    if (memoryRecall.prompt) {
      handleSend(memoryRecall.prompt);
      return;
    }
    navigate('/app/diary');
  };

  const handleDailyMissionShortcut = (mission: 'ask' | 'diary' | 'simulator') => {
    if (mission === 'ask') {
      setShowDailyPanel(false);
      window.setTimeout(() => inputRef.current?.focus(), 80);
      return;
    }
    navigate(mission === 'diary' ? '/app/diary' : '/app/simulator');
  };

  const handleSend = async (textOverride?: string, options: { mode?: SendMode } = {}) => {
    const question = (textOverride || inputText).trim();
    if (!question || isThinking) return;
    if (!plusActive && energy <= 0) {
      openUpgradePrompt('energy');
      return;
    }

    const currentReading = tarotReadings[0];
    const hasCurrentReading = Boolean(currentReading || hasDrawnCard);
    const mode = options.mode ?? 'auto';
    const shouldDraw =
      mode === 'draw' || (mode === 'auto' && shouldCreateNewReading(question, hasCurrentReading));
    const cards = shouldDraw ? drawCards(getDrawCount(question)) : [];
    const currentImages = currentReading?.cardImages?.length
      ? currentReading.cardImages
      : currentReading?.cardImage
        ? [currentReading.cardImage]
        : hasDrawnCard
          ? [cardImage]
          : [];
    const cardsText = shouldDraw ? formatCards(cards) : currentReading?.cards ?? '当前牌面';
    const image = shouldDraw ? cards[0]?.image || '/default-card.png' : currentImages[0] || cardImage || '/default-card.png';
    const images = shouldDraw ? cards.map((card) => card.image) : currentImages;
    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      text: question,
      timestamp: Date.now(),
    };
    let drawingStartedAt = Date.now();

    clearInputDraft('');
    setIsThinking(true);
    setIsDrawingCards(false);
    setDrawingCards(shouldDraw ? cards : []);
    setComposerFocused(false);
    setAutoScrollOnNextMessage(true);
    if (!plusActive) {
      setEnergy((value) => Math.max(0, value - 1));
    }
    if (shouldDraw) setCardImage(image);
    setMessages((prev) => [...prev, userMessage]);
    if (shouldDraw) {
      await preloadImages(images);
      drawingStartedAt = Date.now();
      setIsDrawingCards(true);
    }

    let answer = shouldDraw
      ? fallbackAnswer(question, cards)
      : fallbackCurrentReadingAnswer(question, currentReading);
    try {
      const response = await fetch('/api/deepseek/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-chat',
          isInternetMode,
          messages: [
            {
              role: 'system',
              content:
                '你是星轨里的中文塔罗少女。回答要客观但温柔，像在轻声陪伴用户看清问题；不要恐吓、不要审判、不要冷冰冰地下结论。不要使用 Markdown 星号、加粗符号或井号标题。没有明确要求抽牌时，不要重新抽牌，只基于当前上下文继续解读。可以适度引用用户已留下的牌迹、日记、档案和沙盘线索，让回答像接着上次聊，但不要机械暴露数据清单。',
            },
            {
              role: 'user',
              content: [
                TAROT_SYSTEM_PROMPT,
                memoryContextText,
                profileTarotContextText,
                shouldDraw
                  ? buildPrompt(question, cards, isInternetMode)
                  : buildCurrentReadingPrompt(question, currentReading, image, isInternetMode),
              ].filter(Boolean).join('\n\n'),
            },
          ],
        }),
      });
      const data = await response.json();
      answer = data?.choices?.[0]?.message?.content || answer;
    } catch (error) {
      console.error('Tarot request failed:', error);
    }
    answer = cleanTarotAnswer(answer);

    const drawingElapsed = Date.now() - drawingStartedAt;
    if (shouldDraw && drawingElapsed < DRAW_ANIMATION_MIN_MS) {
      await new Promise((resolve) => window.setTimeout(resolve, DRAW_ANIMATION_MIN_MS - drawingElapsed));
    }

    const aiMessage = {
      id: crypto.randomUUID(),
      role: 'ai' as const,
      text: answer,
      timestamp: Date.now(),
      ...(shouldDraw ? { cardImage: image, cardImages: images } : {}),
    };

    setMessages((prev) => [...prev, aiMessage]);
    if (shouldDraw) {
      setTarotReadings((prev) => {
        const nextReadings = [
          {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            question,
            cards: cardsText,
            summary: answer.trim(),
            cardImage: image,
            cardImages: images,
          },
          ...prev,
        ];
        if (!plusActive && nextReadings.length > readingLimit) {
          window.setTimeout(() => openUpgradePrompt('history'), 450);
        }
        return nextReadings.slice(0, readingLimit);
      });
      setAppEvents((events) => recordAppEvent(events, 'tarot_draw', {
        spread: cards.length,
        plus: plusActive,
        energySpent: plusActive ? 0 : 1,
      }));
      addExp(Math.floor(Math.random() * 8) + 8);
    } else {
      setAppEvents((events) => recordAppEvent(events, 'tarot_draw', {
        kind: 'followup',
        hasCurrentReading,
        plus: plusActive,
        energySpent: plusActive ? 0 : 1,
      }));
      addExp(3);
    }
    setIsThinking(false);
    setIsDrawingCards(false);
    setDrawingCards([]);
  };

  const handleRegenerate = () => {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    if (lastUserMessage) handleSend(lastUserMessage.text);
  };

  const handleCopy = async (text: string) => {
    await copyTextToClipboard(text);
  };

  const handleClearHistory = () => {
    setMessages([]);
    setCardImage('/default-card.png');
    setShowClearConfirm(false);
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setInputText((prev) => prev || '这个浏览器暂时不能语音输入，我直接打字。');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.onresult = (event: any) => {
      setInputText((prev) => `${prev}${prev ? ' ' : ''}${event.results[0][0].transcript}`);
    };
    recognition.start();
  };

  const handleShareReadingCard = async (reading: TarotReading) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 10;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.font = '800 38px sans-serif';
    const questionLines = getCanvasTextLines(ctx, reading.question || '一次没有命名的问题', 488);
    ctx.font = '800 30px sans-serif';
    const cardLines = getCanvasTextLines(ctx, reading.cards || '未记录牌面', 488);
    ctx.font = '500 30px sans-serif';
    const summaryLines = getCanvasTextLines(ctx, reading.summary || '这次牌面已经留在档案里。', 896);
    const sideTextBottom = 318 + questionLines.length * 52 + 56 + cardLines.length * 44;
    const summaryTop = Math.max(880, sideTextBottom + 80);
    const canvasHeight = Math.max(1440, summaryTop + summaryLines.length * 52 + 190);

    canvas.height = canvasHeight;

    const bg = ctx.createLinearGradient(0, 0, 1080, canvasHeight);
    bg.addColorStop(0, '#0b1020');
    bg.addColorStop(1, '#070912');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, canvasHeight);

    ctx.fillStyle = 'rgba(244,207,131,0.14)';
    ctx.beginPath();
    ctx.arc(860, 210, 260, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#F4CF83';
    ctx.font = '800 46px sans-serif';
    ctx.fillText('星轨牌迹', 92, 120);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '600 30px sans-serif';
    ctx.fillText(new Date(reading.date).toLocaleDateString('zh-CN'), 92, 168);

    const image = new Image();
    image.crossOrigin = 'anonymous';
    const loaded = await new Promise<boolean>((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = reading.cardImage || '/default-card.png';
    });

    if (loaded) ctx.drawImage(image, 92, 230, 360, 560);
    ctx.fillStyle = '#F4CF83';
    ctx.font = '800 24px sans-serif';
    ctx.fillText('提问', 500, 268);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 38px sans-serif';
    const questionBottom = drawCanvasLines(ctx, questionLines, 500, 318, 52);
    ctx.fillStyle = '#F4CF83';
    ctx.font = '800 24px sans-serif';
    ctx.fillText('牌面', 500, questionBottom + 34);
    ctx.fillStyle = '#F4CF83';
    ctx.font = '800 30px sans-serif';
    drawCanvasLines(ctx, cardLines, 500, questionBottom + 82, 44);
    ctx.fillStyle = '#F4CF83';
    ctx.font = '800 28px sans-serif';
    ctx.fillText('星轨解读', 92, summaryTop - 44);
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '500 30px sans-serif';
    drawCanvasLines(ctx, summaryLines, 92, summaryTop, 52);

    ctx.fillStyle = 'rgba(244,207,131,0.58)';
    ctx.font = '600 24px sans-serif';
    ctx.fillText('星轨 AstroRail · 每一次牌迹都值得完整留下', 92, canvasHeight - 76);

    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('分享图生成失败');
      const file = new File([blob], `星轨牌迹-${Date.now()}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: '我的星轨牌迹', files: [file] });
          return;
        } catch (error: any) {
          if (error?.name === 'AbortError') return;
          console.warn('Native share failed, falling back to download:', error);
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (error) {
      console.error('Share image failed:', error);
      window.alert('分享图生成失败，请稍后再试。');
    }
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    setShowScrollTop(target.scrollTop > 360);
    setShowScrollBottom(target.scrollHeight - target.scrollTop - target.clientHeight > 220);
  };

  const openDailyTasksFromChat = () => {
    setShowDailyPanel(true);
    setShowScrollTop(false);
    setShowScrollBottom(true);
    const scrollToDaily = () => {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.requestAnimationFrame(scrollToDaily);
    window.setTimeout(scrollToDaily, 80);
  };

  const showComposerSuggestions = composerFocused && !isThinking;

  const composerSuggestions = (
    <AnimatePresence initial={false}>
      {showComposerSuggestions && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="mx-auto mb-1.5 flex w-full max-w-[min(540px,calc(100vw-28px))] gap-1.5 overflow-x-auto rounded-[18px] border border-[#efe3cf]/72 bg-[#fffaf2]/72 p-1.5 shadow-[0_16px_44px_rgba(84,55,24,0.11),inset_0_1px_0_rgba(255,255,255,0.74)] backdrop-blur-2xl no-scrollbar dark:border-white/[0.08] dark:bg-[#111522]/74 dark:shadow-[0_18px_48px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.07)] sm:mb-2 sm:gap-2 sm:rounded-[22px] sm:p-2"
        >
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setShowReadingLog(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-[14px] border border-[#f4cf83]/32 bg-[#f4cf83]/18 px-2.5 py-1.5 text-[11px] font-bold text-[#9b641e] shadow-[inset_0_1px_0_rgba(255,255,255,0.54)] transition-transform active:scale-[0.98] dark:border-[#f4cf83]/20 dark:bg-[#f4cf83]/12 dark:text-[#f4cf83] sm:rounded-[16px] sm:px-3 sm:py-2 sm:text-[12px]"
            aria-label="打开牌迹档案"
          >
            <BookOpen size={13} />
            牌迹
          </button>
          {COMPOSER_SUGGESTIONS.map((item) => (
            <button
              key={item.label}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSend(item.prompt)}
              className="shrink-0 rounded-[14px] border border-[#eadcc8]/64 bg-white/52 px-2.5 py-1.5 text-[11px] font-semibold text-[#6f6253] shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] transition-transform active:scale-[0.98] dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-white/64 sm:rounded-[16px] sm:px-3 sm:py-2 sm:text-[12px]"
            >
              {item.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const composer = (
    <div className="mx-auto flex w-full max-w-[540px] items-center gap-2 rounded-[24px] border border-[#efe3cf]/80 bg-[#fffaf2]/92 p-2 shadow-[0_18px_48px_rgba(84,55,24,0.12),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-[#111522]/92 dark:shadow-[0_20px_54px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <button
        onClick={() => setIsInternetMode((value) => !value)}
        className={clsx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] transition-all',
          isInternetMode
            ? 'bg-[#2f5fff]/12 text-[#3558d4] dark:bg-[#7c9cff]/16 dark:text-[#b8c7ff]'
            : 'bg-[#efe2cc] text-[#7f715f] dark:bg-white/[0.06] dark:text-white/55',
        )}
        aria-label={isInternetMode ? '关闭联网提示' : '开启联网提示'}
        title={isInternetMode ? '关闭联网提示' : '开启联网提示'}
      >
        <Globe size={19} />
      </button>
      <div className="relative flex flex-1 items-center">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          onFocus={() => setComposerFocused(true)}
          onBlur={() => window.setTimeout(() => setComposerFocused(false), 140)}
          onKeyDown={(event) => event.key === 'Enter' && handleSend()}
          disabled={isThinking}
          placeholder="说说你现在最想问的事"
          className="h-10 w-full rounded-[18px] bg-[#f3eadc] pl-4 pr-[74px] text-[14px] font-medium text-[#241c14] placeholder:text-[#8b7e6d]/72 outline-none transition-all focus:bg-white focus:ring-4 focus:ring-[#d9a84f]/16 dark:bg-black/24 dark:text-white dark:placeholder:text-white/38 dark:focus:bg-black/34"
        />
        <button
          onClick={handleVoiceInput}
          disabled={isThinking}
          title="语音输入"
          aria-label="语音输入"
          className="absolute right-9 flex h-8 w-8 items-center justify-center rounded-[14px] text-[#81715f] transition-colors disabled:opacity-50 dark:text-white/45"
        >
          <Mic size={20} />
        </button>
        <button
          onClick={() => handleSend()}
          disabled={!inputText.trim() || isThinking}
          aria-label="发送"
          className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-[14px] bg-[#17130f] text-[#f4cf83] shadow-[0_10px_20px_rgba(55,35,12,0.18)] transition-transform active:scale-95 disabled:opacity-35 dark:bg-[#f4cf83] dark:text-[#17130f]"
        >
          <Send size={16} className="ml-0.5" />
        </button>
      </div>
    </div>
  );

  const contextActionDock = (
    <AnimatePresence initial={false}>
      {visibleMessages.length > 0 && !showComposerSuggestions && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="mx-auto mb-1.5 grid w-full max-w-[min(540px,calc(100vw-28px))] grid-cols-3 gap-1.5 rounded-[22px] border border-[#efe3cf]/72 bg-[#fff8ee]/82 p-1.5 shadow-[0_16px_42px_rgba(84,55,24,0.10),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-[#111522]/82 dark:shadow-[0_16px_42px_rgba(0,0,0,0.40),inset_0_1px_0_rgba(255,255,255,0.07)]"
        >
          <button
            type="button"
            onClick={() => setShowReadingLog(true)}
            className="flex min-w-0 items-center gap-2 rounded-[18px] bg-[#f4cf83]/18 px-2 py-2 text-left text-[#8f5e1b] transition-transform active:scale-[0.98] dark:bg-[#f4cf83]/12 dark:text-[#f4cf83]"
            aria-label="打开牌迹档案"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] bg-[#fff4dc]/78 dark:bg-[#f4cf83]/10">
              <BookOpen size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-bold">牌迹</span>
              <span className="block truncate text-[10px] text-[#746653] dark:text-white/48">{tarotReadings.length} 条</span>
            </span>
          </button>

          <button
            type="button"
            onClick={handleMemoryRecallAction}
            disabled={isThinking}
            className="flex min-w-0 items-center gap-2 rounded-[18px] px-2 py-2 text-left text-[#6f6253] transition-transform active:scale-[0.98] disabled:opacity-55 dark:text-white/62"
            aria-label="继续星轨记忆"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] bg-[#f1dfbc]/78 text-[#9b641e] dark:bg-[#f4cf83]/10 dark:text-[#f4cf83]">
              <Sparkles size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-bold text-[#8f5e1b] dark:text-[#f4cf83]">记得你</span>
              <span className="block truncate text-[10px] text-[#746653] dark:text-white/48">{memoryRecall.meta}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={openDailyTasksFromChat}
            className="flex min-w-0 items-center gap-2 rounded-[18px] px-2 py-2 text-left text-[#6f6253] transition-transform active:scale-[0.98] dark:text-white/62"
            aria-label="打开今日任务"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] bg-[#f1dfbc]/78 text-[#9b641e] dark:bg-[#f4cf83]/10 dark:text-[#f4cf83]">
              <CalendarCheck size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-bold text-[#8f5e1b] dark:text-[#f4cf83]">{canClaimDailyReward ? '领奖励' : '任务'}</span>
              <span className="block truncate text-[10px] text-[#746653] dark:text-white/48">{missionCount}/3</span>
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const companionPet = (wrapperClassName: string, docked = false) => (
    <div className={wrapperClassName}>
      <div
        data-testid="companion-pet"
        onPointerDown={handlePetPointerDown}
        onPointerMove={handlePetPointerMove}
        onPointerUp={handlePetPointerUp}
        onPointerCancel={handlePetPointerUp}
        style={{ transform: `translate3d(${petOffset.x}px, ${petOffset.y}px, 0)` }}
        className={clsx(
          'h-full w-full cursor-grab touch-none active:cursor-grabbing',
          docked && 'drop-shadow-[0_18px_24px_rgba(0,0,0,0.22)]',
        )}
        aria-label="可拖动的星轨小桌宠"
        role="img"
      >
        <motion.img
          src={activePetImage}
          alt="星轨引路人"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none h-full w-full select-none object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,0.14)]"
          draggable={false}
        />
      </div>
    </div>
  );

  return (
    <div className="relative h-full overflow-hidden bg-[#f2eadf] text-[#241c14] dark:bg-[#07080f] dark:text-[#f8f2e7]">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              theme === 'dark'
                ? 'linear-gradient(180deg, rgba(16,19,31,0.98) 0%, rgba(7,8,15,1) 54%, rgba(3,4,8,1) 100%)'
                : 'linear-gradient(180deg, rgba(252,246,236,1) 0%, rgba(242,234,223,1) 52%, rgba(226,212,193,1) 100%)',
          }}
        />
        <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgba(208,147,63,0.24),transparent_64%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(244,207,131,0.12),transparent_64%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(86,61,32,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(86,61,32,0.032)_1px,transparent_1px)] bg-[size:42px_42px] opacity-70 dark:bg-[linear-gradient(rgba(255,255,255,0.026)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.34)_48%,transparent_72%)] opacity-45 dark:opacity-[0.04]" />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={clsx(
          'relative z-10 h-full overflow-x-hidden overflow-y-auto px-4 pt-4 no-scrollbar sm:px-6',
          visibleMessages.length > 0 ? 'pb-[224px]' : 'pb-[132px]',
        )}
      >
        <div
          className="mx-auto flex max-w-[540px] min-w-0 flex-col gap-3.5"
          style={{ width: 'min(540px, calc(100vw - 32px))' }}
        >
          <header className="flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-[28px] border border-[#eadcc8]/80 bg-[#fff8ed]/82 px-3 py-3 shadow-[0_16px_46px_rgba(94,64,31,0.10),inset_0_1px_0_rgba(255,255,255,0.86)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-white/[0.065] dark:shadow-[0_18px_46px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[18px] bg-[#efe0c7] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:bg-white/[0.08]">
                <img src={activeCompanionImage} alt="星轨塔罗" className="h-full w-full object-contain p-1" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a6a28] dark:text-[#f4cf83]">
                  星轨塔罗
                </p>
                <h1 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]">
                  LV.{bondLevel} {LEVEL_TITLES[bondLevel - 1]}
                </h1>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#d9cbb7] dark:bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#c88a34] to-[#6f84e8]"
                      initial={false}
                      animate={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-apple-text-muted">{progressPercent}%</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => openUpgradePrompt('energy')}
                className="flex h-9 items-center gap-1 rounded-[16px] bg-[#f1dfbc] px-3 text-[#8e5d19] shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] transition-transform active:scale-95 dark:bg-[#f4cf83]/12 dark:text-[#f4cf83]"
                title={membershipLabel}
              >
                <Sparkles size={15} />
                <span className="text-[13px] font-semibold">{testerActive ? '∞' : plusActive ? 'Plus' : energy}</span>
              </button>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="hidden h-9 w-9 items-center justify-center rounded-[16px] bg-[#f6eddf] text-[#7f715f] shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] transition-transform active:scale-95 min-[430px]:flex dark:bg-white/[0.07] dark:text-white/55"
                aria-label="切换白天和夜间"
                title="切换白天和夜间"
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button
                onClick={() => setShowWardrobe(true)}
                className="flex h-9 w-9 items-center justify-center rounded-[16px] bg-[#f6eddf] text-[#7f715f] shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] transition-transform active:scale-95 dark:bg-white/[0.07] dark:text-white/55"
                aria-label="打开衣柜"
                title="衣柜"
              >
                <Shirt size={17} />
              </button>
            </div>
          </header>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 24 }}
            className={clsx(
              'relative overflow-hidden border border-[#e4d3ba]/80 bg-[#fff7ea]/72 shadow-[0_26px_74px_rgba(91,61,27,0.13),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-[#101420]/72 dark:shadow-[0_28px_74px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.08)]',
              visibleMessages.length > 0 ? 'rounded-[24px] p-3' : 'rounded-[34px] p-4',
            )}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.38),transparent_44%),linear-gradient(180deg,transparent,rgba(124,90,45,0.08))] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.055),transparent_42%),linear-gradient(180deg,transparent,rgba(244,207,131,0.05))]" />
            <div className="pointer-events-none absolute inset-x-5 top-[86px] h-px bg-gradient-to-r from-transparent via-[#a47a42]/18 to-transparent dark:via-white/10" />
            <DrawCardAnimation
              active={isDrawingCards}
              image={cardImage}
              cards={drawingCards}
              compact={visibleMessages.length > 0}
            />
            <div className="relative z-10 flex min-w-0 items-center justify-between gap-2">
              <button
                onClick={() => setShowDailyPanel((value) => !value)}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[18px] bg-[#f3e8d8]/82 px-3 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition-transform active:scale-[0.98] dark:bg-white/[0.07]"
                title={showDailyPanel ? '收起今日任务' : '展开今日任务'}
              >
                <CalendarCheck size={15} className="shrink-0 text-[#b97b28] dark:text-[#f4cf83]" />
                <span className="truncate text-[12px] font-semibold text-[#4c3b29] dark:text-white/78">
                  今日任务 {missionCount}/3 · 连续 {checkInStreak} 天
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full bg-white/48 px-2 py-1 text-[10px] font-semibold text-[#7c674c] dark:bg-white/[0.08] dark:text-white/58">
                  {showDailyPanel ? '收起' : '展开'}
                  {showDailyPanel ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </span>
              </button>
              <button
                onClick={handleDailyCheckIn}
                disabled={hasCheckedInToday}
                className={clsx(
                  'h-9 shrink-0 rounded-[18px] px-3.5 text-[13px] font-semibold transition-all',
                  hasCheckedInToday
                    ? 'bg-[#f6eddf] text-[#877967] shadow-[inset_0_1px_0_rgba(255,255,255,0.56)] dark:bg-white/[0.07] dark:text-white/52'
                    : 'bg-[#17130f] text-[#f4cf83] shadow-[0_14px_34px_rgba(53,34,13,0.18)] active:scale-[0.98] dark:bg-[#f4cf83] dark:text-[#17130f]',
                )}
              >
                {hasCheckedInToday ? '已领取' : '今日可领'}
              </button>
            </div>

            <div className={clsx('relative z-10 mt-2', visibleMessages.length > 0 ? 'min-h-[82px]' : 'min-h-[300px]')}>
              {visibleMessages.length > 0 && (
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                  <div className="relative h-14 w-12">
                    <div className="absolute left-0 top-1 h-12 w-8 -rotate-6 rounded-[10px] bg-[#111827] shadow-[0_10px_20px_rgba(18,14,9,0.18)]" />
                    {(cardStackImages[0] || hasDrawnCard) && (
                      <img
                        src={cardStackImages[0] || cardImage}
                        alt="当前牌面"
                        className="absolute right-0 top-0 h-14 w-9 rotate-6 rounded-[10px] object-cover object-top shadow-[0_10px_20px_rgba(18,14,9,0.18)] ring-1 ring-black/5"
                      />
                    )}
                  </div>
                  <div className="min-w-0 rounded-[20px] border border-white/60 bg-white/56 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.045]">
                    <p className="text-[11px] font-semibold text-[#9b641e] dark:text-[#f4cf83]">当前牌面</p>
                    <p className="mt-1 line-clamp-2 break-words text-sm font-medium leading-snug text-[#3b3024] dark:text-white/72">
                      {isThinking ? '解读中...' : companionBubbleText}
                    </p>
                  </div>
                  <div className="flex w-[58px] shrink-0 flex-col gap-1.5">
                    <button
                      onClick={() => setShowReadingLog(true)}
                      className="flex h-9 items-center justify-center gap-1 rounded-[16px] border border-[#f4cf83]/28 bg-[#f4cf83]/14 text-[10px] font-bold text-[#9b641e] shadow-[inset_0_1px_0_rgba(255,255,255,0.50)] dark:border-[#f4cf83]/18 dark:bg-[#f4cf83]/10 dark:text-[#f4cf83]"
                      aria-label="打开牌迹档案"
                      title="牌迹档案"
                    >
                      <BookOpen size={13} />
                      牌迹
                    </button>
                    <button
                      onClick={() => handleSend('解读当前牌面', { mode: 'current' })}
                      disabled={isThinking}
                      className="flex h-9 items-center justify-center gap-1 rounded-[16px] bg-[#17130f] text-[10px] font-bold text-[#f4cf83] shadow-[0_12px_26px_rgba(55,35,12,0.18)] disabled:opacity-45 dark:bg-[#f4cf83] dark:text-[#17130f]"
                      aria-label="解读当前牌面"
                      title="解读当前牌面"
                    >
                      <Sparkles size={13} />
                      解读
                    </button>
                  </div>
                </div>
              )}
              {visibleMessages.length === 0 && (
                <>
              <div className="absolute right-0 top-1 flex h-[86px] w-[86px] items-center justify-center rounded-[28px] bg-[#f0e4d2]/72 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] dark:bg-white/[0.055]">
                <div>
                  <p className="text-[12px] font-semibold text-apple-text-muted">羁绊</p>
                  <p className="mt-1 text-2xl font-semibold text-[#9b641e] dark:text-[#f4cf83]">{progressPercent}%</p>
                </div>
              </div>

              <div className="absolute left-0 top-9 h-[172px] w-[148px]">
                {cardStackImages.length > 0 ? (
                  <AnimatePresence initial={false}>
                    {cardStackImages.map((image, index) => {
                      const rotate = -13 + index * 8;
                      return (
                        <motion.img
                          key={`${image}-${index}`}
                          src={image}
                          alt="抽到的塔罗牌"
                          initial={{ opacity: 0, y: -40, rotate: rotate - 12, scale: 0.72 }}
                          animate={{
                            opacity: 1,
                            x: index * 18,
                            y: index * 7,
                            rotate,
                            scale: 1 - index * 0.035,
                          }}
                          exit={{ opacity: 0, y: 20, scale: 0.8 }}
                          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: index * 0.035 }}
                          className="absolute left-2 top-2 h-[154px] w-[100px] rounded-[20px] object-cover object-top shadow-[0_22px_42px_rgba(54,37,18,0.22)] ring-1 ring-black/5 dark:shadow-[0_20px_46px_rgba(0,0,0,0.48)] dark:ring-white/10"
                          style={{ zIndex: 20 - index }}
                        />
                      );
                    })}
                  </AnimatePresence>
                ) : (
                  <button
                    onClick={() => handleSend('今日运势')}
                    disabled={isThinking}
                    className="flex h-[154px] w-[100px] -rotate-6 flex-col items-center justify-center gap-3 rounded-[20px] bg-[linear-gradient(145deg,#182035,#05070e)] text-[#f4cf83] shadow-[0_22px_42px_rgba(54,37,18,0.22)] ring-1 ring-white/10 transition-transform active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles size={30} />
                    <span className="text-[10px] font-semibold tracking-[0.2em]">TAROT</span>
                  </button>
                )}
              </div>

              {isDrawingCards && (
                <motion.div
                  initial={{ opacity: 0, x: 220, y: 40, rotate: 22, scale: 0.5 }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    x: [220, 122, 46, 18],
                    y: [40, -8, 18, 28],
                    rotate: [22, -9, -17, -12],
                    scale: [0.5, 0.82, 1, 0.96],
                  }}
                  transition={{ duration: 0.95, ease: 'easeInOut' }}
                  className="pointer-events-none absolute left-0 top-9 z-40 h-[154px] w-[100px] rounded-[20px] bg-[linear-gradient(145deg,#182035,#05070e)] shadow-[0_20px_44px_rgba(54,37,18,0.24)]"
                >
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[#f4cf83]">
                    <Sparkles size={28} />
                    <span className="text-[10px] font-semibold tracking-[0.22em]">DRAW</span>
                  </div>
                </motion.div>
              )}

              <div className="pointer-events-none absolute bottom-[70px] left-[29%] right-0 z-30 rounded-[24px] border border-white/60 bg-[rgba(255,250,241,0.78)] px-4 py-3.5 shadow-[0_16px_34px_rgba(88,62,30,0.10),inset_0_1px_0_rgba(255,255,255,0.74)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-[rgba(14,18,27,0.78)] dark:shadow-[0_18px_38px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)]">
                <p className="text-[12px] font-semibold text-[#b97b28] dark:text-[#f4cf83]">星轨碎碎念</p>
                <p className="mt-1 line-clamp-3 text-[14px] font-medium leading-relaxed">
                  {companionBubbleText}
                </p>
              </div>

              <div className="absolute inset-x-0 bottom-0 z-30 grid grid-cols-[1fr_auto] gap-3">
                <button
                  onClick={() => handleSend('今日运势')}
                  disabled={isThinking}
                  className="h-[52px] rounded-[22px] bg-[#17130f] text-[17px] font-semibold text-[#f4cf83] shadow-[0_18px_36px_rgba(55,35,12,0.18)] transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-[#f4cf83] dark:text-[#17130f]"
                >
                  抽一张今日牌
                </button>
                <button
                  onClick={() => setShowReadingLog(true)}
                  className="flex h-[52px] w-[74px] flex-col items-center justify-center gap-0.5 rounded-[22px] bg-[#f4ecdf] text-[#806f5c] shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] transition-transform active:scale-95 dark:bg-white/[0.07] dark:text-white/58"
                  aria-label="打开牌迹"
                  title="牌迹档案"
                >
                  <BookOpen size={18} />
                  <span className="text-[10px] font-bold leading-none">牌迹</span>
                </button>
              </div>
                </>
              )}

              <AnimatePresence>
                {isThinking && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/78 px-4 py-2 text-xs font-semibold text-[#b97b28] shadow-[0_12px_30px_rgba(70,45,20,0.12)] backdrop-blur-xl dark:bg-white/[0.10] dark:text-[#f4cf83]"
                  >
                    <Loader2 className="animate-spin" size={14} />
                    星轨解读中
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.section>

          {visibleMessages.length === 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, type: 'spring', stiffness: 220, damping: 24 }}
              className="order-2 overflow-hidden rounded-[24px] border border-[#d5c3a9]/70 bg-[#fff9ef]/62 p-3 shadow-[0_16px_42px_rgba(88,60,28,0.09),inset_0_1px_0_rgba(255,255,255,0.68)] backdrop-blur-2xl dark:border-white/[0.07] dark:bg-white/[0.047]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9b641e] dark:text-[#f4cf83]">
                    <BookOpen size={13} />
                    <span>星轨档案成熟度</span>
                  </div>
                  <h3 className="mt-1 truncate text-[15px] font-semibold text-[#2a2118] dark:text-white/86">
                    {archiveMaturityLabel}
                  </h3>
                </div>
                <div className="shrink-0 rounded-full bg-[#17130f] px-3 py-1.5 text-[12px] font-semibold text-[#f4cf83] dark:bg-[#f4cf83] dark:text-[#17130f]">
                  {archiveMaturityScore}%
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eadcc8]/80 dark:bg-white/[0.08]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#c88a34] via-[#f4cf83] to-[#7c9cff]"
                  initial={false}
                  animate={{ width: `${archiveMaturityScore}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {archiveSignals.map((signal) => (
                  <div
                    key={signal.id}
                    className={clsx(
                      'rounded-[17px] border px-3 py-2',
                      signal.done
                        ? 'border-[#f4cf83]/28 bg-[#f4cf83]/12'
                        : 'border-[#eadcc8]/64 bg-white/36 dark:border-white/[0.06] dark:bg-white/[0.04]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-[#2a2118] dark:text-white/80">{signal.label}</span>
                      <span className={clsx('text-[10px] font-bold', signal.done ? 'text-[#9b641e] dark:text-[#f4cf83]' : 'text-[#85745f] dark:text-white/45')}>
                        {signal.done ? '已接入' : signal.value}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[#746653] dark:text-white/50">
                      {signal.done ? signal.value : signal.desc}
                    </p>
                  </div>
                ))}
              </div>
              {archiveNextSignal && (
                <div className="mt-3 rounded-[18px] bg-[#f3e5ce]/54 px-3 py-2 text-[11px] leading-relaxed text-[#746653] dark:bg-white/[0.05] dark:text-white/50">
                  下一步：{archiveNextSignal.desc}
                </div>
              )}
            </motion.section>
          )}

          {visibleMessages.length === 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, type: 'spring', stiffness: 220, damping: 24 }}
              className="order-2 overflow-hidden rounded-[24px] border border-[#eadcc8]/72 bg-[#fff8ee]/64 p-3 shadow-[0_16px_42px_rgba(88,60,28,0.10),inset_0_1px_0_rgba(255,255,255,0.70)] backdrop-blur-2xl dark:border-white/[0.07] dark:bg-white/[0.052] dark:shadow-[0_18px_44px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.07)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#a06b22] dark:text-[#f4cf83]">
                    <Sparkles size={13} />
                    <span>星轨记得你</span>
                    <span className="rounded-full bg-[#f3e5ce]/72 px-2 py-0.5 text-[10px] text-[#83613a] dark:bg-white/[0.07] dark:text-white/50">
                      {memoryRecall.meta}
                    </span>
                  </div>
                  <h2 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-[#2a2118] dark:text-white/86">
                    {memoryRecall.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[#746653] dark:text-white/52">
                    {memoryRecall.desc}
                  </p>
                  <div className="mt-3 grid gap-1.5">
                    {visibleMemoryInsights.map((insight) => (
                      <div
                        key={`${insight.label}-${insight.text}`}
                        className="grid gap-0.5 rounded-[16px] border border-[#eadcc8]/64 bg-white/42 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.56)] dark:border-white/[0.06] dark:bg-white/[0.045]"
                      >
                        <span className="text-[10px] font-semibold text-[#a06b22] dark:text-[#f4cf83]">
                          {insight.label}
                        </span>
                        <span className="line-clamp-2 text-[11px] leading-relaxed text-[#746653] dark:text-white/52">
                          {insight.text}
                        </span>
                      </div>
                    ))}
                    {!plusActive && memoryRecall.insights.length > visibleMemoryInsights.length && (
                      <button
                        type="button"
                        onClick={() => openUpgradePrompt('history')}
                        className="h-8 rounded-[16px] border border-[#eadcc8]/64 bg-[#f8ecd7]/52 px-3 text-[11px] font-semibold text-[#9b641e] transition-colors hover:bg-[#f2dfbf]/70 dark:border-white/[0.06] dark:bg-white/[0.05] dark:text-[#f4cf83]"
                      >
                        解锁完整 3 条记忆线索
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleMemoryRecallAction}
                  disabled={isThinking}
                  className="shrink-0 rounded-[17px] bg-[#17130f] px-3 py-2 text-[12px] font-semibold text-[#f4cf83] shadow-[0_12px_28px_rgba(55,35,12,0.16)] transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-[#f4cf83] dark:text-[#17130f]"
                >
                  {memoryRecall.cta}
                </button>
              </div>
            </motion.section>
          )}

          {visibleMessages.length === 0 && weeklyReviewReady && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, type: 'spring', stiffness: 220, damping: 24 }}
              className="order-2 rounded-[24px] border border-[#d9b56d]/34 bg-[#fff4df]/70 p-3 shadow-[0_14px_34px_rgba(120,82,24,0.10)] dark:border-[#f4cf83]/16 dark:bg-[#f4cf83]/[0.055]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9b641e] dark:text-[#f4cf83]">
                    <CalendarCheck size={13} />
                    <span>7 日星轨复盘</span>
                    <span className="rounded-full bg-[#f1dfbd]/80 px-2 py-0.5 text-[10px] text-[#83613a] dark:bg-white/[0.07] dark:text-white/55">
                      {weeklyMaterialCount} 条材料
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[#746653] dark:text-white/54">
                    {plusActive ? '完整趋势、证据和行动建议已经可看。' : '你已经有材料做复盘了，免费版先看摘要，Plus 解锁完整报告。'}
                  </p>
                </div>
                <button
                  onClick={() => setShowReadingLog(true)}
                  className="shrink-0 rounded-[17px] bg-[#17130f] px-3 py-2 text-[12px] font-semibold text-[#f4cf83] shadow-[0_12px_28px_rgba(55,35,12,0.16)] active:scale-[0.98] dark:bg-[#f4cf83] dark:text-[#17130f]"
                >
                  查看复盘
                </button>
              </div>
            </motion.section>
          )}

          {visibleMessages.length === 0 && softConversionTrigger && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, type: 'spring', stiffness: 220, damping: 24 }}
              className="order-2 rounded-[24px] border border-[#2347d9]/18 bg-[#f5f7ff]/72 p-3 shadow-[0_14px_34px_rgba(48,73,160,0.08)] dark:border-[#7c9cff]/16 dark:bg-[#7c9cff]/[0.055]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#3558d4] dark:text-[#b8c7ff]">
                    <Crown size={13} />
                    <span>Plus 时机到了</span>
                  </div>
                  <h3 className="mt-1 line-clamp-1 text-[14px] font-semibold text-[#241c14] dark:text-white/86">
                    {softConversionTrigger.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[#746653] dark:text-white/52">
                    {softConversionTrigger.desc}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={dismissSoftConversion}
                    className="rounded-full p-2 text-[#83715c] hover:bg-black/[0.04] dark:text-white/45 dark:hover:bg-white/[0.07]"
                    aria-label="稍后再看"
                  >
                    <X size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={handleSoftConversion}
                    className="rounded-[16px] bg-[#17130f] px-3 py-2 text-[12px] font-semibold text-[#f4cf83] shadow-[0_12px_28px_rgba(55,35,12,0.14)] active:scale-[0.98] dark:bg-[#f4cf83] dark:text-[#17130f]"
                  >
                    {softConversionTrigger.cta}
                  </button>
                </div>
              </div>
            </motion.section>
          )}

          {visibleMessages.length === 0 && !showDailyPanel && (
          <section className="order-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  disabled={isThinking}
                  className="flex h-8 min-w-0 items-center justify-center rounded-[16px] border border-[#eadcc8]/64 bg-[#fff8ee]/58 px-2 text-[12px] font-medium text-[#6f6253] shadow-[inset_0_1px_0_rgba(255,255,255,0.56)] transition-colors hover:text-[#241c14] disabled:opacity-50 dark:border-white/[0.06] dark:bg-white/[0.05] dark:text-white/52 dark:hover:text-white"
                >
                  <span className="truncate">{prompt}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowSpreadTools((value) => !value)}
                className="flex h-8 items-center justify-center gap-1.5 rounded-[16px] bg-[#2347d9]/10 px-3 text-[12px] font-semibold text-[#3558d4] dark:bg-[#7c9cff]/12 dark:text-[#b8c7ff]"
              >
                <Sparkles size={14} />
                牌阵
              </button>
              <button
                onClick={() => setShowReadingLog(true)}
                className="flex h-8 items-center justify-center gap-1.5 rounded-[16px] bg-[#d59a3a]/13 px-3 text-[12px] font-semibold text-[#9b641e] dark:text-[#f4cf83]"
              >
                <History size={14} />
                牌迹
              </button>
              {showSpreadTools &&
                SPREADS.map((spread) => (
                  <button
                    key={spread.name}
                    onClick={() => handleSend(spread.prompt)}
                    disabled={isThinking}
                    className="h-8 min-w-0 truncate rounded-[16px] border border-[#eadcc8]/60 bg-[#fff8ee]/46 px-2 text-[11px] font-medium text-[#736554] shadow-[inset_0_1px_0_rgba(255,255,255,0.48)] disabled:opacity-50 dark:border-white/[0.06] dark:bg-white/[0.045] dark:text-white/48"
                  >
                    {spread.name}
                  </button>
                ))}
            </div>
          </section>
          )}
          <AnimatePresence initial={false}>
            {showDailyPanel && (
              <motion.section
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="order-1 overflow-hidden"
              >
                <div className="rounded-[28px] border border-[#eadcc8]/72 bg-[#fff8ee]/68 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.64)] backdrop-blur-2xl dark:border-white/[0.07] dark:bg-white/[0.055]">
                  <div className="grid grid-cols-3 gap-2">
                    <DailyMission icon={<Sparkles size={13} />} done={askedToday} title={'\u95ee\u4e00\u4ef6\u4e8b'} onClick={() => handleDailyMissionShortcut('ask')} />
                    <DailyMission icon={<Gift size={13} />} done={wroteDiaryToday} title={'\u5199\u5fc3\u60c5'} onClick={() => handleDailyMissionShortcut('diary')} />
                    <DailyMission icon={<Crown size={13} />} done={simulatedToday} title={'\u505a\u9009\u62e9'} onClick={() => handleDailyMissionShortcut('simulator')} />
                  </div>
                  <div className="mt-3 rounded-[22px] bg-[#f5eadb]/72 p-4 dark:bg-white/[0.055]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{nextBestAction.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#736554] dark:text-white/48">
                          {nextBestAction.desc}
                        </p>
                      </div>
                      <button
                        onClick={handleNextBestAction}
                        className="shrink-0 rounded-[16px] bg-[#17130f] px-3 py-2 text-xs font-semibold text-[#f4cf83] dark:bg-[#f4cf83] dark:text-[#17130f]"
                      >
                        {nextBestAction.cta}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {canClaimReturnReward && (
                      <button
                        onClick={handleClaimReturnReward}
                        className="flex-1 rounded-[18px] bg-[#2347d9]/10 px-3 py-3 text-xs font-semibold text-[#3558d4] dark:bg-[#7c9cff]/12 dark:text-[#b8c7ff]"
                      >
                        {'\u56de\u8bbf'} +{plusActive ? 3 : 2} {'\u80fd\u91cf'}
                      </button>
                    )}
                    <button
                      onClick={handleClaimDailyReward}
                      disabled={!canClaimDailyReward}
                      className={clsx(
                        'flex-1 rounded-[18px] px-3 py-3 text-xs font-semibold transition-all',
                        canClaimDailyReward
                          ? 'bg-[#17130f] text-[#f4cf83] dark:bg-[#f4cf83] dark:text-[#17130f]'
                          : 'bg-[#f6eddf] text-[#83715c] dark:bg-white/[0.05] dark:text-white/46',
                      )}
                    >
                      {hasClaimedDailyReward ? '\u4eca\u65e5\u5df2\u9886' : `\u4efb\u52a1 +${dailyMissionEnergy} \u80fd\u91cf`}
                    </button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {visibleMessages.length > 0 && (
            <section className="order-2 flex flex-col gap-3 pt-1">
              {visibleMessages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={clsx(
                    'flex max-w-[90%] flex-col gap-1',
                    message.role === 'user' ? 'self-end items-end' : 'self-start items-start',
                  )}
                >
                  <div
                    className={clsx(
                      'whitespace-pre-wrap rounded-[24px] px-4 py-3 text-[14px] leading-relaxed shadow-sm',
                      message.role === 'user'
                        ? 'rounded-tr-[10px] bg-[#17130f] text-[#f4cf83] shadow-[0_14px_28px_rgba(55,35,12,0.14)] dark:bg-[#f4cf83] dark:text-[#17130f]'
                        : 'rounded-tl-[10px] border border-[#eadcc8]/72 bg-[#fff8ee]/72 text-[#2a2118] backdrop-blur-2xl dark:border-white/[0.07] dark:bg-white/[0.065] dark:text-[#f8f2e7]',
                    )}
                  >
                    {message.role === 'ai' &&
                      (() => {
                        const messageCardImages = (
                          message.cardImages?.length
                            ? message.cardImages
                            : message.cardImage
                              ? [message.cardImage]
                              : []
                        )
                          .filter(isTarotImage)
                          .slice(0, 5);
                        if (messageCardImages.length === 0) return null;
                        return (
                          <div
                            className={clsx(
                              'mb-3',
                              messageCardImages.length === 1
                                ? 'w-20'
                                : 'grid max-w-[260px] gap-1.5 sm:max-w-[300px]',
                            )}
                            style={
                              messageCardImages.length > 1
                                ? {
                                    gridTemplateColumns: `repeat(${messageCardImages.length}, minmax(0, 1fr))`,
                                  }
                                : undefined
                            }
                          >
                            {messageCardImages.map((src, index) => (
                              <img
                                key={`${src}-${index}`}
                                src={src}
                                alt="抽到的塔罗牌"
                                className={clsx(
                                  'object-cover object-top shadow-[0_12px_28px_rgba(0,0,0,0.22)] ring-1 ring-black/5 dark:ring-white/10',
                                  messageCardImages.length === 1
                                    ? 'h-28 w-20 rounded-[18px]'
                                    : 'aspect-[2/3] w-full rounded-[14px]',
                                )}
                              />
                            ))}
                          </div>
                        );
                      })()}
                    {message.role === 'ai' ? cleanTarotAnswer(message.text) : message.text}
                  </div>
                  {message.role === 'ai' && (
                    <div className="flex items-center gap-2 px-2">
                      <button onClick={() => handleCopy(cleanTarotAnswer(message.text))} className="p-1 text-apple-text-muted" title="复制">
                        <Copy size={13} />
                      </button>
                      <button onClick={handleRegenerate} disabled={isThinking} className="p-1 text-apple-text-muted disabled:opacity-30" title="重新生成">
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
              <div ref={endRef} className="h-8 shrink-0" />
            </section>
          )}
        </div>
      </div>

      {companionPet(
        clsx(
          'absolute z-40',
          visibleMessages.length > 0 ? petDockClass : petStageClass,
        ),
        visibleMessages.length > 0,
      )}

      <div className="absolute inset-x-0 bottom-[18px] z-50 px-4">
        {contextActionDock}
        {composerSuggestions}
        {composer}
      </div>

      <AnimatePresence>
        {visibleMessages.length > 0 && showScrollBottom && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            onClick={() => scrollConversationToBottom()}
            className="absolute bottom-[178px] left-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[#efe3cf]/76 bg-white/84 text-[#7a6a56] shadow-[0_10px_26px_rgba(70,45,20,0.12)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.09] dark:text-white/62 sm:left-[calc(50%_-_250px)]"
            aria-label="滚动到底部"
            title="滚动到底部"
          >
            <ArrowDown size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="absolute bottom-[226px] left-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[#efe3cf]/76 bg-white/80 text-apple-text-muted shadow-[0_10px_26px_rgba(70,45,20,0.12)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.08] sm:left-[calc(50%_-_250px)]"
            aria-label="回到顶部"
            title="回到顶部"
          >
            <ArrowUp size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      <ReadingLog
        open={showReadingLog}
        onClose={() => setShowReadingLog(false)}
        readings={tarotReadings}
        messages={messages}
        diaryEntries={diaryEntries}
        guardianMessages={guardianMessages}
        activeProfile={activeProfile}
        baziResult={baziResult}
        weeklyReportText={weeklyReviewText}
        weekCount={weekReadings.length}
        plusActive={plusActive}
        onUpgrade={() => openUpgradePrompt('weekly')}
        onShare={handleShareReadingCard}
        onContinue={(prompt) => {
          setShowReadingLog(false);
          handleSend(prompt, { mode: tarotReadings.length > 0 ? 'current' : 'draw' });
        }}
      />

      <WardrobeModal
        open={showWardrobe}
        bondLevel={bondLevel}
        selectedId={companionOutfit}
        onSelect={setCompanionOutfit}
        onClose={() => setShowWardrobe(false)}
      />

      <UpgradePromptModal
        open={showUpgradePrompt}
        reason={upgradeReason}
        trialAvailable={trialAvailable}
        onStartTrial={handleStartTrial}
        onGoPlus={handleOpenPlusPage}
        onClose={() => setShowUpgradePrompt(false)}
      />

      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 p-5 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-[30px] bg-white/90 p-5 shadow-2xl backdrop-blur-2xl dark:bg-[#151925]/92"
            >
              <div className="text-lg font-semibold text-apple-text">清空对话？</div>
              <p className="mt-2 text-sm leading-relaxed text-apple-text-muted">
                只会清空首页聊天和当前牌面，不会删除你的牌迹记录。
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="rounded-full bg-black/[0.045] py-3 text-sm font-semibold text-apple-text dark:bg-white/[0.07]"
                >
                  取消
                </button>
                <button
                  onClick={handleClearHistory}
                  className="rounded-full bg-[#f4cf83] py-3 text-sm font-semibold text-[#11131a]"
                >
                  清空
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {floatingExp && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.92 }}
            className="absolute left-1/2 top-24 z-[120] -translate-x-1/2 rounded-full bg-[#f4cf83]/18 px-4 py-2 text-sm font-semibold text-[#b97b28] shadow-[0_12px_30px_rgba(70,45,20,0.12)] backdrop-blur-xl dark:text-[#f4cf83]"
          >
            +{floatingExp} 经验
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="relative h-full overflow-hidden bg-apple-bg text-apple-text">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-95"
          style={{
            background:
              'radial-gradient(circle at 50% -10%, rgba(244,207,131,0.16), transparent 30%), radial-gradient(circle at 12% 28%, rgba(124,156,255,0.13), transparent 28%), var(--app-bg)',
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(65,45,24,0.045)_1px,transparent_1px)] bg-[size:100%_48px] opacity-45 dark:bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] dark:opacity-35" />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative z-10 h-full overflow-y-auto px-4 pb-[174px] pt-4 no-scrollbar sm:px-6 sm:pt-6"
      >
        <div className="mx-auto flex w-full max-w-[540px] flex-col gap-3">
          <header className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[18px] bg-[#F5DFB1]/45 shadow-[0_8px_22px_rgba(111,77,31,0.10)] dark:bg-white/[0.07]">
                <img src={activeCompanionImage} alt="星轨塔罗" className="h-full w-full object-contain p-1" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-[#B97B28] dark:text-[#F4CF83]/80">
                  星轨塔罗
                </div>
                <div className="truncate text-[14px] font-bold leading-tight text-apple-text">
                  LV.{bondLevel} {LEVEL_TITLES[bondLevel - 1]}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="flex h-9 items-center gap-1.5 rounded-full bg-[#F4CF83]/18 px-2.5 text-[#B97B28] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:bg-[#F4CF83]/10 dark:text-[#F4CF83]">
                <Sparkles size={15} />
                <span className="text-sm font-bold" title={membershipLabel}>{testerActive ? '∞' : plusActive ? 'Plus' : energy}</span>
              </div>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-apple-surface/72 text-apple-text-muted shadow-[0_8px_20px_rgba(70,45,20,0.09)] transition-transform active:scale-95 dark:bg-white/[0.07]"
                aria-label="切换白天/夜晚"
                title="切换白天/夜晚"
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button
                onClick={() => setShowWardrobe(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-apple-surface/72 text-apple-text-muted shadow-[0_8px_20px_rgba(70,45,20,0.09)] transition-transform active:scale-95 dark:bg-white/[0.07]"
                aria-label="打开衣柜"
                title="衣柜"
              >
                <Shirt size={16} />
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-apple-surface/72 text-apple-text-muted shadow-[0_8px_20px_rgba(70,45,20,0.09)] transition-transform active:scale-95 dark:bg-white/[0.07]"
                aria-label="清空对话"
                title="清空对话"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </header>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 24 }}
            className="relative overflow-hidden rounded-[32px] bg-[rgba(255,251,243,0.76)] p-2.5 shadow-[0_22px_64px_rgba(90,62,27,0.12),inset_0_1px_0_rgba(255,255,255,0.48)] backdrop-blur-2xl dark:bg-[rgba(14,17,27,0.76)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]"
          >
            <div
              className="absolute inset-0 opacity-80"
              style={{
                background:
                  'radial-gradient(circle at 48% 0%, rgba(244,207,131,0.18), transparent 34%), radial-gradient(circle at 82% 54%, rgba(124,156,255,0.10), transparent 34%)',
              }}
            />

            <div className="relative z-10 flex items-center justify-between gap-3">
              <button
                onClick={() => setShowDailyPanel((value) => !value)}
                className="flex min-w-0 items-center gap-1.5 rounded-full bg-white/48 px-2.5 py-1.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.52)] transition-transform active:scale-[0.98] dark:bg-white/[0.06]"
              >
                <CalendarCheck size={14} className="shrink-0 text-[#B97B28] dark:text-[#F4CF83]" />
                <span className="truncate text-[11px] font-semibold text-apple-text">
                  今日 {missionCount}/3 · 连续 {checkInStreak} 天
                </span>
              </button>
              <button
                onClick={handleDailyCheckIn}
                disabled={hasCheckedInToday}
                className={clsx(
                  'h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold transition-all',
                  hasCheckedInToday
                    ? 'bg-white/45 text-apple-text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:bg-white/[0.06]'
                    : 'bg-[#F4CF83] text-[#17130f] shadow-[0_14px_34px_rgba(185,123,40,0.18)]',
                )}
              >
                {hasCheckedInToday ? '已领取' : '今日可领'}
              </button>
            </div>

            <div className="relative z-10 mt-1.5 min-h-[178px]">
              <div className="absolute left-4 top-4 h-28 w-[74px] -rotate-6 overflow-hidden rounded-[22px] bg-[#101521] shadow-[0_18px_40px_rgba(61,40,18,0.18)] dark:shadow-[0_18px_44px_rgba(0,0,0,0.42)]">
                {hasDrawnCard ? (
                  <img src={cardImage} alt="塔罗牌" className="h-full w-full object-cover object-top" />
                ) : (
                  <button
                    onClick={() => handleSend('今日运势')}
                    disabled={isThinking}
                    className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_20%,rgba(244,207,131,0.22),transparent_36%),linear-gradient(145deg,rgba(19,25,39,0.98),rgba(5,7,14,0.98))] text-[#F4CF83] disabled:opacity-60"
                  >
                    <Sparkles size={25} />
                    <span className="text-[9px] font-black">TAROT</span>
                    <span className="h-px w-10 bg-[#F4CF83]/28" />
                  </button>
                )}
              </div>

              {cardStackImages.length > 0 && (
                <div className="pointer-events-none absolute left-2 top-1 z-20 h-[136px] w-[160px]">
                  <AnimatePresence initial={false}>
                    {cardStackImages.map((image, index) => {
                      const rotate = -14 + index * 8;
                      return (
                        <motion.img
                          key={`${image}-${index}`}
                          src={image}
                          alt="抽到的塔罗牌"
                          initial={{ opacity: 0, y: -34, rotate: rotate - 12, scale: 0.72 }}
                          animate={{
                            opacity: 1,
                            x: index * 15,
                            y: index * 4,
                            rotate,
                            scale: 1 - index * 0.035,
                          }}
                          exit={{ opacity: 0, y: 20, scale: 0.8 }}
                          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: index * 0.035 }}
                          className="absolute left-3 top-3 h-28 w-[74px] rounded-[20px] object-cover object-top shadow-[0_16px_34px_rgba(61,40,18,0.20)] dark:shadow-[0_16px_36px_rgba(0,0,0,0.42)]"
                          style={{ zIndex: 20 - index }}
                        />
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}

              {isDrawingCards && (
                <motion.div
                  initial={{ opacity: 0, x: 230, y: 8, rotate: 18, scale: 0.45 }}
                  animate={{ opacity: [0, 1, 1, 0], x: [230, 126, 48, 16], y: [8, -16, 6, 16], rotate: [18, -8, -18, -10], scale: [0.45, 0.78, 1, 0.96] }}
                  transition={{ duration: 0.95, ease: 'easeInOut' }}
                  className="pointer-events-none absolute left-3 top-4 z-40 h-28 w-[74px] rounded-[20px] bg-[radial-gradient(circle_at_50%_20%,rgba(244,207,131,0.35),transparent_38%),linear-gradient(145deg,#171d2d,#05070e)] shadow-[0_16px_38px_rgba(92,63,21,0.20)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.42)]"
                >
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[#F4CF83]">
                    <Sparkles size={24} />
                    <span className="text-[9px] font-black tracking-[0.22em]">DRAW</span>
                  </div>
                </motion.div>
              )}

              <div className="absolute right-1 top-1 flex h-16 w-16 items-center justify-center rounded-full bg-[#F4CF83]/[0.11] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] dark:bg-[#F4CF83]/[0.08]">
                <div>
                  <div className="text-[10px] font-semibold text-apple-text-muted">羁绊</div>
                  <div className="mt-0.5 text-sm font-black text-[#B97B28] dark:text-[#F4CF83]">{progressPercent}%</div>
                </div>
              </div>

              <motion.img
                src={activeCompanionImage}
                alt="星轨引路人"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute bottom-7 left-1/2 z-10 h-[96px] w-[96px] -translate-x-1/2 object-contain drop-shadow-[0_16px_22px_rgba(0,0,0,0.16)] sm:h-36 sm:w-36"
              />

              <div className="absolute bottom-2 right-2 z-20 max-w-[58%] rounded-[19px] bg-[rgba(255,250,239,0.72)] px-2.5 py-1.5 shadow-[0_10px_22px_rgba(95,66,27,0.09),inset_0_1px_0_rgba(255,255,255,0.50)] backdrop-blur-xl after:absolute after:bottom-3.5 after:-left-1 after:h-2 after:w-2 after:rotate-45 after:bg-[rgba(255,250,239,0.72)] dark:bg-[rgba(11,14,23,0.72)] dark:shadow-[0_12px_26px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.07)] dark:after:bg-[rgba(11,14,23,0.72)]">
                <div className="mb-px text-[8.5px] font-semibold text-[#B97B28] dark:text-[#F4CF83]/80">
                  星轨碎碎念
                </div>
                <p className="line-clamp-2 text-[10.5px] font-normal leading-relaxed text-apple-text text-pretty">
                  {companionBubbleText}
                </p>
              </div>

              <AnimatePresence>
                {isThinking && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#F4CF83]/28 bg-apple-surface/86 px-3 py-2 text-xs font-bold text-[#B97B28] shadow-[0_12px_30px_rgba(70,45,20,0.12)] backdrop-blur-xl dark:text-[#F4CF83]"
                  >
                    <Loader2 className="animate-spin" size={14} />
                    星轨解读中
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative z-10 mt-1 grid grid-cols-[1fr_auto] gap-2">
              <button
                onClick={() => handleSend('今日运势')}
                disabled={isThinking}
                className="h-10 rounded-full bg-[#F4CF83] px-4 text-[13px] font-bold text-[#17130f] shadow-[0_10px_24px_rgba(185,123,40,0.16)] transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                抽一张今日牌
              </button>
              <button
                onClick={() => setShowReadingLog(true)}
                className="flex h-10 w-[64px] items-center justify-center gap-1 rounded-full bg-white/46 text-apple-text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-transform active:scale-95 dark:bg-white/[0.06]"
                aria-label="打开牌迹"
                title="牌迹档案"
              >
                <BookOpen size={15} />
                <span className="text-[10px] font-bold">牌迹</span>
              </button>
            </div>
          </motion.section>

          <section className="relative z-10 -mt-1 space-y-1">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  disabled={isThinking}
                  className="flex h-6 shrink-0 items-center justify-center rounded-full bg-white/34 px-2 text-[10px] font-normal text-apple-text-muted shadow-[0_5px_12px_rgba(87,61,28,0.05),inset_0_1px_0_rgba(255,255,255,0.34)] transition-colors hover:text-apple-text disabled:opacity-50 dark:bg-white/[0.05]"
                >
                  <span className="truncate">{prompt}</span>
                </button>
              ))}
              <button
                onClick={() => setShowSpreadTools((value) => !value)}
                className="flex h-6 shrink-0 items-center justify-center gap-1 rounded-full bg-[#7C9CFF]/10 px-2 text-[10px] font-medium text-[#6076E8] shadow-[0_5px_12px_rgba(72,85,160,0.05)] dark:text-[#B8C7FF]"
              >
                <Sparkles size={11} />
                <span className="truncate">牌阵</span>
              </button>
              <button
                onClick={() => setShowReadingLog(true)}
                className="flex h-6 shrink-0 items-center justify-center gap-1 rounded-full bg-[#F4CF83]/12 px-2 text-[10px] font-medium text-[#B97B28] shadow-[0_5px_12px_rgba(185,123,40,0.05)] dark:text-[#F4CF83]"
              >
                <History size={11} />
                <span className="truncate">牌迹</span>
              </button>
            </div>

            <AnimatePresence initial={false}>
              {showSpreadTools && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-1.5 overflow-x-auto rounded-[16px] bg-white/28 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.30)] backdrop-blur-xl no-scrollbar dark:bg-white/[0.05]">
                    {SPREADS.map((spread) => (
                      <button
                        key={spread.name}
                        onClick={() => handleSend(spread.prompt)}
                        disabled={isThinking}
                        className="h-6 shrink-0 rounded-full bg-apple-surface-hover/56 px-2 text-[10px] font-normal leading-none text-apple-text-muted transition-transform active:scale-[0.98] disabled:opacity-50"
                      >
                        {spread.name}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <AnimatePresence initial={false}>
            {showDailyPanel && (
              <motion.section
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden rounded-[32px] border border-[#F4CF83]/24 bg-[#F4CF83]/[0.08] p-3 backdrop-blur-xl"
              >
                <div className="grid grid-cols-3 gap-2">
                  <DailyMission icon={<Sparkles size={13} />} done={askedToday} title="问一件事" />
                  <DailyMission icon={<Gift size={13} />} done={wroteDiaryToday} title="写心情" />
                  <DailyMission icon={<Crown size={13} />} done={simulatedToday} title="做选择" />
                </div>
                <div className="mt-3 rounded-[24px] border border-apple-border bg-apple-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-apple-text">{nextBestAction.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-apple-text-muted">
                        {nextBestAction.desc}
                      </div>
                    </div>
                    <button
                      onClick={handleNextBestAction}
                      className="shrink-0 rounded-full border border-[#F4CF83]/24 bg-[#F4CF83]/12 px-3 py-2 text-xs font-bold text-[#B97B28] dark:text-[#F4CF83]"
                    >
                      {nextBestAction.cta}
                    </button>
                  </div>
                </div>
                {canClaimReturnReward && (
                  <div className="mt-3 rounded-[24px] border border-[#7C9CFF]/20 bg-[#7C9CFF]/[0.07] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-apple-text">回访奖励</div>
                        <div className="mt-0.5 text-xs text-apple-text-muted">
                          已累计打开 {engagement.activeDays} 天，今天可以领一次续航。
                        </div>
                      </div>
                      <button
                        onClick={handleClaimReturnReward}
                        className="shrink-0 rounded-full bg-[#7C9CFF]/14 px-3 py-2 text-xs font-bold text-[#6076E8] dark:text-[#B8C7FF]"
                      >
                        +{plusActive ? 3 : 2} 能量
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-3 rounded-[24px] border border-apple-border bg-apple-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-apple-text">今日奖励</div>
                      <div className="mt-0.5 text-xs text-apple-text-muted">
                        {hasClaimedDailyReward
                          ? '今天已经领过了，明天再来。'
                          : missionCount >= 3
                            ? '三件小事完成，可以加一点续航。'
                            : `还差 ${3 - missionCount} 件小仪式。`}
                      </div>
                    </div>
                    <button
                      onClick={handleClaimDailyReward}
                      disabled={!canClaimDailyReward}
                      className={clsx(
                        'shrink-0 rounded-full px-4 py-2 text-xs font-black transition-all',
                        canClaimDailyReward
                          ? 'bg-gradient-to-r from-[#F4CF83] to-[#B8C7FF] text-[#090b13] shadow-[0_12px_28px_rgba(244,207,131,0.22)]'
                          : 'border border-apple-border bg-apple-surface-hover text-apple-text-muted',
                      )}
                    >
                      {hasClaimedDailyReward ? '已领' : `+${dailyMissionEnergy} 能量`}
                    </button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {visibleMessages.length > 0 && (
            <section className="flex flex-col gap-3 pb-5">
              {visibleMessages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={clsx(
                    'flex max-w-[88%] flex-col gap-1',
                    message.role === 'user' ? 'self-end items-end' : 'self-start items-start',
                  )}
                >
                  <div
                    className={clsx(
                      'rounded-[28px] px-4 py-3 text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap',
                      message.role === 'user'
                        ? 'rounded-tr-[12px] bg-[#F4CF83] text-[#11131a]'
                        : 'rounded-tl-[12px] border border-apple-border bg-apple-surface text-apple-text backdrop-blur-xl',
                    )}
                  >
                    {message.cardImage && message.role === 'ai' && (
                      <img
                        src={message.cardImage}
                        alt="抽到的塔罗牌"
                        className="mb-3 h-44 w-28 rounded-[22px] object-cover shadow-[0_12px_32px_rgba(0,0,0,0.25)]"
                      />
                    )}
                    {message.role === 'ai' ? cleanTarotAnswer(message.text) : message.text}
                  </div>
                  {message.role === 'ai' && (
                    <div className="flex items-center gap-2 px-2">
                      <button onClick={() => handleCopy(cleanTarotAnswer(message.text))} className="p-1 text-apple-text-muted" title="复制">
                        <Copy size={13} />
                      </button>
                      <button onClick={handleRegenerate} disabled={isThinking} className="p-1 text-apple-text-muted disabled:opacity-30" title="重新生成">
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
              <div ref={endRef} className="h-4 shrink-0" />
            </section>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-[86px] z-40 px-4">
        <div className="mx-auto flex w-full max-w-[540px] items-center gap-1.5 rounded-[28px] bg-[rgba(255,251,244,0.84)] p-1.5 shadow-[0_14px_40px_rgba(79,54,24,0.13),inset_0_1px_0_rgba(255,255,255,0.62)] backdrop-blur-2xl dark:bg-[rgba(14,18,27,0.84)] dark:shadow-[0_-12px_36px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <button
            onClick={() => setIsInternetMode((value) => !value)}
            className={clsx(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all',
              isInternetMode
                ? 'bg-[#7C9CFF]/16 text-[#6076E8] dark:text-[#B8C7FF]'
                : 'bg-white/42 text-apple-text-muted dark:bg-white/[0.06]',
            )}
            aria-label={isInternetMode ? '关闭联网提示' : '开启联网提示'}
            title={isInternetMode ? '关闭联网提示' : '开启联网提示'}
          >
            <Globe size={18} />
          </button>
          <div className="relative flex flex-1 items-center">
            <input
              type="text"
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleSend()}
              disabled={isThinking}
              placeholder="说说你现在最想问的事"
              className="h-10 w-full rounded-full bg-apple-bg/72 pl-3.5 pr-[74px] text-[13px] font-normal text-apple-text shadow-[inset_0_1px_2px_rgba(70,45,20,0.08)] placeholder:text-apple-text-muted/65 outline-none transition-all focus:ring-4 focus:ring-[#F4CF83]/14 dark:bg-black/22"
            />
            <button
              onClick={handleVoiceInput}
              disabled={isThinking}
              title="语音输入"
              aria-label="语音输入"
              className="absolute right-9 flex h-8 w-8 items-center justify-center rounded-full text-apple-text-muted transition-colors disabled:opacity-50"
            >
              <Mic size={19} />
            </button>
            <button
              onClick={() => handleSend()}
              disabled={!inputText.trim() || isThinking}
              aria-label="发送"
              className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#F4CF83] text-[#17130f] shadow-[0_8px_18px_rgba(185,123,40,0.16)] transition-transform active:scale-95 disabled:opacity-40"
            >
              <Send size={15} className="ml-0.5" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="absolute bottom-[184px] right-5 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-apple-surface text-apple-text-muted shadow-[0_10px_26px_rgba(70,45,20,0.12)] backdrop-blur-xl"
            aria-label="回到顶部"
            title="回到顶部"
          >
            <ArrowUp size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      <ReadingLog
        open={showReadingLog}
        onClose={() => setShowReadingLog(false)}
        readings={tarotReadings}
        messages={messages}
        diaryEntries={diaryEntries}
        guardianMessages={guardianMessages}
        activeProfile={activeProfile}
        baziResult={baziResult}
        weeklyReportText={weeklyReviewText}
        weekCount={weekReadings.length}
        plusActive={plusActive}
        onUpgrade={() => openUpgradePrompt('weekly')}
        onShare={handleShareReadingCard}
        onContinue={(prompt) => {
          setShowReadingLog(false);
          handleSend(prompt, { mode: tarotReadings.length > 0 ? 'current' : 'draw' });
        }}
      />

      <WardrobeModal
        open={showWardrobe}
        bondLevel={bondLevel}
        selectedId={companionOutfit}
        onSelect={setCompanionOutfit}
        onClose={() => setShowWardrobe(false)}
      />

      <UpgradePromptModal
        open={showUpgradePrompt}
        reason={upgradeReason}
        trialAvailable={trialAvailable}
        onStartTrial={handleStartTrial}
        onGoPlus={handleOpenPlusPage}
        onClose={() => setShowUpgradePrompt(false)}
      />

      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 p-5 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-[30px] border border-apple-border bg-apple-surface p-5 shadow-2xl"
            >
              <div className="text-lg font-black text-apple-text">清空对话？</div>
              <p className="mt-2 text-sm leading-relaxed text-apple-text-muted">
                只会清空首页聊天和当前牌面，不会删除你的牌迹记录。
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="rounded-full border border-apple-border bg-apple-surface-hover py-3 text-sm font-bold text-apple-text"
                >
                  取消
                </button>
                <button
                  onClick={handleClearHistory}
                  className="rounded-full bg-[#F4CF83] py-3 text-sm font-black text-[#11131a]"
                >
                  清空
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {floatingExp && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.92 }}
            className="absolute left-1/2 top-24 z-[120] -translate-x-1/2 rounded-full border border-[#F4CF83]/35 bg-[#F4CF83]/15 px-4 py-2 text-sm font-black text-[#B97B28] backdrop-blur-xl dark:text-[#F4CF83]"
          >
            +{floatingExp} 经验
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DailyMission({
  icon,
  done,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  done: boolean;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex min-w-0 items-center justify-center gap-1.5 rounded-full border px-2 py-2 text-xs font-bold transition-transform active:scale-[0.98]',
        done
          ? 'border-[#F4CF83]/28 bg-[#F4CF83]/15 text-[#B97B28] dark:text-[#F4CF83]'
          : 'border-apple-border bg-apple-surface text-apple-text-muted hover:text-apple-text',
      )}
    >
      {icon}
      <span className="truncate">{title}</span>
    </button>
  );
}

function DrawCardAnimation({
  active,
  image,
  images = [],
  cards = [],
  compact,
}: {
  active: boolean;
  image: string;
  images?: string[];
  cards?: DrawnCard[];
  compact: boolean;
}) {
  if (typeof document === 'undefined') return null;

  const fallbackCard = image && image !== 'default-card.png' ? image : '/default-card.png';
  const animatedCards =
    cards.length > 0
      ? cards.slice(0, 5)
      : (images.length > 0 ? images : [fallbackCard]).slice(0, 5).map((cardSrc, index) => ({
          name: index === 0 ? '星轨牌面' : `第 ${index + 1} 张`,
          position: '正位' as const,
          image: cardSrc,
        }));
  const drawCount = Math.max(1, animatedCards.length);
  const singleCard = drawCount === 1;
  const spreadTitle = singleCard ? '单张指引' : drawCount === 3 ? '圣三角牌阵' : drawCount === 5 ? '五张牌阵' : `${drawCount} 张牌阵`;
  const cardSize = singleCard
    ? compact
      ? 'h-[188px] w-[122px] rounded-[24px]'
      : 'h-[210px] w-[136px] rounded-[26px]'
    : compact
      ? 'h-[150px] w-[96px] rounded-[20px]'
      : 'h-[166px] w-[106px] rounded-[22px]';
  const fanCenter = (drawCount - 1) / 2;
  const fanOffset = compact ? 34 : 42;
  const frameSize = singleCard
    ? compact
      ? 'h-[294px] w-[220px]'
      : 'h-[320px] w-[240px]'
    : compact
      ? 'h-[302px] w-[316px]'
      : 'h-[330px] w-[360px]';
  const cardMetaText = animatedCards
    .map((card) => `${card.name} · ${card.position}`)
    .join(' / ');

  return createPortal(
    <AnimatePresence initial={false}>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.36, ease: 'easeOut' }}
          className="pointer-events-none fixed inset-0 z-[220] flex items-center justify-center"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.38, 0.3] }}
            transition={{ duration: 1.2, times: [0, 0.55, 1], ease: 'easeOut' }}
            className="absolute inset-0 bg-black/38 backdrop-blur-[2px]"
          />
          <div className={clsx('relative -mt-16 flex items-center justify-center', frameSize)}>
            <motion.div
              animate={{ opacity: [0, 1, 1], y: [12, 0, 0] }}
              transition={{ duration: 3.8, times: [0, 0.12, 1], ease: 'easeOut' }}
              className="absolute left-1/2 top-0 z-40 flex w-[min(86vw,360px)] -translate-x-1/2 flex-col items-center gap-2 text-center"
            >
              <span className="font-serif text-[18px] font-semibold tracking-[0.08em] text-[#fff7e8] drop-shadow-[0_10px_26px_rgba(0,0,0,0.42)]">
                {spreadTitle}
              </span>
              <span className="max-w-full truncate rounded-full border border-[#f4cf83]/24 bg-[#111621]/72 px-4 py-1.5 text-[10px] font-semibold tracking-[0.18em] text-[#f4cf83] shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                {singleCard ? cardMetaText : 'ARCANA REVEAL'}
              </span>
            </motion.div>
            {Array.from({ length: Math.min(5, drawCount + 1) }).map((_, item) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: 0, y: 24, rotate: 0, scale: 0.78 }}
                animate={{
                  opacity: [0, 0.62, 0.62, 0],
                  x: [-10 + item * 10, -46 + item * 46, -54 + item * 54, -64 + item * 64],
                  y: [24, 2, 8, 16],
                  rotate: [-8 + item * 8, -22 + item * 22, -26 + item * 26, -30 + item * 30],
                  scale: [0.78, 0.92, 0.9, 0.82],
                }}
                transition={{ duration: 1.7, delay: item * 0.07, ease: 'easeInOut' }}
                className={clsx(
                  'absolute bg-[linear-gradient(145deg,#182035,#05070e)] shadow-[0_22px_46px_rgba(0,0,0,0.32)] ring-1 ring-white/12',
                  compact ? 'h-[150px] w-[96px] rounded-[20px]' : 'h-[172px] w-[110px] rounded-[22px]',
                )}
              >
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[#f4cf83]">
                  <Sparkles size={compact ? 22 : 26} />
                  <span className="text-[9px] font-semibold tracking-[0.24em]">TAROT</span>
                </div>
              </motion.div>
            ))}
            {animatedCards.map((card, index) => {
              const cardSrc = card.image;
              const spread = index - fanCenter;
              const settleX = singleCard ? -4 : spread * fanOffset;
              const settleY = singleCard ? 42 : Math.abs(spread) * 12 + 44;
              const settleRotate = singleCard ? -2 : spread * 8;
              return (
                <motion.div
                  key={`${cardSrc}-${index}`}
                  initial={{ x: 118 + index * 10, y: 126, rotate: 24 + index * 6, scale: 0.56, zIndex: 20 + index }}
                  animate={{
                    x: [118 + index * 10, 38 + spread * 10, settleX, settleX],
                    y: [126, 58, 26 + Math.abs(spread) * 5, settleY],
                    rotate: [24 + index * 6, -16 + spread * 5, settleRotate + 6, settleRotate],
                    scale: [0.56, 1.03, 1.06, 1],
                  }}
                  transition={{
                    duration: 3.15,
                    delay: index * 0.14,
                    times: [0, 0.26, 0.58, 1],
                    ease: 'easeInOut',
                  }}
                  className={clsx('absolute preserve-3d', cardSize)}
                >
                  {!singleCard && (
                    <motion.div
                      animate={{ opacity: [0, 0, 1, 1], y: [-8, -8, 0, 0] }}
                      transition={{ duration: 3.05, delay: index * 0.14, times: [0, 0.42, 0.6, 1], ease: 'easeInOut' }}
                      className={clsx(
                        'absolute left-1/2 z-30 flex -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-[16px] border border-white/12 bg-[#111621]/78 px-2.5 py-1 text-center shadow-[0_12px_28px_rgba(0,0,0,0.30)] backdrop-blur-xl',
                        compact ? '-top-[46px] min-w-[82px]' : '-top-[50px] min-w-[90px]',
                      )}
                    >
                      <span className="max-w-[108px] truncate font-serif text-[10px] font-semibold leading-none text-[#fff7e8]">
                        {card.name}
                      </span>
                      <span
                        className={clsx(
                          'mt-1 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold leading-none tracking-[0.16em]',
                          card.position === '逆位'
                            ? 'border-[#b8c7ff]/30 bg-[#b8c7ff]/12 text-[#cbd5ff]'
                            : 'border-[#f4cf83]/34 bg-[#f4cf83]/12 text-[#f4cf83]',
                        )}
                      >
                        {card.position}
                      </span>
                    </motion.div>
                  )}
                  <motion.div
                    animate={{ opacity: [1, 1, 0, 0] }}
                    transition={{ duration: 2.6, delay: index * 0.14, times: [0, 0.44, 0.66, 1], ease: 'easeInOut' }}
                    className={clsx(
                      'absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[linear-gradient(145deg,#182035,#05070e)] text-[#f4cf83] shadow-[0_22px_46px_rgba(0,0,0,0.34)] ring-1 ring-white/12',
                      cardSize,
                    )}
                  >
                    <Sparkles size={compact ? 28 : 32} />
                    <span className="text-[10px] font-semibold tracking-[0.24em]">TAROT</span>
                  </motion.div>
                  <motion.img
                    src={cardSrc}
                    alt={`${card.name}${card.position}`}
                    animate={{ opacity: [0, 0, 1, 1], scaleX: [0.18, 0.18, 1, 1] }}
                    transition={{ duration: 2.9, delay: index * 0.14, times: [0, 0.38, 0.56, 1], ease: 'easeInOut' }}
                    className={clsx(
                      'absolute inset-0 object-cover object-top shadow-[0_22px_46px_rgba(0,0,0,0.34)] ring-1 ring-black/10 dark:ring-white/12',
                      cardSize,
                    )}
                  />
                  <motion.span
                    animate={{ opacity: [0, 0.72, 0], scale: [0.64, 1.35, 1.9] }}
                    transition={{ duration: 1.35, delay: 0.78 + index * 0.12, ease: 'easeOut' }}
                    className="absolute inset-[-14px] rounded-[34px] border border-[#f4cf83]/42"
                  />
                  <motion.span
                    animate={{ opacity: [0, 1, 0], x: [-62, 142] }}
                    transition={{ duration: 1.15, delay: 0.62 + index * 0.11, ease: 'easeOut' }}
                    className="absolute left-0 top-1/2 h-px w-24 -rotate-12 bg-gradient-to-r from-transparent via-[#f4cf83] to-transparent"
                  />
                </motion.div>
              );
            })}
            {drawCount > 1 && (
              <motion.div
                animate={{ opacity: [0, 1, 1], y: [8, 0, 0] }}
                transition={{ duration: 3.8, times: [0, 0.12, 1], ease: 'easeOut' }}
                className="absolute bottom-0 rounded-full border border-[#f4cf83]/22 bg-[#111621]/74 px-4 py-2 text-xs font-semibold text-[#f4cf83] shadow-[0_14px_38px_rgba(0,0,0,0.32)] backdrop-blur-xl"
              >
                正在翻开 {drawCount} 张牌
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function UpgradePromptModal({
  open,
  reason,
  trialAvailable,
  onStartTrial,
  onGoPlus,
  onClose,
}: {
  open: boolean;
  reason: 'energy' | 'history' | 'weekly';
  trialAvailable: boolean;
  onStartTrial: () => void;
  onGoPlus: () => void;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;

  const copy = {
    energy: {
      title: '这条问题线刚刚打开',
      desc: '现在停下也可以，但这次整理出来的线索最清楚。Plus 可以继续追问，先试用会立刻补到 12 点能量。',
      cta: '继续这条线',
    },
    history: {
      title: '旧牌迹快被新的覆盖了',
      desc: '免费版只保留最近 30 次。Plus 会扩展到 200 次，把反复出现的问题和代表牌留下来。',
      cta: '留下我的牌迹',
    },
    weekly: {
      title: '你已经有材料做复盘了',
      desc: 'Plus 会整理高频问题、代表牌和本周行动建议，让你看到自己到底卡在哪里。',
      cta: '生成完整周报',
    },
  }[reason];
  const paidWhy = {
    energy: {
      title: '这条线索正在变清楚',
      desc: 'Plus 不是单纯多几次提问，而是让这次问题能接着历史继续追问，不用每次从头讲。',
      cta: '继续这条线索',
    },
    history: {
      title: '把你的牌迹留下来',
      desc: '免费版适合体验，Plus 适合长期记录。它会保留更多牌迹，并把反复出现的问题整理成可复盘的线索。',
      cta: '留下我的长期档案',
    },
    weekly: {
      title: '你已经有材料做 7 日复盘了',
      desc: 'Plus 会把牌迹、日记和守护回访接成一份完整报告，让你看到自己真正反复卡住的地方。',
      cta: '查看完整复盘',
    },
  }[reason];
  const valuePillars = [
    { title: '长期记忆', desc: '持续沉淀' },
    { title: '7 日复盘', desc: '看清反复主题' },
    { title: '守护回访', desc: '每天接住近况' },
  ];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[170] flex items-end bg-black/45 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            className="mx-auto w-full max-w-[540px] rounded-[32px] border border-apple-border bg-apple-surface p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F4CF83]/15 text-[#B97B28] dark:text-[#F4CF83]">
                  <Crown size={21} />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-black text-apple-text">{paidWhy.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-apple-text-muted">{paidWhy.desc}</p>
                  <p className="mt-2 text-xs leading-relaxed text-apple-text-muted">
                    星轨不是只给一次答案，而是把你反复出现的情绪、问题和选择慢慢记下来。
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-full bg-apple-surface-hover p-2 text-apple-text-muted">
                <X size={17} />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-apple-text-muted">
              {valuePillars.map((item) => (
                <div key={item.title} className="rounded-2xl border border-apple-border bg-apple-surface-hover px-2 py-2">
                  <div className="font-black text-apple-text">{item.title}</div>
                  <div>{item.desc}</div>
                </div>
              ))}
            </div>
            <div className="hidden">
              <div className="rounded-2xl border border-apple-border bg-apple-surface-hover px-2 py-2">
                <div className="font-black text-apple-text">继续问</div>
                <div>不打断</div>
              </div>
              <div className="rounded-2xl border border-apple-border bg-apple-surface-hover px-2 py-2">
                <div className="font-black text-apple-text">留牌迹</div>
                <div>可复盘</div>
              </div>
              <div className="rounded-2xl border border-apple-border bg-apple-surface-hover px-2 py-2">
                <div className="font-black text-apple-text">更懂你</div>
                <div>少解释</div>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              {trialAvailable && (
                <button
                  onClick={onStartTrial}
                  className="flex items-center justify-center gap-2 rounded-full bg-[#F4CF83] py-3 text-sm font-black text-[#11131a]"
                >
                  <Sparkles size={16} />
                  先试用 24 小时
                </button>
              )}
              <button
                onClick={onGoPlus}
                className="rounded-full border border-apple-border bg-apple-surface-hover py-3 text-sm font-bold text-apple-text"
              >
                {paidWhy.cta}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function WardrobeModal({
  open,
  bondLevel,
  selectedId,
  onSelect,
  onClose,
}: {
  open: boolean;
  bondLevel: number;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[160] flex items-end bg-black/45 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            className="mx-auto flex max-h-[82vh] w-full max-w-[540px] flex-col overflow-hidden rounded-[34px] border border-apple-border bg-apple-surface shadow-[0_22px_70px_rgba(0,0,0,0.34)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-apple-border px-5 py-4">
              <div>
                <div className="text-lg font-black text-apple-text">星轨衣柜</div>
                <div className="text-xs text-apple-text-muted">羁绊升级会自动解锁新形象，也可以手动换装。</div>
              </div>
              <button onClick={onClose} className="rounded-full bg-apple-surface-hover p-2 text-apple-text-muted">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 overflow-y-auto p-3 pb-6 no-scrollbar sm:gap-3 sm:p-4 sm:pb-7">
              {COMPANION_OUTFITS.map((outfit) => {
                const unlocked = bondLevel >= outfit.minLevel;
                const active = selectedId === outfit.id;
                const previewImage = outfit.image || getAutoCompanionOutfit(bondLevel).image || '/default-pet.png';
                return (
                  <button
                    key={outfit.id}
                    onClick={() => {
                      if (!unlocked) return;
                      onSelect(outfit.id);
                    }}
                    className={clsx(
                      'relative min-h-[214px] overflow-hidden rounded-[26px] border p-3 text-left transition-all sm:min-h-[232px] sm:rounded-[28px]',
                      active
                        ? 'border-[#F4CF83]/55 bg-[#F4CF83]/12 shadow-[0_16px_34px_rgba(244,207,131,0.16)]'
                        : 'border-apple-border bg-apple-surface-hover',
                      !unlocked && 'opacity-55',
                    )}
                  >
                    <div className={clsx('absolute inset-0 bg-gradient-to-br opacity-80', outfit.tone)} />
                    <div className="relative z-10 flex h-36 items-end justify-center sm:h-40">
                      {outfit.id === 'auto' ? (
                        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-[28px] border border-[#F4CF83]/42 bg-white/32 text-[#B97B28] shadow-[inset_0_1px_0_rgba(255,255,255,0.54)] backdrop-blur-xl dark:bg-white/[0.07] dark:text-[#F4CF83]">
                          <Sparkles size={38} />
                        </div>
                      ) : (
                        <img
                          src={previewImage}
                          alt={outfit.name}
                          className="h-full max-w-[92%] object-contain drop-shadow-[0_16px_22px_rgba(0,0,0,0.18)]"
                        />
                      )}
                    </div>
                    <div className="relative z-10 mt-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-black leading-tight text-apple-text">{outfit.name}</div>
                        <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-apple-text-muted">{outfit.desc}</div>
                      </div>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-apple-border bg-apple-surface">
                        {active ? <Check size={14} className="text-[#B97B28] dark:text-[#F4CF83]" /> : unlocked ? <Shirt size={13} /> : <Lock size={13} />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function ReadingLog({
  open,
  onClose,
  readings,
  messages,
  diaryEntries,
  guardianMessages,
  activeProfile,
  baziResult,
  weeklyReportText,
  weekCount,
  plusActive,
  onUpgrade,
  onShare,
  onContinue,
}: {
  open: boolean;
  onClose: () => void;
  readings: TarotReading[];
  messages: Message[];
  diaryEntries: DiaryEntry[];
  guardianMessages: CompanionMessage[];
  activeProfile: UserProfile | null;
  baziResult: any | null;
  weeklyReportText: string;
  weekCount: number;
  plusActive: boolean;
  onUpgrade: () => void;
  onShare: (reading: TarotReading) => void;
  onContinue: (prompt: string) => void;
}) {
  const [expandedTimelineIds, setExpandedTimelineIds] = useState<Set<string>>(() => new Set());
  const [expandedReadingIds, setExpandedReadingIds] = useState<Set<string>>(() => new Set());
  if (typeof document === 'undefined') return null;
  const archiveReport = buildTarotArchiveReport(readings, messages, diaryEntries, guardianMessages, activeProfile, baziResult);
  const visibleTimeline = plusActive ? archiveReport.timeline : archiveReport.timeline.slice(0, 2);
  const getDisplaySummary = (reading: TarotReading) => getFullReadingSummary(reading, messages);
  const toggleTimeline = (id: string) => {
    setExpandedTimelineIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleReading = (id: string) => {
    setExpandedReadingIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-end bg-black/45 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            className="mx-auto max-h-[74vh] w-full max-w-[540px] overflow-hidden rounded-[34px] border border-apple-border bg-apple-surface shadow-[0_22px_70px_rgba(0,0,0,0.34)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-apple-border px-5 py-4">
              <div>
                <div className="text-lg font-black text-apple-text">你的牌迹</div>
                <div className="text-xs text-apple-text-muted">每次占卜都会自动保存，方便回来复看。</div>
              </div>
              <button onClick={onClose} className="rounded-full bg-apple-surface-hover p-2 text-apple-text-muted">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[58vh] overflow-y-auto p-4 no-scrollbar">
              <div className="mb-3 overflow-hidden rounded-[28px] border border-[#F4CF83]/24 bg-[linear-gradient(145deg,rgba(244,207,131,0.16),rgba(255,255,255,0.02))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.20)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#B97B28] dark:text-[#F4CF83]">
                      本周档案
                    </div>
                    <div className="mt-1 text-xl font-black leading-snug text-apple-text">{archiveReport.title}</div>
                    <div className="mt-1 text-xs text-apple-text-muted">
                      {archiveReport.dateRangeLabel} · {weekCount} 次牌迹
                    </div>
                  </div>
                  <button
                    onClick={() => onContinue(archiveReport.prompt)}
                    className="shrink-0 rounded-full bg-[#F4CF83] px-3 py-2 text-xs font-black text-[#17130f] shadow-[0_12px_28px_rgba(185,123,40,0.20)]"
                  >
                    继续追问
                  </button>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-apple-text-muted">{weeklyReportText}</p>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {archiveReport.signals.slice(0, plusActive ? 4 : 2).map((signal) => (
                    <div key={signal.label} className="rounded-[18px] border border-apple-border bg-apple-surface/64 p-3">
                      <div className="text-[10px] font-black text-[#B97B28] dark:text-[#F4CF83]">{signal.label}</div>
                      <div className="mt-1 line-clamp-1 text-xs font-black text-apple-text">{signal.value}</div>
                      <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-apple-text-muted">{signal.desc}</div>
                    </div>
                  ))}
                </div>

                {archiveReport.evidence.length > 0 && (
                  <div className="mt-3 rounded-[20px] bg-apple-surface/60 p-3">
                    <div className="mb-2 text-[11px] font-black text-apple-text">本周证据</div>
                    <div className="grid gap-1.5">
                      {archiveReport.evidence.slice(0, plusActive ? 3 : 1).map((item) => (
                        <div key={item} className="text-[11px] leading-relaxed text-apple-text-muted">{item}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {archiveReport.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full border border-[#F4CF83]/22 bg-apple-surface/70 px-2.5 py-1 text-[11px] font-bold text-[#B97B28] dark:text-[#F4CF83]"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>

                <div className="mt-4 rounded-[22px] border border-apple-border bg-apple-surface/72 p-3">
                  <div className="mb-2 text-xs font-black text-apple-text">时间线</div>
                  {visibleTimeline.length === 0 ? (
                    <div className="text-xs leading-relaxed text-apple-text-muted">还没有可以沉淀的牌迹，先抽一张今日牌。</div>
                  ) : (
                    <div className="space-y-2">
                      {visibleTimeline.map((item) => {
                        const expanded = expandedTimelineIds.has(item.id);
                        const canCollapse = shouldCollapseReadingText(item.summary, 118);
                        return (
                          <div key={item.id} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
                            <div className="pt-0.5 text-[10px] font-bold text-apple-text-muted">{item.date}</div>
                            <div className="min-w-0 border-l border-[#F4CF83]/24 pl-3">
                              <div className="text-xs font-black leading-snug text-apple-text">{item.title}</div>
                              <div className="mt-0.5 text-[11px] font-bold leading-snug text-[#B97B28] dark:text-[#F4CF83]">{item.card}</div>
                              <div
                                className={clsx(
                                  'mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-apple-text-muted',
                                  canCollapse && !expanded && 'line-clamp-3',
                                )}
                              >
                                {item.summary}
                              </div>
                              {canCollapse && (
                                <button
                                  onClick={() => toggleTimeline(item.id)}
                                  className="mt-1 rounded-full px-0 text-[10px] font-black text-[#B97B28] dark:text-[#F4CF83]"
                                >
                                  {expanded ? '收起' : '展开完整解读'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!plusActive && archiveReport.timeline.length > visibleTimeline.length && (
                    <button
                      onClick={onUpgrade}
                      className="mt-3 w-full rounded-full border border-[#F4CF83]/24 bg-[#F4CF83]/10 px-3 py-2 text-xs font-bold text-[#B97B28] dark:text-[#F4CF83]"
                    >
                      解锁完整时间线
                    </button>
                  )}
                </div>

                <div className="mt-3 grid gap-2">
                  {archiveReport.advice.slice(0, plusActive ? 3 : 2).map((item, index) => (
                    <div key={item} className="rounded-[18px] bg-apple-surface/64 px-3 py-2 text-xs leading-relaxed text-apple-text-muted">
                      <span className="mr-1 font-black text-apple-text">建议 {index + 1}</span>
                      {item}
                    </div>
                  ))}
                </div>

                {!plusActive && (
                  <button
                    onClick={onUpgrade}
                    className="mt-3 w-full rounded-full border border-[#F4CF83]/24 bg-apple-surface px-3 py-2 text-xs font-bold text-[#B97B28] dark:text-[#F4CF83]"
                  >
                    解锁完整周报和 200 条牌迹
                  </button>
                )}
              </div>

              {readings.length === 0 ? (
                <div className="rounded-[26px] border border-dashed border-apple-border p-8 text-center">
                  <Sparkles size={28} className="mx-auto mb-3 text-[#B97B28] dark:text-[#F4CF83]" />
                  <div className="font-bold text-apple-text">还没有牌迹</div>
                  <p className="mt-2 text-sm leading-relaxed text-apple-text-muted">
                    抽一张今日牌，星轨会帮你把问题、牌面和解读都留住。
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {readings.slice(0, 20).map((reading) => (
                    <div key={reading.id} className="rounded-[26px] border border-apple-border bg-apple-surface-hover p-3">
                      <div className="flex gap-3">
                        {reading.cardImage && (
                          <img src={reading.cardImage} alt="牌面" className="h-20 w-14 shrink-0 rounded-[16px] object-cover" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold leading-snug text-apple-text">{reading.question}</div>
                          <div className="mt-1 text-xs leading-snug text-[#B97B28] dark:text-[#F4CF83]">{reading.cards}</div>
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-apple-text-muted">
                            {getDisplaySummary(reading)}
                          </p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="text-[10px] text-apple-text-muted">
                              {new Date(reading.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                            </div>
                            <button
                              onClick={() => onShare({ ...reading, summary: getDisplaySummary(reading) })}
                              className="rounded-full border border-apple-border bg-apple-surface px-2.5 py-1 text-[10px] font-bold text-apple-text-muted"
                            >
                              生成分享图
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function getCanvasTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const paragraphs = String(text || '').split(/\n+/).map((part) => part.trim()).filter(Boolean);
  const lines: string[] = [];

  paragraphs.forEach((paragraph, index) => {
    let line = '';
    paragraph.split('').forEach((char) => {
      const testLine = line + char;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = testLine;
      }
    });
    if (line) lines.push(line);
    if (index < paragraphs.length - 1) lines.push('');
  });

  return lines.length ? lines : [''];
}

function drawCanvasLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
) {
  lines.forEach((line, index) => {
    if (line) ctx.fillText(line, x, y + index * lineHeight);
  });
  return y + lines.length * lineHeight;
}
