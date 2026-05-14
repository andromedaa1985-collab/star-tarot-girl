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
  type TarotReading,
  useAppContext,
} from '../store';
import {
  getDailyCheckInEnergy,
  getDailyMissionEnergy,
  getMembershipLabel,
  getReadingLimit,
  isPlusActive,
  isTesterActive,
  startPlusTrial,
} from '../lib/membership';
import { getNextBestAction, recordAppEvent } from '../lib/engagement';
import { usePersistentDraft } from '../lib/usePersistentDraft';
import { copyTextToClipboard } from '../lib/clipboard';

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

const drawCards = (count = 1): DrawnCard[] => {
  const deck = [...TAROT_CARDS].sort(() => Math.random() - 0.5);
  return deck.slice(0, count).map((card) => ({
    name: card.name,
    position: Math.random() > 0.5 ? '正位' : '逆位',
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
    diaryEntries,
    simulatorState,
    profiles,
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
  const simulatedRecently = Boolean(simulatorState.result);
  const missionCount = [askedToday, wroteDiaryToday, simulatedRecently].filter(Boolean).length;
  const hasClaimedDailyReward = dailyRewardDate === todayKey;
  const canClaimDailyReward = missionCount >= 3 && !hasClaimedDailyReward;
  const canClaimReturnReward = engagement.activeDays >= 2 && engagement.returnRewardDate !== todayKey;
  const plusActive = isPlusActive(membership);
  const testerActive = isTesterActive(membership);
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
    simulatedRecently,
    activeDays: engagement.activeDays,
  });

  const nextLevelExp = LEVEL_THRESHOLDS[bondLevel] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const progressPercent = Math.min(100, Math.round((bondExp / nextLevelExp) * 100));
  const visibleMessages = messages.filter((message) => message.id !== 'init');
  const hasDrawnCard = cardImage && cardImage !== '/default-card.png' && cardImage !== 'default-card.png';
  const companionBubbleText = isDrawingCards
    ? '别盯着牌背看，它会紧张。'
    : isThinking
      ? '我在翻星轨，你先别急着给自己判刑。'
      : hasDrawnCard
        ? PET_MURMURS[(tarotReadings.length + bondLevel) % PET_MURMURS.length]
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

  const handleStartTrial = () => {
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
                '你是星轨里的中文塔罗少女。回答要客观但温柔，像在轻声陪伴用户看清问题；不要恐吓、不要审判、不要冷冰冰地下结论。不要使用 Markdown 星号、加粗符号或井号标题。没有明确要求抽牌时，不要重新抽牌，只基于当前上下文继续解读。',
            },
            {
              role: 'user',
              content: shouldDraw
                ? buildPrompt(question, cards, isInternetMode)
                : buildCurrentReadingPrompt(question, currentReading, image, isInternetMode),
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
            summary: answer.replace(/\s+/g, ' ').slice(0, 140),
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
    canvas.height = 1440;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bg = ctx.createLinearGradient(0, 0, 1080, 1440);
    bg.addColorStop(0, '#0b1020');
    bg.addColorStop(1, '#070912');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1440);

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
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 42px sans-serif';
    wrapCanvasText(ctx, reading.question, 500, 300, 430, 58, 4);
    ctx.fillStyle = '#F4CF83';
    ctx.font = '800 30px sans-serif';
    wrapCanvasText(ctx, reading.cards, 500, 580, 430, 44, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '500 30px sans-serif';
    wrapCanvasText(ctx, reading.summary, 92, 900, 880, 52, 6);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const file = new File([blob], `星轨牌迹-${Date.now()}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: '我的星轨牌迹', files: [file] });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    setShowScrollTop(target.scrollTop > 360);
    setShowScrollBottom(target.scrollHeight - target.scrollTop - target.clientHeight > 220);
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
          visibleMessages.length > 0 ? 'pb-[176px]' : 'pb-[132px]',
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

            <div className={clsx('relative z-10 mt-2', visibleMessages.length > 0 ? 'min-h-[68px]' : 'min-h-[300px]')}>
              {visibleMessages.length > 0 && (
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
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
                  <button
                    onClick={() => handleSend('解读当前牌面', { mode: 'current' })}
                    disabled={isThinking}
                    className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[#17130f] text-[#f4cf83] shadow-[0_12px_26px_rgba(55,35,12,0.18)] disabled:opacity-45 dark:bg-[#f4cf83] dark:text-[#17130f]"
                    aria-label="解读当前牌面"
                    title="解读当前牌面"
                  >
                    <Sparkles size={19} />
                  </button>
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
                  className="flex h-[52px] w-[52px] items-center justify-center rounded-[22px] bg-[#f4ecdf] text-[#806f5c] shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] transition-transform active:scale-95 dark:bg-white/[0.07] dark:text-white/58"
                  aria-label="打开牌迹"
                  title="牌迹"
                >
                  <BookOpen size={23} />
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
                    <DailyMission icon={<Crown size={13} />} done={simulatedRecently} title={'\u505a\u9009\u62e9'} onClick={() => handleDailyMissionShortcut('simulator')} />
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
        {composerSuggestions}
        {composer}
      </div>

      <AnimatePresence>
        {visibleMessages.length > 0 && showScrollBottom && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            onClick={() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
            className="absolute bottom-[112px] left-[calc(50%_-_20px)] z-40 flex h-10 w-10 items-center justify-center rounded-full border border-[#efe3cf]/76 bg-white/84 text-[#7a6a56] shadow-[0_10px_26px_rgba(70,45,20,0.12)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.09] dark:text-white/62"
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
            className="absolute bottom-[164px] left-[calc(50%_-_20px)] z-40 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-apple-text-muted shadow-[0_10px_26px_rgba(70,45,20,0.12)] backdrop-blur-xl dark:bg-white/[0.08]"
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
        weeklyReportText={weeklyReportText}
        weekCount={weekReadings.length}
        plusActive={plusActive}
        onUpgrade={() => openUpgradePrompt('weekly')}
        onShare={handleShareReadingCard}
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
        trialAvailable={!membership.trialUsed && !plusActive}
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
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/46 text-apple-text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-transform active:scale-95 dark:bg-white/[0.06]"
                aria-label="打开牌迹"
                title="牌迹"
              >
                <BookOpen size={19} />
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
                  <DailyMission icon={<Crown size={13} />} done={simulatedRecently} title="做选择" />
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
        weeklyReportText={weeklyReportText}
        weekCount={weekReadings.length}
        plusActive={plusActive}
        onUpgrade={() => openUpgradePrompt('weekly')}
        onShare={handleShareReadingCard}
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
        trialAvailable={!membership.trialUsed && !plusActive}
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
      ? 'h-[226px] w-[200px]'
      : 'h-[250px] w-[220px]'
    : compact
      ? 'h-[246px] w-[316px]'
      : 'h-[274px] w-[360px]';

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
          <div className={clsx('relative -mt-24 flex items-center justify-center', frameSize)}>
            <motion.div
              animate={{ opacity: [0, 1, 1], y: [12, 0, 0] }}
              transition={{ duration: 3.8, times: [0, 0.12, 1], ease: 'easeOut' }}
              className="absolute -top-12 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-1 text-center"
            >
              <span className="font-serif text-[18px] font-semibold tracking-[0.08em] text-[#fff7e8] drop-shadow-[0_10px_26px_rgba(0,0,0,0.42)]">
                {spreadTitle}
              </span>
              <span className="rounded-full border border-[#f4cf83]/24 bg-[#111621]/62 px-3 py-1 text-[10px] font-semibold tracking-[0.22em] text-[#f4cf83] shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                ARCANA REVEAL
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
              const settleY = singleCard ? 8 : Math.abs(spread) * 12 + 4;
              const settleRotate = singleCard ? -2 : spread * 8;
              return (
                <motion.div
                  key={`${cardSrc}-${index}`}
                  initial={{ x: 118 + index * 10, y: 126, rotate: 24 + index * 6, scale: 0.56, zIndex: 20 + index }}
                  animate={{
                    x: [118 + index * 10, 38 + spread * 10, settleX, settleX],
                    y: [126, 18, -12 + Math.abs(spread) * 5, settleY],
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
                  <motion.div
                    animate={{ opacity: [0, 0, 1, 1], y: [-8, -8, 0, 0] }}
                    transition={{ duration: 3.05, delay: index * 0.14, times: [0, 0.42, 0.6, 1], ease: 'easeInOut' }}
                    className={clsx(
                      'absolute left-1/2 z-30 flex -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-[16px] border border-white/12 bg-[#111621]/78 px-2.5 py-1 text-center shadow-[0_12px_28px_rgba(0,0,0,0.30)] backdrop-blur-xl',
                      singleCard ? '-top-[58px] min-w-[118px]' : compact ? '-top-[46px] min-w-[82px]' : '-top-[50px] min-w-[90px]',
                    )}
                  >
                    <span
                      className={clsx(
                        'max-w-[108px] truncate font-serif font-semibold leading-none text-[#fff7e8]',
                        singleCard ? 'text-[12px]' : 'text-[10px]',
                      )}
                    >
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
            <motion.div
              animate={{ opacity: [0, 1, 1], y: [8, 0, 0] }}
              transition={{ duration: 3.8, times: [0, 0.12, 1], ease: 'easeOut' }}
              className="absolute bottom-0 rounded-full border border-[#f4cf83]/22 bg-[#111621]/74 px-4 py-2 text-xs font-semibold text-[#f4cf83] shadow-[0_14px_38px_rgba(0,0,0,0.32)] backdrop-blur-xl"
            >
              {drawCount > 1 ? `正在翻开 ${drawCount} 张牌` : `${animatedCards[0]?.name || '星轨牌面'} · ${animatedCards[0]?.position || '正位'}`}
            </motion.div>
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
                  <div className="text-base font-black text-apple-text">{copy.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-apple-text-muted">{copy.desc}</p>
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
                {copy.cta}
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
  weeklyReportText,
  weekCount,
  plusActive,
  onUpgrade,
  onShare,
}: {
  open: boolean;
  onClose: () => void;
  readings: TarotReading[];
  weeklyReportText: string;
  weekCount: number;
  plusActive: boolean;
  onUpgrade: () => void;
  onShare: (reading: TarotReading) => void;
}) {
  if (typeof document === 'undefined') return null;

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
              <div className="mb-3 rounded-[26px] border border-[#F4CF83]/22 bg-[#F4CF83]/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-[#B97B28] dark:text-[#F4CF83]">本周牌迹报告</div>
                    <p className="mt-1 text-xs leading-relaxed text-apple-text-muted">{weeklyReportText}</p>
                  </div>
                  <div className="shrink-0 rounded-full border border-apple-border bg-apple-surface px-3 py-1.5 text-xs font-bold text-apple-text-muted">
                    {weekCount} 次
                  </div>
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
                          <div className="truncate text-sm font-bold text-apple-text">{reading.question}</div>
                          <div className="mt-1 truncate text-xs text-[#B97B28] dark:text-[#F4CF83]">{reading.cards}</div>
                          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-apple-text-muted">
                            {reading.summary}
                          </p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="text-[10px] text-apple-text-muted">
                              {new Date(reading.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                            </div>
                            <button
                              onClick={() => onShare(reading)}
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

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const chars = text.split('');
  let line = '';
  let lines = 0;
  for (const char of chars) {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = char;
      y += lineHeight;
      lines += 1;
      if (lines >= maxLines - 1) {
        ctx.fillText(`${line}...`, x, y);
        return;
      }
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, y);
}
