import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Book, Plus, Calendar, Sparkles, X, Smile, Meh, Frown, CloudRain, Sun, Loader2, BrainCircuit, History, Lock, Crown, FileText, MessageCircle, Tags } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext, DiaryEntry, ReviewEntry } from '../store';
import clsx from 'clsx';
import { recordAppEvent } from '../lib/engagement';
import { usePersistentDraft } from '../lib/usePersistentDraft';
import { getAppDateKey, getTrustedNow, useTrustedTime } from '../lib/trustedTime';
import { isPlusActive } from '../lib/membership';

const MOODS = [
  { value: 'great', icon: <Sun size={24} />, label: '极佳', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  { value: 'good', icon: <Smile size={24} />, label: '不错', color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  { value: 'neutral', icon: <Meh size={24} />, label: '平淡', color: 'text-stone-500', bg: 'bg-stone-500/10', border: 'border-stone-500/30' },
  { value: 'bad', icon: <Frown size={24} />, label: '糟糕', color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
  { value: 'awful', icon: <CloudRain size={24} />, label: '极差', color: 'text-zinc-600', bg: 'bg-zinc-500/10', border: 'border-zinc-500/30' },
];

const DAILY_DIARY_PROMPTS = [
  '今天哪一刻让你突然松了一口气？',
  '如果把今天抽成一张牌，它更像奖励还是提醒？',
  '今天你最想感谢自己的一个小动作是什么？',
  '最近反复出现的情绪，可能在提醒你什么？',
  '明天只做一件能让自己舒服一点的事，会是什么？',
  '今天有没有一句话、一个眼神，让你在意了很久？',
  '如果此刻的烦恼会变小 10%，你愿意先放下哪一部分？',
];

type ReviewRangeKey = 'today' | '7d' | '15d' | '30d';

const REVIEW_RANGES: Array<{ key: ReviewRangeKey; label: string; days: number }> = [
  { key: 'today', label: '今日', days: 1 },
  { key: '7d', label: '近 7 日', days: 7 },
  { key: '15d', label: '近 15 日', days: 15 },
  { key: '30d', label: '近 30 日', days: 30 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function getReviewWindow(rangeKey: ReviewRangeKey, now = getTrustedNow()) {
  const range = REVIEW_RANGES.find((item) => item.key === rangeKey) || REVIEW_RANGES[0];
  const end = parseDateKey(getAppDateKey(now));
  const start = new Date(end.getTime() - (range.days - 1) * DAY_MS);
  return {
    key: range.key,
    label: range.label,
    startDate: getAppDateKey(start),
    endDate: getAppDateKey(end),
  };
}

function formatDateRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return '';
  return startDate === endDate ? startDate : `${startDate} 至 ${endDate}`;
}

function getEntriesInRange(entries: DiaryEntry[], startDate: string, endDate: string) {
  const startTime = parseDateKey(startDate).getTime();
  const endTime = parseDateKey(endDate).getTime();
  return entries.filter((entry) => {
    const entryTime = parseDateKey(entry.date).getTime();
    return entryTime >= startTime && entryTime <= endTime;
  });
}

function sameIdSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, index) => id === sortedB[index]);
}

type DiaryReviewMeta = Pick<ReviewEntry, 'rangeLabel' | 'startDate' | 'endDate' | 'entryCount'> & Partial<Pick<ReviewEntry, 'date' | 'entryIds'>>;

const DIARY_KEYWORD_HINTS = ['工作', '关系', '恋爱', '家人', '焦虑', '压力', '选择', '金钱', '学习', '失眠', '疲惫', '机会', '边界', '自我'];

function getMoodLabel(mood: DiaryEntry['mood']) {
  return MOODS.find((item) => item.value === mood)?.label || '未记录';
}

function compactText(text: string, limit = 58) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function cleanReviewContent(content: string) {
  return content.replace(/\*\*/g, '').replace(/#/g, '').trim();
}

function getReviewEntries(review: DiaryReviewMeta, entries: DiaryEntry[]) {
  if (review.entryIds?.length) {
    const idSet = new Set(review.entryIds);
    return entries.filter((entry) => idSet.has(entry.id));
  }
  if (review.startDate && review.endDate) {
    return getEntriesInRange(entries, review.startDate, review.endDate);
  }
  return [];
}

function buildDiaryReviewArchive(content: string, meta: DiaryReviewMeta | null, entries: DiaryEntry[]) {
  const cleanContent = cleanReviewContent(content);
  const lines = cleanContent.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const sourceText = `${cleanContent} ${entries.map((entry) => `${entry.content} ${(entry.tags || []).join(' ')}`).join(' ')}`;
  const keywordCounts = new Map<string, number>();

  entries.forEach((entry) => {
    entry.tags?.forEach((tag) => {
      const normalized = tag.trim();
      if (normalized) keywordCounts.set(normalized, (keywordCounts.get(normalized) || 0) + 2);
    });
  });
  DIARY_KEYWORD_HINTS.forEach((keyword) => {
    if (sourceText.includes(keyword)) keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
  });

  const keywords = [...keywordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([keyword]) => keyword)
    .slice(0, 5);

  const sortedEntries = [...entries].sort((a, b) => parseDateKey(a.date).getTime() - parseDateKey(b.date).getTime());
  const timeline = sortedEntries.slice(-4).map((entry) => ({
    id: entry.id,
    date: entry.date.slice(5).replace('-', '/'),
    mood: getMoodLabel(entry.mood),
    content: compactText(entry.content, 42),
  }));

  const adviceLines = lines
    .filter((line) => /建议|可以|先|试着|提醒|适合|不必|别|留意|照顾/.test(line))
    .slice(0, 2);
  const fallbackAdvice = lines.slice(-2).filter(Boolean);

  return {
    title: `${meta?.rangeLabel || '近期'}命运档案`,
    dateRange: formatDateRange(meta?.startDate, meta?.endDate) || meta?.date || '',
    entryCount: typeof meta?.entryCount === 'number' ? meta.entryCount : entries.length,
    keywords: keywords.length > 0 ? keywords : ['情绪', '节奏', '自我'],
    summary: compactText(lines[0] || '这份复盘会慢慢记录你的情绪、选择和生活节奏。', 96),
    timeline,
    advice: adviceLines.length > 0 ? adviceLines : fallbackAdvice,
  };
}

export default function Diary() {
  useTrustedTime();
  const navigate = useNavigate();
  const { diaryEntries, setDiaryEntries, baziResult, profiles, activeProfileId, reviewHistory, setReviewHistory, setAppEvents, membership } = useAppContext();
  const [isAdding, setIsAdding] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<string | null>(null);
  const [reviewResultMeta, setReviewResultMeta] = useState<Pick<ReviewEntry, 'rangeLabel' | 'startDate' | 'endDate' | 'entryCount'> | null>(null);
  const [reviewRange, setReviewRange] = useState<ReviewRangeKey>('today');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // New entry state
  const [newContent, setNewContent, clearContentDraft] = usePersistentDraft('draft:diary:content', '');
  const [newMood, setNewMood, clearMoodDraft] = usePersistentDraft<DiaryEntry['mood']>('draft:diary:mood', 'neutral');
  const [newTags, setNewTags, clearTagsDraft] = usePersistentDraft('draft:diary:tags', '');

  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const trustedNow = getTrustedNow();
  const todayPrompt = DAILY_DIARY_PROMPTS[Math.floor(parseDateKey(getAppDateKey(trustedNow)).getTime() / DAY_MS) % DAILY_DIARY_PROMPTS.length];
  const thisWeekCount = diaryEntries.filter(entry => trustedNow.getTime() - parseDateKey(entry.date).getTime() < 7 * DAY_MS).length;
  const latestMood = diaryEntries[0]?.mood;
  const latestMoodLabel = MOODS.find(mood => mood.value === latestMood)?.label || '未记录';
  const reviewWindow = getReviewWindow(reviewRange, trustedNow);
  const scopedDiaryEntries = getEntriesInRange(diaryEntries, reviewWindow.startDate, reviewWindow.endDate);
  const reviewRangeText = formatDateRange(reviewWindow.startDate, reviewWindow.endDate);
  const plusActive = isPlusActive(membership, trustedNow);
  const isPremiumReviewRange = reviewRange !== 'today';

  const openPlusForReview = () => {
    navigate('/app/profile?plus=1&plan=plus_monthly&from=diary_review');
  };

  const askTarotFromReview = (content: string, meta: DiaryReviewMeta | null, entries: DiaryEntry[]) => {
    const archive = buildDiaryReviewArchive(content, meta, entries);
    const prompt = [
      `请沿着我的「${archive.title}」继续看。`,
      archive.dateRange ? `时间范围：${archive.dateRange}。` : '',
      `关键词：${archive.keywords.join('、')}。`,
      `复盘摘要：${archive.summary}`,
      '我想知道接下来最需要照顾的重点，以及今天可以先做哪一件小事。',
    ].filter(Boolean).join('\n');

    try {
      localStorage.setItem('draft:home:input', JSON.stringify(prompt));
    } catch {
      // Draft handoff is optional. Navigation still works if storage is unavailable.
    }
    navigate('/app');
  };

  const handleSelectReviewRange = (rangeKey: ReviewRangeKey) => {
    if (rangeKey !== 'today' && !plusActive) {
      openPlusForReview();
      return;
    }
    setReviewRange(rangeKey);
  };

  const handleSaveEntry = () => {
    if (!newContent.trim()) return;
    
    const entry: DiaryEntry = {
      id: Date.now().toString(),
      date: getAppDateKey(getTrustedNow()),
      mood: newMood,
      content: newContent.trim(),
      tags: newTags.split(/[,，\s]+/).filter(t => t.trim() !== ''),
    };

    setDiaryEntries(prev => [entry, ...prev]);
    setAppEvents((events) => recordAppEvent(events, 'diary_save', { mood: newMood, tags: entry.tags.length }));
    setIsAdding(false);
    clearContentDraft('');
    clearMoodDraft('neutral');
    clearTagsDraft('');
  };

  const handleDelete = (id: string) => {
    if (window.confirm('确定要删除这篇日记吗？')) {
      setDiaryEntries(prev => prev.filter(e => e.id !== id));
    }
  };

  const handleReview = async () => {
    if (isPremiumReviewRange && !plusActive) {
      openPlusForReview();
      return;
    }

    if (scopedDiaryEntries.length === 0) {
      setReviewResult(`${reviewWindow.label}还没有日记可复盘。先写一篇，星轨才能看见这段时间真正发生了什么。`);
      setReviewResultMeta({
        rangeLabel: reviewWindow.label,
        startDate: reviewWindow.startDate,
        endDate: reviewWindow.endDate,
        entryCount: 0,
      });
      return;
    }

    const scopedEntryIds = scopedDiaryEntries.map((entry) => entry.id);
    const existingReview = reviewHistory.find((review) =>
      review.startDate === reviewWindow.startDate &&
      review.endDate === reviewWindow.endDate &&
      sameIdSet(review.entryIds || [], scopedEntryIds)
    );

    if (existingReview) {
      setReviewResult(existingReview.content);
      setReviewResultMeta({
        rangeLabel: existingReview.rangeLabel || reviewWindow.label,
        startDate: existingReview.startDate || reviewWindow.startDate,
        endDate: existingReview.endDate || reviewWindow.endDate,
        entryCount: existingReview.entryCount || scopedDiaryEntries.length,
      });
      return;
    }

    setIsReviewing(true);
    setReviewResult(null);
    setReviewResultMeta({
      rangeLabel: reviewWindow.label,
      startDate: reviewWindow.startDate,
      endDate: reviewWindow.endDate,
      entryCount: scopedDiaryEntries.length,
    });

    try {
      const prompt = `
你是一位精通心理学与命理学的“命运复盘导师”。
请根据用户指定时间段内的日记记录（以及八字命理信息，如果有的话），进行深度的命运复盘。

【用户档案信息】：
${activeProfile ? `姓名：${activeProfile.name}，性别：${activeProfile.gender === 'male' ? '男' : '女'}，出生日期：${activeProfile.birthDate} ${activeProfile.birthTime}，出生地：${activeProfile.birthLocation}` : '未提供'}

【用户八字五行信息】：
${baziResult ? JSON.stringify(baziResult.wuxing) : '未提供'}

【本次复盘范围】：
${reviewWindow.label}，${reviewRangeText}，共 ${scopedDiaryEntries.length} 篇日记。

【本次需要复盘的日记】：
${JSON.stringify(scopedDiaryEntries.map(e => ({ date: e.date, mood: e.mood, content: e.content, tags: e.tags })))}

【复盘要求】：
1. 语气要温和、睿智、充满洞察力，像一位心灵导师。
2. 只分析本次复盘范围内的日记，不要泛泛复盘更早以前的内容。
3. 结合用户档案中的出生时间、八字五行（如果有），指出可能受到的流日/流月气场影响（例如：“最近火气较旺，导致你比较急躁...”）。
4. 分析这段时间的情绪起伏、反复出现的主题，以及用户真正需要照顾的心理需求。
5. 给出1-2条切实可行的改运/调整心态的建议。
6. 字数控制在300-500字左右。纯文本格式，段落之间用换行分隔。绝对不要使用Markdown格式（如**加粗**、#标题等）。
`;

      let aiText = "";
      try {
        const res = await fetch('/api/deepseek/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: '你是一位精通心理学与命理学的命运复盘导师。' },
              { role: 'user', content: prompt }
            ]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        aiText = data.choices[0].message.content;
      } catch (err) {
        console.error("DeepSeek Error:", err);
        throw err;
      }

      const finalResult = aiText.replace(/\*\*/g, '').replace(/#/g, '');
      setReviewResult(finalResult);
      
      // Save to history (limit to 30)
      const newReview: ReviewEntry = {
        id: Date.now().toString(),
        date: getAppDateKey(getTrustedNow()),
        content: finalResult,
        rangeLabel: reviewWindow.label,
        startDate: reviewWindow.startDate,
        endDate: reviewWindow.endDate,
        entryCount: scopedDiaryEntries.length,
        entryIds: scopedEntryIds,
      };
      setReviewHistory(prev => [newReview, ...prev].slice(0, 30));
      setAppEvents((events) => recordAppEvent(events, 'diary_review', { diaryCount: scopedDiaryEntries.length, range: reviewWindow.key }));

    } catch (error: any) {
      console.error("Review Error:", error);
      setReviewResult("复盘暂时失败了，但你的日记已经安全保存在这里。稍后再点一次就行。");
    } finally {
      setIsReviewing(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-y-auto overscroll-contain px-4 pt-6 pb-40 text-apple-text no-scrollbar">
      {/* Header */}
      <div className="flex flex-col items-center mb-8 relative z-10">
        <h1 className="mb-2 flex items-center gap-2 font-sans text-3xl font-bold tracking-widest text-apple-accent dark:text-apple-gold dark:drop-shadow-[0_0_22px_rgba(244,207,131,0.16)]">
          <Book size={28} />
          命运日记
        </h1>
        <p className="text-apple-text-muted text-sm tracking-widest dark:text-[#b7b1a3]">记录心路历程，洞察命运轨迹</p>
      </div>

      <div className="max-w-md mx-auto space-y-6 relative z-10">
        <section className="relative overflow-hidden rounded-3xl border border-apple-gold/22 bg-apple-gold/[0.07] p-4 shadow-[0_18px_42px_rgba(117,82,42,0.10)] dark:border-apple-gold/24 dark:bg-[linear-gradient(145deg,rgba(244,207,131,0.13),rgba(22,23,31,0.92)_42%,rgba(9,10,16,0.96))] dark:shadow-[0_20px_54px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.07)]">
          <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-apple-gold/18 blur-3xl" />
          <div className="pointer-events-none absolute -left-14 bottom-0 h-32 w-32 rounded-full bg-[#7b6748]/18 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-apple-gold/38 to-transparent" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-apple-gold dark:text-[#f3d487]">
                <Sparkles size={16} />
                <span className="text-sm font-bold">今日记录灵感</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-apple-text dark:text-[#f3efe6]">{todayPrompt}</p>
            </div>
            <button
              onClick={() => {
                setIsAdding(true);
              }}
              className="shrink-0 rounded-full bg-apple-gold px-3 py-1.5 text-xs font-bold text-[#080a11] shadow-[0_10px_24px_rgba(185,123,40,0.20)] transition-transform active:scale-95 dark:bg-[#f1cf80] dark:shadow-[0_12px_28px_rgba(244,207,131,0.18)]"
            >
              去写
            </button>
          </div>
          <div className="relative z-10 mt-4 grid grid-cols-2 gap-2">
            <DiaryStat label="本周记录" value={`${thisWeekCount} 篇`} />
            <DiaryStat label="最近心情" value={latestMoodLabel} />
          </div>
        </section>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setIsAdding(true)}
            className="col-span-2 bg-apple-surface backdrop-blur-xl rounded-3xl p-5 flex flex-col items-center justify-center gap-3 shadow-[0_14px_38px_rgba(117,82,42,0.12)] hover:shadow-[0_12px_32px_rgba(185,123,40,0.16)] transition-all text-apple-accent border border-apple-border dark:border-apple-gold/14 dark:bg-[#141821]/82 dark:text-apple-gold dark:shadow-[0_12px_34px_rgba(0,0,0,0.38)]"
          >
            <div className="w-12 h-12 rounded-full bg-apple-accent/10 flex items-center justify-center dark:bg-apple-gold/12">
              <Plus size={24} />
            </div>
            <span className="font-medium text-sm tracking-widest">写日记</span>
          </button>

          <section className="col-span-2 rounded-3xl border border-apple-border bg-apple-surface/78 p-3 shadow-[0_14px_38px_rgba(117,82,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-[#11151f]/80 dark:shadow-[0_10px_32px_rgba(0,0,0,0.34)]">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <div className="text-sm font-bold text-apple-text">选择复盘范围</div>
                <div className="mt-0.5 text-[11px] text-apple-text-muted">
                  今日复盘免费 · 周期复盘 Plus 可用
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-apple-gold/12 px-2.5 py-1 text-[11px] font-bold text-apple-gold">
                {plusActive ? <Crown size={12} /> : <Lock size={12} />}
                {plusActive ? 'Plus 已开通' : 'Plus 解锁'}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {REVIEW_RANGES.map((range) => {
                const active = reviewRange === range.key;
                const locked = range.key !== 'today' && !plusActive;
                return (
                  <button
                    key={range.key}
                    type="button"
                    onClick={() => handleSelectReviewRange(range.key)}
                    className={clsx(
                      'relative rounded-full border px-2 py-2 text-xs font-bold transition-all',
                      active
                        ? 'border-apple-gold bg-apple-gold text-[#17130f] shadow-[0_10px_24px_rgba(185,123,40,0.18)]'
                        : locked
                          ? 'border-apple-border bg-apple-bg/40 text-apple-text-muted/60 hover:border-apple-gold/35 hover:text-apple-gold dark:border-white/10 dark:bg-black/14'
                          : 'border-apple-border bg-apple-bg/50 text-apple-text-muted hover:border-apple-gold/35 hover:text-apple-text dark:border-white/10 dark:bg-black/14'
                    )}
                    title={locked ? '开通 Plus 后可用' : range.label}
                  >
                    <span className="inline-flex items-center justify-center gap-1">
                      {locked && <Lock size={11} />}
                      {range.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 rounded-2xl bg-apple-bg/50 px-3 py-2 text-[11px] leading-relaxed text-apple-text-muted dark:bg-black/14">
              当前范围：{reviewRangeText} · {scopedDiaryEntries.length} 篇
            </div>
          </section>
          
          <button
            onClick={handleReview}
            disabled={isReviewing}
            className={clsx(
              'rounded-3xl p-5 flex flex-col items-center justify-center gap-3 transition-all disabled:opacity-70',
              isPremiumReviewRange && !plusActive
                ? 'border border-apple-gold/30 bg-apple-surface text-apple-gold shadow-[0_14px_38px_rgba(117,82,42,0.12)] dark:bg-[#141821]/82'
                : 'bg-gradient-to-br from-apple-gold to-[#c88a34] shadow-[0_16px_34px_rgba(185,123,40,0.20)] text-[#17130f] hover:opacity-90 dark:from-[#f1cf80] dark:to-[#b98436] dark:text-[#17130f] dark:shadow-[0_14px_34px_rgba(244,207,131,0.18)]'
            )}
          >
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              {isReviewing ? <Loader2 size={24} className="animate-spin" /> : isPremiumReviewRange && !plusActive ? <Lock size={24} /> : <BrainCircuit size={24} />}
            </div>
            <span className="font-medium text-sm tracking-widest">
              {isReviewing ? '复盘中...' : isPremiumReviewRange && !plusActive ? '开通 Plus' : `${reviewWindow.label}复盘`}
            </span>
          </button>

          <button
            onClick={() => setShowHistoryModal(true)}
            className="bg-apple-surface backdrop-blur-xl rounded-3xl p-5 flex flex-col items-center justify-center gap-3 shadow-[0_14px_38px_rgba(117,82,42,0.12)] hover:shadow-[0_12px_32px_rgba(185,123,40,0.15)] transition-all text-apple-text-muted border border-apple-border dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
          >
            <div className="w-12 h-12 rounded-full bg-apple-surface flex items-center justify-center">
              <History size={24} />
            </div>
            <span className="font-medium text-sm tracking-widest">复盘记录</span>
          </button>
        </div>

        {/* Review Result */}
        <AnimatePresence>
          {reviewResult && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <DiaryReviewArchiveCard
                content={reviewResult}
                meta={reviewResultMeta}
                entries={scopedDiaryEntries}
                onClose={() => setReviewResult(null)}
                onContinue={() => askTarotFromReview(reviewResult, reviewResultMeta, scopedDiaryEntries)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Diary List */}
        <div className="space-y-4">
          <h3 className="font-sans font-bold text-lg text-apple-text flex items-center gap-2">
            <Calendar size={18} className="text-apple-text-muted" />
            过往记录
          </h3>
          
          {diaryEntries.length === 0 ? (
            <div className="text-center py-12 bg-apple-surface backdrop-blur-xl rounded-3xl border border-dashed border-apple-border shadow-[0_14px_38px_rgba(117,82,42,0.10)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
              <Book size={32} className="mx-auto text-apple-text-muted mb-3" />
              <p className="text-sm text-apple-text-muted">还没有记录过日记，开始写下第一篇吧</p>
            </div>
          ) : (
            diaryEntries.map(entry => {
              const moodObj = MOODS.find(m => m.value === entry.mood) || MOODS[2];
              return (
                <motion.div 
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-apple-surface backdrop-blur-xl rounded-3xl p-6 shadow-[0_14px_38px_rgba(117,82,42,0.12)] relative group border border-apple-border dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
                >
                  <button 
                    onClick={() => handleDelete(entry.id)}
                    className="absolute top-5 right-5 text-apple-text-muted hover:text-red-500 transition-colors"
                  >
                    <X size={16} />
                  </button>
                  
                  <div className="flex items-center gap-4 mb-4">
                    <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center border-2", moodObj.bg, moodObj.color, moodObj.border)}>
                      {moodObj.icon}
                    </div>
                    <div>
                      <div className="font-mono text-sm font-bold tracking-widest text-apple-text">{entry.date}</div>
                      <div className={clsx("text-xs font-medium mt-0.5", moodObj.color)}>{moodObj.label}</div>
                    </div>
                  </div>
                  
                  <p className="text-sm text-apple-text leading-relaxed mb-4">
                    {entry.content}
                  </p>
                  
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {entry.tags.map((tag, idx) => (
                        <span key={idx} className="text-[10px] px-2.5 py-1 bg-apple-surface-hover text-apple-text-muted rounded-lg tracking-wider">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Entry Modal */}
      <Portal>
        <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[160] flex items-end justify-center overflow-y-auto overscroll-contain p-4 sm:items-center sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsAdding(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: "100%" }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-apple-border bg-apple-surface p-6 shadow-2xl backdrop-blur-xl no-scrollbar touch-pan-y [-webkit-overflow-scrolling:touch] sm:rounded-3xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-sans font-bold text-xl text-apple-text tracking-widest">写日记</h3>
                <button onClick={() => setIsAdding(false)} className="p-2 rounded-full bg-apple-surface-hover text-apple-text-muted hover:bg-apple-surface-hover transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Mood Selection */}
                <div>
                  <label className="block text-sm font-medium text-apple-text-muted mb-3 tracking-widest">今天的心情如何？</label>
                  <div className="flex justify-between">
                    {MOODS.map(mood => (
                      <button
                        key={mood.value}
                        onClick={() => setNewMood(mood.value as any)}
                        className={clsx(
                          "flex flex-col items-center gap-2 p-2 rounded-xl transition-all",
                          newMood === mood.value ? "scale-110 bg-apple-surface shadow-[0_8px_22px_rgba(117,82,42,0.14)] dark:shadow-[0_4px_15px_rgba(0,0,0,0.2)]" : "opacity-50 hover:opacity-100"
                        )}
                      >
                        <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center border-2", mood.bg, mood.color, mood.border)}>
                          {mood.icon}
                        </div>
                        <span className={clsx("text-xs font-medium tracking-widest", newMood === mood.value ? mood.color : "text-apple-text-muted")}>
                          {mood.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label className="block text-sm font-medium text-apple-text-muted mb-2 tracking-widest">发生了什么事？</label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder={todayPrompt}
                    className="w-full bg-apple-surface border border-apple-border rounded-2xl p-4 text-sm text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-accent/35 resize-none h-32 transition-all placeholder:text-apple-text-muted/45 dark:focus:ring-apple-gold/35 dark:placeholder:text-[#b7b1a3]/42"
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-apple-text-muted mb-2 tracking-widest">添加标签 (用空格或逗号分隔)</label>
                  <input
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    placeholder="例如：工作 恋爱 焦虑"
                    className="w-full bg-apple-surface border border-apple-border rounded-xl p-3 text-sm text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-accent/35 transition-all placeholder:text-apple-text-muted/50 dark:focus:ring-apple-gold/35"
                  />
                </div>

                <button
                  onClick={handleSaveEntry}
                  disabled={!newContent.trim()}
                  className="w-full py-4 bg-apple-gold text-[#17130f] rounded-2xl font-bold tracking-widest shadow-[0_14px_28px_rgba(185,123,40,0.20)] disabled:opacity-50 disabled:shadow-none transition-all hover:bg-[#c88a34] dark:bg-[#f1cf80] dark:text-[#17130f] dark:shadow-[0_12px_28px_rgba(244,207,131,0.18)] dark:hover:bg-[#d6aa54]"
                >
                  保存日记
                </button>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>
      </Portal>

      {/* History Modal */}
      <Portal>
        <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-[160] flex items-end justify-center overflow-y-auto overscroll-contain p-4 sm:items-center sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowHistoryModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: "100%" }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-apple-surface backdrop-blur-xl border border-apple-border rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative z-10 max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6 shrink-0">
                <h3 className="font-sans font-bold text-xl text-apple-text tracking-widest flex items-center gap-2">
                  <History size={20} className="text-apple-accent dark:text-apple-gold" />
                  复盘记录
                </h3>
                <button onClick={() => setShowHistoryModal(false)} className="p-2 rounded-full bg-apple-surface-hover text-apple-text-muted hover:bg-apple-surface-hover transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto no-scrollbar flex-1 space-y-4 pb-4">
                {reviewHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <History size={32} className="mx-auto text-apple-text-muted/20 mb-3" />
                    <p className="text-sm text-apple-text-muted">暂无复盘记录</p>
                  </div>
                ) : (
                  reviewHistory.map((review) => {
                    const entries = getReviewEntries(review, diaryEntries);
                    return (
                      <React.Fragment key={review.id}>
                        <DiaryReviewArchiveCard
                          content={review.content}
                          meta={review}
                          entries={entries}
                          compact
                          onContinue={() => askTarotFromReview(review.content, review, entries)}
                        />
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}

function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function DiaryReviewArchiveCard({
  content,
  meta,
  entries,
  compact = false,
  onClose,
  onContinue,
}: {
  content: string;
  meta: DiaryReviewMeta | null;
  entries: DiaryEntry[];
  compact?: boolean;
  onClose?: () => void;
  onContinue?: () => void;
}) {
  const archive = buildDiaryReviewArchive(content, meta, entries);

  return (
    <div
      className={clsx(
        'relative overflow-hidden border border-apple-accent/24 bg-apple-surface shadow-[0_14px_38px_rgba(117,82,42,0.12)] backdrop-blur-xl dark:border-apple-gold/22 dark:bg-[#111722]/86 dark:shadow-[0_14px_42px_rgba(0,0,0,0.34)]',
        compact ? 'rounded-[26px] p-4' : 'rounded-3xl p-5 sm:p-6',
      )}
    >
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-apple-gold/12 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-apple-gold/36 to-transparent" />

      {onClose && (
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-apple-surface-hover p-2 text-apple-text-muted hover:text-apple-text"
          aria-label="关闭复盘档案"
        >
          <X size={16} />
        </button>
      )}

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3 pr-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-apple-gold">
              <FileText size={14} />
              复盘档案
            </div>
            <h3 className="mt-1 line-clamp-2 text-lg font-black text-apple-text">{archive.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-apple-text-muted">
              <span className="inline-flex items-center gap-1">
                <Calendar size={12} />
                {archive.dateRange || '近期记录'}
              </span>
              <span>{archive.entryCount} 篇日记</span>
            </div>
          </div>
          {!onClose && onContinue && (
            <button
              onClick={onContinue}
              className="shrink-0 rounded-full bg-apple-gold px-3 py-2 text-[11px] font-black text-[#17130f] shadow-[0_12px_28px_rgba(185,123,40,0.18)] transition-transform active:scale-[0.98]"
            >
              继续问
            </button>
          )}
        </div>

        <p className="mt-4 rounded-[20px] border border-apple-border bg-apple-bg/45 p-3 text-sm leading-relaxed text-apple-text dark:border-white/10 dark:bg-black/16">
          {archive.summary}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {archive.keywords.map((keyword) => (
            <span
              key={keyword}
              className="inline-flex items-center gap-1 rounded-full border border-apple-gold/22 bg-apple-gold/10 px-2.5 py-1 text-[11px] font-bold text-apple-gold"
            >
              <Tags size={11} />
              {keyword}
            </span>
          ))}
        </div>

        {archive.timeline.length > 0 && (
          <div className="mt-4 rounded-[22px] border border-apple-border bg-apple-surface/70 p-3 dark:border-white/10 dark:bg-black/16">
            <div className="mb-2 flex items-center gap-2 text-xs font-black text-apple-text">
              <History size={14} className="text-apple-gold" />
              情绪时间线
            </div>
            <div className="space-y-2">
              {archive.timeline.map((item) => (
                <div key={item.id} className="grid grid-cols-[46px_minmax(0,1fr)] gap-2">
                  <div className="pt-0.5 text-[10px] font-bold text-apple-text-muted">{item.date}</div>
                  <div className="min-w-0 border-l border-apple-gold/24 pl-3">
                    <div className="text-xs font-black text-apple-text">{item.mood}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-apple-text-muted">{item.content}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {archive.advice.length > 0 && (
          <div className="mt-3 grid gap-2">
            {archive.advice.map((item, index) => (
              <div key={`${item}-${index}`} className="rounded-[18px] bg-apple-surface-hover px-3 py-2 text-xs leading-relaxed text-apple-text-muted">
                <span className="mr-1 font-black text-apple-text">留意 {index + 1}</span>
                {item}
              </div>
            ))}
          </div>
        )}

        {!compact && (
          <details className="mt-4 rounded-[20px] border border-apple-border bg-apple-bg/38 p-3 dark:border-white/10 dark:bg-black/14">
            <summary className="cursor-pointer text-xs font-black text-apple-text-muted">查看完整复盘</summary>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-apple-text">
              {cleanReviewContent(content)}
            </div>
          </details>
        )}

        {onClose && onContinue && (
          <button
            onClick={onContinue}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-apple-gold py-3 text-sm font-black text-[#17130f] shadow-[0_14px_30px_rgba(185,123,40,0.20)] transition-transform active:scale-[0.99]"
          >
            <MessageCircle size={16} />
            带着这份档案继续问
          </button>
        )}
      </div>
    </div>
  );
}

function DiaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-apple-border bg-apple-surface/70 p-3 backdrop-blur-xl dark:border-apple-gold/14 dark:bg-[#11151f]/72 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
      <div className="text-[11px] text-apple-text-muted">{label}</div>
      <div className="mt-1 text-base font-bold text-apple-text">{value}</div>
    </div>
  );
}
