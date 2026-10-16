import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Book, Plus, Calendar, Sparkles, X, Smile, Meh, Frown, CloudRain, Sun, Loader2, BrainCircuit, History, Lock, Crown, FileText, MessageCircle, Tags, Pencil, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppContext, DiaryEntry, ReviewEntry } from '../store';
import clsx from 'clsx';
import { buildDiaryThemeTrends, recordAppEvent } from '../lib/engagement';
import { usePersistentDraft } from '../lib/usePersistentDraft';
import { getAppDateKey, getTrustedNow, useTrustedTime } from '../lib/trustedTime';
import { isPlusActive } from '../lib/membership';
import { ACTIONABLE_MEMORY_RULES, DIARY_REVIEW_SYSTEM_PROMPT, buildUserAddressInstruction, cleanAiText } from '../lib/aiPrompting';
import { DEEPSEEK_MAX_TOKENS, DEEPSEEK_TEXT_MODEL } from '../lib/aiModels';
import { SERVICE_FALLBACK } from '../lib/serviceFeedback';
import { createGenerationTrace, createRecordId } from '../lib/generationTrace';
import { apiFetch } from '../lib/apiClient';
import PageHeader from '../components/ui/PageHeader';
import DiaryIllustration from '../components/DiaryIllustration';
import { useDialogFocus } from '../lib/useDialogFocus';
import { getStoredAccountSession } from '../lib/accountClient';
import { writeWorkspaceStorage } from '../lib/workspacePersistence';
import { filterDiaryEntries, getDiarySourceSignature, isDiaryReviewCurrent, parseDiaryTags, updateDiaryEntry } from '../lib/diaryRecords';
import { getBaziResultStatus } from '../lib/baziProfiles';
import { MOTION_DURATION, MOTION_EASE } from '../lib/uiMotion';

const MOODS = [
  { value: 'great', icon: <Sun size={24} />, label: '极佳', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  { value: 'good', icon: <Smile size={24} />, label: '不错', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  { value: 'neutral', icon: <Meh size={24} />, label: '平淡', color: 'text-apple-text-muted', bg: 'bg-stone-500/10', border: 'border-stone-500/30' },
  { value: 'bad', icon: <Frown size={24} />, label: '糟糕', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
  { value: 'awful', icon: <CloudRain size={24} />, label: '极差', color: 'text-zinc-600 dark:text-zinc-300', bg: 'bg-zinc-500/10', border: 'border-zinc-500/30' },
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

type DiaryReviewMeta = Pick<ReviewEntry, 'rangeLabel' | 'startDate' | 'endDate' | 'entryCount'> & Partial<Pick<ReviewEntry, 'date' | 'entryIds' | 'sourceSignature'>>;

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
  // Do not silently reconstruct an old AI archive from subsequently edited diary text.
  entries = meta && isDiaryReviewCurrent(meta, entries) ? entries : [];
  const cleanContent = cleanReviewContent(content);
  const lines = cleanContent.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const sourceText = `${cleanContent} ${entries.map((entry) => `${entry.content} ${(entry.tags || []).join(' ')}`).join(' ')}`;
  const keywordCounts = new Map<string, number>();
  const diaryTrends = buildDiaryThemeTrends(entries, { limit: 3 });

  entries.forEach((entry) => {
    entry.tags?.forEach((tag) => {
      const normalized = tag.trim();
      if (normalized) keywordCounts.set(normalized, (keywordCounts.get(normalized) || 0) + 2);
    });
  });
  DIARY_KEYWORD_HINTS.forEach((keyword) => {
    if (sourceText.includes(keyword)) keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
  });

  const keywords = [
    ...diaryTrends.map((trend) => trend.label),
    ...[...keywordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([keyword]) => keyword)
  ].filter((keyword, index, list) => list.indexOf(keyword) === index).slice(0, 5);

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
  const reduceMotion = useReducedMotion();
  const enterTransition = { duration: reduceMotion ? 0 : MOTION_DURATION.standard, ease: MOTION_EASE };
  const exitTransition = { duration: reduceMotion ? 0 : MOTION_DURATION.exit, ease: MOTION_EASE };
  const workspaceOwner = useRef(getStoredAccountSession()?.user.id || null);
  useTrustedTime();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { diaryEntries, setDiaryEntries, baziResult: storedBaziResult, profiles, activeProfileId, reviewHistory, setReviewHistory, setAppEvents, membership, userName, preferredAddress } = useAppContext();
  const [isAdding, setIsAdding] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const reviewRequestRef = useRef(false);
  const [reviewFailed, setReviewFailed] = useState(false);
  const [reviewResult, setReviewResult] = useState<string | null>(null);
  const [reviewResultMeta, setReviewResultMeta] = useState<DiaryReviewMeta | null>(null);
  const [reviewRange, setReviewRange] = useState<ReviewRangeKey>('today');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editMood, setEditMood] = useState<DiaryEntry['mood']>('neutral');
  const [editTags, setEditTags] = useState('');
  const [query, setQuery] = useState('');
  const [moodFilter, setMoodFilter] = useState<DiaryEntry['mood'] | 'all'>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [entryNotice, setEntryNotice] = useState('');
  const entrySaveRef = useRef(false);
  const entryDialogRef = useRef<HTMLDivElement>(null);
  const historyDialogRef = useRef<HTMLDivElement>(null);
  const closeEntryDialog = () => { setIsAdding(false); setEditingEntry(null); };
  useDialogFocus(entryDialogRef, isAdding, closeEntryDialog);
  useDialogFocus(historyDialogRef, showHistoryModal, () => setShowHistoryModal(false));

  // New entry state
  const [newContent, setNewContent, clearContentDraft] = usePersistentDraft('draft:diary:content', '');
  const [newMood, setNewMood, clearMoodDraft] = usePersistentDraft<DiaryEntry['mood']>('draft:diary:mood', 'neutral');
  const [newTags, setNewTags, clearTagsDraft] = usePersistentDraft('draft:diary:tags', '');

  const entryContent = editingEntry ? editContent : newContent;
  const entryMood = editingEntry ? editMood : newMood;
  const entryTags = editingEntry ? editTags : newTags;
  const filteredEntries = filterDiaryEntries(diaryEntries, { query, mood: moodFilter, tag: tagFilter });
  const availableTags = [...new Set<string>(diaryEntries.flatMap((entry: DiaryEntry) => entry.tags || []))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const hasFilters = Boolean(query.trim() || moodFilter !== 'all' || tagFilter);
  const clearFilters = () => { setQuery(''); setMoodFilter('all'); setTagFilter(''); setVisibleCount(20); };
  const openNewEntry = () => { entrySaveRef.current = false; setEditingEntry(null); setIsAdding(true); setEntryNotice(''); };
  const openEditEntry = (entry: DiaryEntry) => {
    entrySaveRef.current = false;
    setEditingEntry(entry); setEditContent(entry.content); setEditMood(entry.mood); setEditTags((entry.tags || []).join(' '));
    setIsAdding(true); setEntryNotice('');
  };
  useEffect(() => { setVisibleCount(20); }, [query, moodFilter, tagFilter]);
  useEffect(() => {
    const entryId = searchParams.get('entry');
    if (!entryId) return;
    const entry = diaryEntries.find(item => item.id === entryId);
    if (entry) openEditEntry(entry);
    else setEntryNotice('这篇日记已不存在，其他记录仍可继续查看。');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('entry');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, diaryEntries]);

  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const baziResult = getBaziResultStatus(storedBaziResult, activeProfile) === 'current' ? storedBaziResult : null;
  const trustedNow = getTrustedNow();
  const todayPrompt = DAILY_DIARY_PROMPTS[Math.floor(parseDateKey(getAppDateKey(trustedNow)).getTime() / DAY_MS) % DAILY_DIARY_PROMPTS.length];
  const thisWeekCount = diaryEntries.filter(entry => trustedNow.getTime() - parseDateKey(entry.date).getTime() < 7 * DAY_MS).length;
  const latestMood = diaryEntries[0]?.mood;
  const latestMoodLabel = MOODS.find(mood => mood.value === latestMood)?.label || '未记录';
  const reviewWindow = getReviewWindow(reviewRange, trustedNow);
  const scopedDiaryEntries = getEntriesInRange(diaryEntries, reviewWindow.startDate, reviewWindow.endDate);
  const diaryThemeTrends = buildDiaryThemeTrends(diaryEntries, { limit: 3, days: 30, now: trustedNow.getTime() });
  const reviewRangeText = formatDateRange(reviewWindow.startDate, reviewWindow.endDate);
  const plusActive = isPlusActive(membership, trustedNow);
  const isPremiumReviewRange = reviewRange !== 'today';
  const userAddressInstruction = buildUserAddressInstruction(preferredAddress, userName);

  const openPlusForReview = () => {
    navigate('/app/profile?plus=1&plan=plus_monthly&from=diary_review');
  };

  const askTarotFromReview = async (content: string, meta: DiaryReviewMeta | null, entries: DiaryEntry[]) => {
    const archive = buildDiaryReviewArchive(content, meta, entries);
    const prompt = [
      `请沿着我的「${archive.title}」继续看。`,
      archive.dateRange ? `时间范围：${archive.dateRange}。` : '',
      `关键词：${archive.keywords.join('、')}。`,
      `复盘摘要：${archive.summary}`,
      '我想知道接下来最需要照顾的重点，以及今天可以先做哪一件小事。',
    ].filter(Boolean).join('\n');

    try {
      if (!await writeWorkspaceStorage(workspaceOwner.current, 'draft:home:input', JSON.stringify(prompt))) return;
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
    if (!entryContent.trim() || entrySaveRef.current) return;
    entrySaveRef.current = true;

    if (editingEntry) {
      if (!diaryEntries.some(entry => entry.id === editingEntry.id)) {
        setEntryNotice('这篇日记已不存在，修改没有另存为新日记。');
        closeEntryDialog();
        return;
      }
      setDiaryEntries(prev => updateDiaryEntry(prev, editingEntry.id, {
        content: editContent, mood: editMood, tags: parseDiaryTags(editTags),
      }, getTrustedNow().toISOString()));
      setEntryNotice('修改已保存，原日期保持不变；新建日记草稿也已保留。');
      closeEntryDialog();
      return;
    }

    const entry: DiaryEntry = {
      id: createRecordId('diary'),
      date: getAppDateKey(getTrustedNow()),
      mood: newMood,
      content: newContent.trim(),
      tags: parseDiaryTags(newTags),
    };

    setDiaryEntries(prev => [entry, ...prev]);
    setAppEvents((events) => recordAppEvent(events, 'diary_save', { mood: newMood, tags: entry.tags.length }));
    closeEntryDialog();
    clearFilters();
    setEntryNotice('日记已保存。');
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
    if (isReviewing || reviewRequestRef.current) return;
    if (isPremiumReviewRange && !plusActive) {
      openPlusForReview();
      return;
    }

    if (scopedDiaryEntries.length === 0) {
      setReviewFailed(false);
      setReviewResult(`${reviewWindow.label}还没有日记可复盘。先写一篇，塔罗少女才能看见这段时间真正发生了什么。`);
      setReviewResultMeta({
        rangeLabel: reviewWindow.label,
        startDate: reviewWindow.startDate,
        endDate: reviewWindow.endDate,
        entryCount: 0,
      });
      return;
    }

    const scopedEntryIds = scopedDiaryEntries.map((entry) => entry.id);
    const sourceSignature = getDiarySourceSignature(scopedDiaryEntries);
    const existingReview = reviewHistory.find((review) =>
      review.startDate === reviewWindow.startDate &&
      review.endDate === reviewWindow.endDate &&
      isDiaryReviewCurrent(review, scopedDiaryEntries)
    );

    if (existingReview) {
      setReviewFailed(false);
      setReviewResult(existingReview.content);
      setReviewResultMeta({
        rangeLabel: existingReview.rangeLabel || reviewWindow.label,
        startDate: existingReview.startDate || reviewWindow.startDate,
        endDate: existingReview.endDate || reviewWindow.endDate,
        entryCount: existingReview.entryCount || scopedDiaryEntries.length,
        entryIds: existingReview.entryIds,
        sourceSignature: existingReview.sourceSignature,
      });
      return;
    }

    reviewRequestRef.current = true;
    setReviewFailed(false);
    setIsReviewing(true);
    setReviewResult(null);
    setReviewResultMeta({
      rangeLabel: reviewWindow.label,
      startDate: reviewWindow.startDate,
      endDate: reviewWindow.endDate,
      entryCount: scopedDiaryEntries.length,
      entryIds: scopedEntryIds,
      sourceSignature,
    });

    try {
      const prompt = `
你是一位精通心理学与命理学的“命运复盘导师”。
请根据用户指定时间段内的日记记录（以及八字命理信息，如果有的话），进行深度的命运复盘。

【用户档案信息】：
${userAddressInstruction || '用户暂未设置偏好的称呼。'}
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
        const res = await apiFetch('/api/deepseek/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: DEEPSEEK_TEXT_MODEL,
            max_tokens: DEEPSEEK_MAX_TOKENS.diaryReview,
            messages: [
              { role: 'system', content: '你是一位精通心理学与命理学的命运复盘导师。' },
              { role: 'user', content: [DIARY_REVIEW_SYSTEM_PROMPT, userAddressInstruction, ACTIONABLE_MEMORY_RULES, prompt].filter(Boolean).join('\n\n') }
            ]
          })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error?.message || 'Review generation failed');
        aiText = data.choices?.[0]?.message?.content;
        if (typeof aiText !== 'string' || !cleanAiText(aiText)) throw new Error('Empty review response');
      } catch (err) {
        console.error("DeepSeek Error:", err);
        throw err;
      }

      const finalResult = cleanAiText(aiText);
      setReviewResult(finalResult);

      // Save to history (limit to 30)
      const newReview: ReviewEntry = {
        id: createRecordId('review'),
        date: getAppDateKey(getTrustedNow()),
        content: finalResult,
        rangeLabel: reviewWindow.label,
        startDate: reviewWindow.startDate,
        endDate: reviewWindow.endDate,
        entryCount: scopedDiaryEntries.length,
        entryIds: scopedEntryIds,
        sourceSignature,
        ...createGenerationTrace('diary_review', {
          model: DEEPSEEK_TEXT_MODEL,
          usedFallback: false,
        }),
      };
      setReviewHistory(prev => [newReview, ...prev].slice(0, 30));
      setAppEvents((events) => recordAppEvent(events, 'diary_review', { diaryCount: scopedDiaryEntries.length, range: reviewWindow.key }));

    } catch (error: any) {
      console.error("Review Error:", error);
      setReviewResult(SERVICE_FALLBACK.diaryReview);
      setReviewFailed(true);
    } finally {
      reviewRequestRef.current = false;
      setIsReviewing(false);
    }
  };

  return (
    <div className="rail-page rail-diary">
      <PageHeader title="日记" description="写一句今天的心情。" action={<button onClick={openNewEntry} className="rail-button"><Plus size={18} aria-hidden="true" />写日记</button>} />
      <div className="rail-page-content space-y-6">
        {entryNotice && <p role="status" className="rounded-xl border border-apple-border bg-apple-surface p-3 text-[14px] text-apple-text-muted">{entryNotice}</p>}
        <section className="rail-diary-intro relative flex items-center gap-3 overflow-hidden rounded-[28px] p-5 sm:gap-6 sm:p-8">
          <div className="rail-diary-intro-copy relative z-10 min-w-0 flex-1">
            <div className="rail-diary-eyebrow flex items-center gap-2 text-[13px] font-medium">
              <Sparkles size={15} aria-hidden="true" />
              <span>今天可以写</span>
            </div>
            <p className="rail-diary-question mt-3 text-[20px] leading-relaxed sm:text-[24px]">{todayPrompt}</p>
            <p className="rail-diary-stats mt-5 text-[13px] leading-relaxed">近 7 天写了 {thisWeekCount} 篇 · 最近心情：{latestMoodLabel}</p>
          </div>
          <div className="rail-diary-art w-24 shrink-0 sm:w-48 lg:w-56"><DiaryIllustration /></div>
        </section>

        <details className="rail-diary-tools border-y border-apple-border py-1">
          <summary className="min-h-12 cursor-pointer py-3 text-[15px] font-medium text-apple-text">回顾与复盘</summary>
          <div className="space-y-5 pb-4 pt-2">
        {diaryEntries.length >= 3 && diaryThemeTrends.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[15px] font-medium text-apple-text">
                  <Tags size={15} className="text-apple-gold" />
                  情绪关键词趋势
                </div>
                <div className="mt-0.5 text-[13px] leading-relaxed text-apple-text-muted">
                  近 30 天常出现的心情与话题
                </div>
              </div>
              <div className="shrink-0 rounded-full bg-apple-gold/12 px-2.5 py-1 text-[13px] font-medium text-apple-gold">
                {diaryEntries.length} 篇
              </div>
            </div>
            <div className="grid gap-2">
              {diaryThemeTrends.map((trend) => (
                <div key={trend.id} className="border-b border-apple-border py-3 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-[15px] font-semibold text-apple-text">{trend.label}</div>
                    <div className="shrink-0 text-[13px] font-medium text-apple-gold">{trend.entryCount} 次</div>
                  </div>
                  <div className="mt-1 text-[13px] leading-relaxed text-apple-text-muted">
                    {trend.moodSummary} · {trend.evidence || '继续写几篇，趋势会更清楚。'}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-4">
          <section className="col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <div className="text-[15px] font-medium text-apple-text">选择复盘范围</div>
                <div className="mt-0.5 text-[13px] text-apple-text-muted">
                  今日复盘免费 · 周期复盘 Plus 可用
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-apple-gold/12 px-2.5 py-1 text-[13px] font-medium text-apple-gold">
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
                    aria-pressed={active}
                    onClick={() => handleSelectReviewRange(range.key)}
                    className={clsx(
                      'relative rounded-full border px-2 py-2 text-[13px] font-medium transition-all',
                      active
                        ? 'border-apple-gold bg-apple-text text-apple-bg'
                        : locked
                          ? 'border-apple-border bg-apple-bg text-apple-text-muted hover:border-apple-gold/35 hover:text-apple-gold'
                          : 'border-apple-border bg-apple-bg text-apple-text-muted hover:border-apple-gold/35 hover:text-apple-text'
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
            <div className="mt-3 rounded-2xl bg-apple-bg px-3 py-2 text-[13px] leading-relaxed text-apple-text-muted">
              当前范围：{reviewRangeText} · {scopedDiaryEntries.length} 篇
            </div>
          </section>

          <button
            onClick={handleReview}
            disabled={isReviewing}
            aria-busy={isReviewing}
            className={clsx(
              'rail-button w-full',
              isPremiumReviewRange && !plusActive
                ? 'border border-apple-gold/30 bg-apple-surface text-apple-gold'
                : 'bg-apple-text text-apple-bg'
            )}
          >
            <div className="flex items-center justify-center">
              {isReviewing ? <Loader2 size={24} className="animate-spin" /> : isPremiumReviewRange && !plusActive ? <Lock size={24} /> : <BrainCircuit size={24} />}
            </div>
            <span className="font-medium text-[15px]">
              {isReviewing ? '复盘中...' : isPremiumReviewRange && !plusActive ? '开通 Plus' : `${reviewWindow.label}复盘`}
            </span>
          </button>

          <button
            onClick={() => setShowHistoryModal(true)}
            className="rail-button-secondary w-full"
          >
            <div className="flex items-center justify-center">
              <History size={24} />
            </div>
            <span className="font-medium text-[15px]">复盘记录</span>
          </button>
        </div>
          </div>
        </details>

        {/* Review Result */}
        <AnimatePresence>
          {reviewResult && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : 8, transition: exitTransition }}
              transition={enterTransition}
              className="overflow-hidden"
            >
              {reviewFailed ? <div role="status" className="rail-panel"><p className="rail-body">{reviewResult}</p><button onClick={handleReview} disabled={isReviewing} className="rail-button-secondary mt-3">重试复盘</button></div> : <DiaryReviewArchiveCard
                content={reviewResult}
                meta={reviewResultMeta}
                entries={getReviewEntries(reviewResultMeta || {}, diaryEntries)}
                onClose={() => setReviewResult(null)}
                onContinue={() => askTarotFromReview(reviewResult, reviewResultMeta, getReviewEntries(reviewResultMeta || {}, diaryEntries))}
              />}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Diary List */}
        <div className="space-y-4">
          <h2 className="rail-section-title flex items-center gap-2">
            <Calendar size={18} className="text-apple-text-muted" />
            过往记录
          </h2>
          {diaryEntries.length > 0 && <details className="rail-diary-filters border-b border-apple-border pb-3">
            <summary className="min-h-12 cursor-pointer py-3 text-[15px] text-apple-text-muted">搜索与筛选{hasFilters ? ` · 找到 ${filteredEntries.length} 篇` : ` · ${diaryEntries.length} 篇日记`}</summary>
            <div className="space-y-3 pt-2">
            <label htmlFor="diary-search" className="flex items-center gap-2 text-[15px] font-medium"><Search size={16} aria-hidden="true" />找一篇日记</label>
            <input id="diary-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索正文、日期或标签" className="rail-field" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="diary-mood-filter" className="mb-1 block text-[13px] text-apple-text-muted">心情</label>
                <select id="diary-mood-filter" value={moodFilter} onChange={event => setMoodFilter(event.target.value as DiaryEntry['mood'] | 'all')} className="rail-field">
                  <option value="all">全部心情</option>
                  {MOODS.map(mood => <option key={mood.value} value={mood.value}>{mood.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="diary-tag-filter" className="mb-1 block text-[13px] text-apple-text-muted">标签</label>
                <select id="diary-tag-filter" value={tagFilter} onChange={event => setTagFilter(event.target.value)} className="rail-field">
                  <option value="">全部标签</option>
                  {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-[13px] text-apple-text-muted">
              <span role="status">找到 {filteredEntries.length} 篇 · 共 {diaryEntries.length} 篇</span>
              {hasFilters && <button onClick={clearFilters} className="min-h-10 px-2 font-medium text-apple-accent">清空筛选</button>}
            </div>
            </div>
          </details>}

          {diaryEntries.length === 0 ? (
            <div className="rail-empty rail-diary-empty">
              <Book size={32} className="mx-auto text-apple-text-muted mb-3" />
              <p className="text-[15px] text-apple-text-muted">还没有记录过日记，开始写下第一篇吧</p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="rail-empty"><p className="text-[15px] text-apple-text-muted">没有符合当前条件的日记，试试其他关键词或清空筛选。</p></div>
          ) : (
            filteredEntries.slice(0, visibleCount).map(entry => {
              const moodObj = MOODS.find(m => m.value === entry.mood) || MOODS[2];
              return (
                <motion.div
                  key={entry.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={enterTransition}
                  className="rail-panel rail-diary-record relative group"
                >
                  <div className="absolute right-3 top-3 flex gap-1">
                  <button onClick={() => openEditEntry(entry)} aria-label={`编辑 ${entry.date} 的日记`} className="flex h-10 w-10 items-center justify-center rounded-full text-apple-text-muted hover:bg-apple-surface-hover hover:text-apple-text"><Pencil size={16} /></button>
                  <button
                    aria-label={`删除 ${entry.date} 的日记`}
                    onClick={() => handleDelete(entry.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-apple-text-muted hover:bg-apple-surface-hover hover:text-red-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                  </div>

                  <div className="flex items-center gap-3 mb-4 pr-20">
                    <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center border-2", moodObj.bg, moodObj.color, moodObj.border)}>
                      {moodObj.icon}
                    </div>
                    <div>
                      <div className="text-[15px] font-medium tabular-nums text-apple-text">{entry.date}</div>
                      <div className={clsx("text-[13px] font-medium mt-0.5", moodObj.color)}>{moodObj.label}</div>
                      {entry.updatedAt && <div className="mt-1 text-[12px] text-apple-text-muted">已编辑</div>}
                    </div>
                  </div>

                  <p className="rail-reader mb-4">
                    {entry.content}
                  </p>

                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {entry.tags.map((tag, idx) => (
                        <span key={idx} className="text-[13px] px-2.5 py-1 bg-apple-surface-hover text-apple-text-muted rounded-full">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
          {filteredEntries.length > visibleCount && <button className="rail-button-secondary w-full" onClick={() => setVisibleCount(count => count + 20)}>再显示 20 篇（还有 {filteredEntries.length - visibleCount} 篇）</button>}
        </div>
      </div>

      {/* Add Entry Modal */}
      <Portal>
        <AnimatePresence>
        {isAdding && (
          <div className="rail-diary-dialog-position fixed inset-0 z-[160] flex items-end justify-center overflow-y-auto overscroll-contain p-4 sm:items-center sm:p-6">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitTransition }}
              transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.fast }}
              className="rail-glass-backdrop absolute inset-0 bg-black/60"
              onClick={closeEntryDialog}
            />
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : 12, transition: exitTransition }}
              transition={enterTransition}
              ref={entryDialogRef}
              role="dialog" aria-modal="true" aria-labelledby="diary-entry-title" tabIndex={-1}
              className="rail-glass-dialog relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-[28px] border border-apple-border bg-apple-surface p-5 no-scrollbar touch-pan-y [-webkit-overflow-scrolling:touch] sm:p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 id="diary-entry-title" className="rail-section-title">{editingEntry ? '编辑日记' : '写日记'}</h2>
                <button aria-label={editingEntry ? '取消编辑日记' : '关闭写日记'} onClick={closeEntryDialog} className="p-2 rounded-full bg-apple-surface-hover text-apple-text-muted hover:bg-apple-surface-hover transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {editingEntry && <p className="text-[13px] leading-relaxed text-apple-text-muted">正在编辑 {editingEntry.date} 的记录。保存会更新这篇日记，原日期保持不变；取消会放弃本次修改。</p>}
                {/* Mood Selection */}
                <div>
                  <p id="diary-mood-label" className="mb-3 text-[15px] font-medium text-apple-text">{editingEntry ? '当时的心情如何？' : '今天的心情如何？'}</p>
                  <div className="flex justify-between gap-1" role="group" aria-labelledby="diary-mood-label">
                    {MOODS.map(mood => (
                      <button
                        key={mood.value}
                        aria-pressed={entryMood === mood.value}
                        onClick={() => editingEntry ? setEditMood(mood.value as DiaryEntry['mood']) : setNewMood(mood.value as DiaryEntry['mood'])}
                        className={clsx(
                          "flex min-w-0 flex-1 flex-col items-center gap-2 rounded-xl border border-transparent py-2 transition-colors",
                          entryMood === mood.value ? "border-apple-accent bg-apple-gold/10" : "hover:bg-apple-surface-hover"
                        )}
                      >
                        <div className={clsx("w-10 h-10 rounded-full flex items-center justify-center border sm:w-12 sm:h-12", mood.bg, mood.color, mood.border)}>
                          {mood.icon}
                        </div>
                        <span className={clsx("text-[13px] font-medium", entryMood === mood.value ? mood.color : "text-apple-text-muted")}>
                          {mood.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label htmlFor="diary-content" className="mb-2 block text-[15px] font-medium text-apple-text">发生了什么事？</label>
                  <textarea id="diary-content" required
                    aria-describedby="diary-content-hint"
                    value={entryContent}
                    onChange={(e) => editingEntry ? setEditContent(e.target.value) : setNewContent(e.target.value)}
                    placeholder={todayPrompt}
                    className="rail-field h-44 resize-y"
                  />
                  <p id="diary-content-hint" className="rail-muted mt-2">写下一件小事就好；填写内容后即可保存。</p>
                </div>

                {/* Tags */}
                <div>
                  <label htmlFor="diary-tags" className="mb-2 block text-[15px] font-medium text-apple-text">添加标签 <span className="rail-muted">（空格或逗号分隔）</span></label>
                  <input id="diary-tags"
                    type="text"
                    value={entryTags}
                    onChange={(e) => editingEntry ? setEditTags(e.target.value) : setNewTags(e.target.value)}
                    placeholder="例如：工作 恋爱 焦虑"
                    className="rail-field"
                  />
                </div>

                <button
                  onClick={handleSaveEntry}
                  disabled={!entryContent.trim()}
                  className="rail-button w-full"
                >
                  {editingEntry ? '保存修改' : '保存日记'}
                </button>
                {editingEntry && <button onClick={closeEntryDialog} className="rail-button-secondary w-full">取消编辑</button>}
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
          <div className="rail-diary-dialog-position fixed inset-0 z-[160] flex items-end justify-center overflow-y-auto overscroll-contain p-4 sm:items-center sm:p-6">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitTransition }}
              transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.fast }}
              className="rail-glass-backdrop absolute inset-0 bg-black/60"
              onClick={() => setShowHistoryModal(false)}
            />
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : 12, transition: exitTransition }}
              transition={enterTransition}
              ref={historyDialogRef}
              role="dialog" aria-modal="true" aria-labelledby="diary-history-title" tabIndex={-1}
              className="rail-glass-dialog w-full max-w-2xl bg-apple-surface border border-apple-border rounded-[28px] p-5 sm:p-6 relative z-10 max-h-[90dvh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6 shrink-0">
                <h2 id="diary-history-title" className="rail-section-title flex items-center gap-2">
                  <History size={20} className="text-apple-accent" />
                  复盘记录
                </h2>
                <button aria-label="关闭复盘记录" onClick={() => setShowHistoryModal(false)} className="p-2 rounded-full bg-apple-surface-hover text-apple-text-muted hover:bg-apple-surface-hover transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto no-scrollbar flex-1 space-y-4 pb-4">
                {reviewHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <History size={32} className="mx-auto text-apple-text-muted/20 mb-3" />
                    <p className="text-[15px] text-apple-text-muted">暂无复盘记录</p>
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
  const sourceCurrent = Boolean(meta && isDiaryReviewCurrent(meta, entries));

  return (
    <div
      className={clsx(
        'rail-diary-review relative overflow-hidden border border-apple-accent/24 bg-apple-surface',
        compact ? 'rounded-[20px] p-4' : 'rounded-[20px] p-5 sm:p-6',
      )}
    >

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
            <div className="flex items-center gap-2 text-[13px] font-semibold uppercase text-apple-gold">
              <FileText size={14} />
              复盘档案
            </div>
            <h3 className="mt-1 line-clamp-2 text-lg font-semibold text-apple-text">{archive.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-apple-text-muted">
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
              className="shrink-0 rounded-full bg-apple-text px-3 py-2 text-[13px] font-semibold text-apple-bg transition-transform active:scale-[0.98]"
            >
              继续问
            </button>
          )}
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-apple-text-muted">
          {meta?.entryCount === 0 ? '还没有来源记录，先写一篇日记。' : sourceCurrent ? '依据生成时的记录，与当前日记一致。' : meta?.sourceSignature ? '来源日记已修改或删除。这份复盘保留生成时的版本，可重新复盘查看最新记录。' : '这份复盘保留生成时的版本；旧记录未保存来源版本，请重新复盘查看最新记录。'}
        </p>

        <p className="mt-4 rounded-[20px] border border-apple-border bg-apple-bg p-3 text-[15px] leading-relaxed text-apple-text">
          {archive.summary}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {archive.keywords.map((keyword) => (
            <span
              key={keyword}
              className="inline-flex items-center gap-1 rounded-full border border-apple-gold/22 bg-apple-gold/10 px-2.5 py-1 text-[13px] font-medium text-apple-gold"
            >
              <Tags size={11} />
              {keyword}
            </span>
          ))}
        </div>

        {archive.timeline.length > 0 && (
          <div className="mt-4 rounded-[20px] border border-apple-border bg-apple-surface p-3">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-apple-text">
              <History size={14} className="text-apple-gold" />
              情绪时间线
            </div>
            <div className="space-y-2">
              {archive.timeline.map((item) => (
                <div key={item.id} className="grid grid-cols-[46px_minmax(0,1fr)] gap-2">
                  <div className="pt-0.5 text-[13px] font-medium text-apple-text-muted">{item.date}</div>
                  <div className="min-w-0 border-l border-apple-gold/24 pl-3">
                    <div className="text-[13px] font-semibold text-apple-text">{item.mood}</div>
                    <div className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-apple-text-muted">{item.content}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {archive.advice.length > 0 && (
          <div className="mt-3 grid gap-2">
            {archive.advice.map((item, index) => (
              <div key={`${item}-${index}`} className="rounded-[18px] bg-apple-surface-hover px-3 py-2 text-[13px] leading-relaxed text-apple-text-muted">
                <span className="mr-1 font-semibold text-apple-text">留意 {index + 1}</span>
                {item}
              </div>
            ))}
          </div>
        )}

        {!compact && (
          <details className="mt-4 rounded-[20px] border border-apple-border bg-apple-bg p-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-apple-text-muted">查看完整复盘</summary>
            <div className="rail-reader mt-4">
              {cleanReviewContent(content)}
            </div>
          </details>
        )}

        {onClose && onContinue && (
          <button
            onClick={onContinue}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-apple-text py-3 text-[15px] font-semibold text-apple-bg transition-transform active:scale-[0.99]"
          >
            <MessageCircle size={16} />
            带着这份档案继续问
          </button>
        )}
      </div>
    </div>
  );
}
