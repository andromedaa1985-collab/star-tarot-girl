import { aiFetch } from '../lib/aiClient';
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Send, Sparkles, Mail, Loader2, History, ScrollText } from 'lucide-react';
import { useAppContext, LEVEL_TITLES } from '../store';
import clsx from 'clsx';
import { recordAppEvent } from '../lib/engagement';
import { usePersistentDraft } from '../lib/usePersistentDraft';
import {
  ACTIONABLE_MEMORY_RULES,
  GUARDIAN_CHAT_SYSTEM_PROMPT,
  GUARDIAN_LETTER_SYSTEM_PROMPT,
  buildUserAddressInstruction,
  cleanAiText,
  normalizeUserAddress,
} from '../lib/aiPrompting';
import { DEEPSEEK_MAX_TOKENS, DEEPSEEK_TEXT_MODEL } from '../lib/aiModels';
import { SERVICE_FALLBACK } from '../lib/serviceFeedback';
import { createGenerationTrace, createRecordId } from '../lib/generationTrace';
import { apiFetch } from '../lib/apiClient';
import { AI_CLIENT_TIMEOUT_MS } from '../lib/aiRequestBudget';
import PageHeader from '../components/ui/PageHeader';
import { useDialogFocus } from '../lib/useDialogFocus';
import { shouldSubmitOnEnter } from '../lib/composerKeyboard';
import { getAppDateKey, getTrustedNow, getTrustedTimestamp, useTrustedTime } from '../lib/trustedTime';
import { appendGuardianStarter, getGuardianLetterState, shouldRewardGuardianLetter } from '../lib/guardianLetter';
import { getBaziResultStatus } from '../lib/baziProfiles';
import { getStoredAccountSession, isAccountTransitioning, isCurrentAccountSession } from '../lib/accountClient';

const MEMORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const GUARDIAN_STARTERS = [
  { label: '整理烦心事', text: '我现在最烦心的是：' },
  { label: '找一个小行动', text: '今天我想先照顾自己一件小事：' },
  { label: '记住好瞬间', text: '今天有一个让我觉得还不错的瞬间：' },
];

const getTime = (value?: string | number) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
};

const shortText = (text = '', max = 42) => {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
};

const moodLabels: Record<string, string> = {
  great: '很亮的心情',
  good: '还不错的状态',
  neutral: '平静但有点悬着',
  bad: '有点低落',
  awful: '很辛苦',
};

export default function Guardian() {
  useTrustedTime();
  const {
    userName, preferredAddress, bondLevel, setBondExp,
    diaryEntries, baziResult: storedBaziResult,
    tarotReadings, simulationHistory, profiles, activeProfileId,
    guardianMessages, setGuardianMessages,
    dailyLetter, setDailyLetter,
    dailyLetterDate, setDailyLetterDate,
    setAppEvents, settings, setSettings, awardConversationCard
  } = useAppContext();

  const [input, setInput, clearInputDraft] = usePersistentDraft('draft:guardian:input', '');
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);
  const [showLetter, setShowLetter] = useState(false);
  const [, setDateKey] = useState(() => getAppDateKey(getTrustedNow()));
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatRequestRef = useRef(false);
  const letterRequestRef = useRef(false);
  const letterAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const letterDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(letterDialogRef, showLetter, () => setShowLetter(false));
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; letterAbortRef.current?.abort(); };
  }, []);
  useEffect(() => {
    const updateDate = () => setDateKey(getAppDateKey(getTrustedNow()));
    const interval = setInterval(updateDate, 60_000);
    window.addEventListener('focus', updateDate);
    document.addEventListener('visibilitychange', updateDate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', updateDate);
      document.removeEventListener('visibilitychange', updateDate);
    };
  }, []);

  const todayStr = getAppDateKey(getTrustedNow());
  const letterState = getGuardianLetterState(todayStr, dailyLetter, dailyLetterDate, settings.guardianLetterStatus);
  const hasLetterToday = letterState.completed;
  const bondTitle = LEVEL_TITLES[bondLevel - 1] || LEVEL_TITLES[0];
  const userAddress = normalizeUserAddress(preferredAddress) || normalizeUserAddress(userName) || '你';
  const userAddressInstruction = buildUserAddressInstruction(preferredAddress, userName);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0] || null;
  const baziResult = getBaziResultStatus(storedBaziResult, activeProfile) === 'current' ? storedBaziResult : null;
  const recentReadings = [...tarotReadings]
    .filter((reading) => getTrustedTimestamp() - getTime(reading.date) <= MEMORY_WINDOW_MS)
    .sort((a, b) => getTime(b.date) - getTime(a.date));
  const recentDiaries = [...diaryEntries]
    .filter((entry) => getTrustedTimestamp() - getTime(entry.date) <= MEMORY_WINDOW_MS)
    .sort((a, b) => getTime(b.date) - getTime(a.date));
  const recentSimulation = [...simulationHistory]
    .filter((item) => getTrustedTimestamp() - getTime(item.date) <= MEMORY_WINDOW_MS)
    .sort((a, b) => getTime(b.date) - getTime(a.date))[0];
  const recentGuardianReplies = [...guardianMessages]
    .filter((message) => (
      message.role === 'ai' &&
      getTrustedTimestamp() - message.timestamp <= MEMORY_WINDOW_MS &&
      !message.text.includes('我是你的星轨守护灵') && !message.text.includes('我是你的少女守护灵')
    ))
    .sort((a, b) => b.timestamp - a.timestamp);
  const guardianContextLines = [
    activeProfile ? `当前档案：${activeProfile.name}，出生地 ${activeProfile.birthLocation || '未填写'}，现居 ${activeProfile.currentLocation || '未填写'}。` : '',
    recentReadings[0] ? `最近牌迹：问过「${shortText(recentReadings[0].question, 36)}」，牌面「${shortText(recentReadings[0].cards, 30)}」。` : '',
    recentDiaries[0] ? `最近日记：${moodLabels[recentDiaries[0].mood] || recentDiaries[0].mood}，「${shortText(recentDiaries[0].content, 46)}」。` : '',
    recentSimulation ? `最近沙盘：在「${shortText(recentSimulation.choiceA, 18)}」和「${shortText(recentSimulation.choiceB, 18)}」之间权衡。` : '',
    recentGuardianReplies[0] ? `上次守护回应：${shortText(recentGuardianReplies[0].text, 54)}` : '',
  ].filter(Boolean);
  const visibleContextLines = guardianContextLines.slice(0, 3);
  const hiddenContextCount = Math.max(0, guardianContextLines.length - visibleContextLines.length);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [guardianMessages, isTyping]);

  // Initial greeting if empty
  useEffect(() => {
    if (guardianMessages.length === 0) {
      const greeting = `你好，${userAddress}。我是你的少女守护灵，会参考你留下的日记、牌迹和档案，陪你把近况慢慢说清楚。也可以先从今天的一件小事开始。`;
      setGuardianMessages([{
        id: createRecordId('guardian'),
        role: 'ai',
        text: greeting,
        timestamp: Date.now(),
        ...createGenerationTrace('guardian_chat', {
          model: 'system',
          usedFallback: false,
        }),
      }]);
    }
  }, []);

  const generateDailyLetter = async () => {
    if (letterRequestRef.current || isGeneratingLetter) return;
    const requestDate = getAppDateKey(getTrustedNow());
    const previousState = getGuardianLetterState(requestDate, dailyLetter, dailyLetterDate, settings.guardianLetterStatus);
    if (!previousState.canGenerate) { setShowLetter(true); return; }
    letterRequestRef.current = true;
    const controller = new AbortController();
    letterAbortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), AI_CLIENT_TIMEOUT_MS);
    setIsGeneratingLetter(true);
    try {
      const recentDiary = recentDiaries[0] || null;
      let diaryContext = "用户昨天没有写日记。";
      if (recentDiary) {
        diaryContext = `用户最近的一篇日记（${recentDiary.date}）：心情是【${recentDiary.mood}】，内容是“${recentDiary.content}”。`;
      }

      let baziContext = "用户暂未测算八字。";
      if (baziResult) {
        baziContext = `用户的八字格局是【${baziResult.pattern.name}】，五行喜用神是【${baziResult.wuxing.favorable.join('、')}】，性格特质是【${baziResult.personality}】。`;
      }

      const prompt = `作为用户的【少女守护灵】，请为ta写一封今天的【今日守护回访】。
【上下文信息】：
- 用户姓名：${userName}
- 用户希望被称呼：${userAddress}
- 羁绊等级：${bondTitle}
- 命理信息：${baziContext}
- 近期情绪：${diaryContext}

【要求】：
1. 先轻轻点出一条你记得的近况，再回应今天可以怎么照顾自己。
2. 只引用已提供的命理和日记线索。缺少排盘或日记时，不要编造五行、性格或具体经历；可以邀请ta留下一个具体问题。
3. 纯文本，不要使用任何Markdown格式。
4. 字数控制在120字左右，分2段，最后给一个低压力小动作。`;

      let aiText = "";
      let usedFallback = false;
      try {
        const res = await aiFetch('guardian', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: DEEPSEEK_TEXT_MODEL,
            temperature: 0.7,
            max_tokens: DEEPSEEK_MAX_TOKENS.guardianLetter,
            messages: [
              { role: 'system', content: '你是用户的少女守护灵。' },
              {
                role: 'user',
                content: [
                  GUARDIAN_LETTER_SYSTEM_PROMPT,
                  userAddressInstruction,
                  '这封来信必须像今日回访，而不是泛泛寄语。',
                  guardianContextLines.length
                    ? `塔罗少女近期记得：\n${guardianContextLines.join('\n')}`
                    : '塔罗少女近期还没有足够线索，请引导用户先留下牌迹或日记。',
                  ACTIONABLE_MEMORY_RULES,
                  prompt,
                ].join('\n\n'),
              }
            ]
          })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error?.message || 'Letter generation failed');
        aiText = data.choices?.[0]?.message?.content;
        if (typeof aiText !== 'string' || !aiText.trim()) throw new Error('Empty letter response');
        if (!cleanAiText(aiText)) throw new Error('Empty normalized letter response');
      } catch (err) {
        console.error("DeepSeek Error:", err);
        aiText = SERVICE_FALLBACK.guardianLetter;
        usedFallback = true;
      }

      if (!mountedRef.current) return;
      const cleanedText = cleanAiText(aiText);
      setDailyLetter(cleanedText);
      setDailyLetterDate(requestDate);
      setSettings(prev => ({ ...prev, guardianLetterStatus: { date: requestDate, usedFallback, generatedAt: getTrustedNow().toISOString() } }));
      setShowLetter(true);
      if (shouldRewardGuardianLetter(previousState, usedFallback)) {
        setBondExp(prev => prev + 10);
        setAppEvents((events) => recordAppEvent(events, 'guardian_letter'));
      }

    } catch (error) {
      if (!mountedRef.current) return;
      console.error("Letter Generation Error:", error);
      setDailyLetter(SERVICE_FALLBACK.guardianLetter);
      setDailyLetterDate(requestDate);
      setSettings(prev => ({ ...prev, guardianLetterStatus: { date: requestDate, usedFallback: true, generatedAt: getTrustedNow().toISOString() } }));
      setShowLetter(true);
    } finally {
      clearTimeout(timeout);
      letterAbortRef.current = null;
      letterRequestRef.current = false;
      if (mountedRef.current) setIsGeneratingLetter(false);
    }
  };

  const handleSend = async () => {
    if (isTyping || chatRequestRef.current || !input.trim()) return;

    chatRequestRef.current = true;
    const accountSession = getStoredAccountSession();
    const userText = input.trim();
    const newUserMsg = {
      id: createRecordId('guardian'),
      role: 'user' as const,
      text: userText,
      timestamp: Date.now()
    };

    setGuardianMessages(prev => [...prev, newUserMsg]);
    clearInputDraft('');
    setIsTyping(true);
    setBondExp(prev => prev + 2);
    setAppEvents((events) => recordAppEvent(events, 'guardian_chat'));

    try {
      let usedFallbackChat = false;
      let baziContext = "用户暂未测算八字。";
      if (baziResult) {
        baziContext = `用户的八字格局是【${baziResult.pattern.name}】，五行喜用神是【${baziResult.wuxing.favorable.join('、')}】，性格特质是【${baziResult.personality}】。`;
      }

      const systemPrompt = `你是一个名为“少女守护灵”的AI伴侣。你的核心目标是提供【基于命理的情绪价值】和【深度陪伴】。

【当前用户状态】：
- 姓名：${userName}
- 希望被称呼：${userAddress}
- 你们的羁绊等级：${bondLevel}级 (${bondTitle})
- 用户的命理特征：${baziContext}

【你的行为准则】：
1. 极度共情：先接纳用户的情绪，再说理。
2. 命理视角：当用户遇到挫折时，用ta的八字特征来安慰ta（例如：“你是属水的，心思细腻是你的天赋，但也容易内耗，没关系的…”）。
3. 语气神圣、温柔、真诚，像一个全知且包容的守护神。
4. 绝对不要使用Markdown格式，使用纯文本。
5. 每次回复控制在100-200字左右。
6. 绝对不要暴露你是AI，或者提到“根据提供的数据”。`;

      let aiText = "";
      try {
        const res = await aiFetch('guardian', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: DEEPSEEK_TEXT_MODEL,
            temperature: 0.7,
            max_tokens: DEEPSEEK_MAX_TOKENS.guardianChat,
            messages: [
              {
                role: 'system',
                content: [
                  GUARDIAN_CHAT_SYSTEM_PROMPT,
                  userAddressInstruction,
                  systemPrompt,
                  guardianContextLines.length
                    ? `近期线索：\n${guardianContextLines.join('\n')}`
                    : '近期线索不足：请先引导用户留下牌迹、日记或一个具体问题。',
                ].join('\n\n'),
              },
              ...guardianMessages.slice(-10).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
              { role: 'user', content: userText }
            ]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        aiText = data.choices[0].message.content;
      } catch (err) {
        console.error("DeepSeek Error:", err);
        aiText = SERVICE_FALLBACK.guardianChat;
        usedFallbackChat = true;
      }

      const cleanedText = cleanAiText(aiText);

      if (!mountedRef.current || !isCurrentAccountSession(accountSession) || isAccountTransitioning()) return;

      setGuardianMessages(prev => [...prev, {
        id: createRecordId('guardian'),
        role: 'ai',
        text: cleanedText,
        timestamp: Date.now(),
        ...createGenerationTrace('guardian_chat', {
          model: DEEPSEEK_TEXT_MODEL,
          usedFallback: usedFallbackChat,
        }),
      }]);

      awardConversationCard({
        turnId: newUserMsg.id, channel: 'guardian', text: cleanedText,
        usedFallback: usedFallbackChat, ownerId: accountSession?.user.id || null,
      });

    } catch (error) {
      console.error("Guardian Chat Error:", error);
      if (!mountedRef.current || !isCurrentAccountSession(accountSession) || isAccountTransitioning()) return;
      setGuardianMessages(prev => [...prev, {
        id: createRecordId('guardian'),
        role: 'ai',
        text: SERVICE_FALLBACK.guardianChat,
        timestamp: Date.now(),
        ...createGenerationTrace('guardian_chat', {
          model: DEEPSEEK_TEXT_MODEL,
          usedFallback: true,
        }),
      }]);
    } finally {
      chatRequestRef.current = false;
      setIsTyping(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden text-apple-text">
      <div className="rail-page pb-[calc(180px+var(--rail-nav-height)+var(--app-safe-bottom))]">
        <PageHeader eyebrow="陪伴与回访" title="少女守护" description="从你的近况里找一点线索，也留一个可以安心说话的地方。" />
        <div className="rail-page-content pb-8">
        {/* Daily Letter Trigger */}
        <div className="grid gap-4 md:grid-cols-2">
          {!hasLetterToday ? (
            <button
              onClick={generateDailyLetter}
              disabled={isGeneratingLetter}
              aria-busy={isGeneratingLetter}
              className="rail-panel w-full flex items-center justify-between gap-3 text-left hover:bg-apple-surface-hover group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-apple-accent/10 flex items-center justify-center text-apple-accent">
                  {isGeneratingLetter ? <Loader2 size={20} className="animate-spin" /> : <Mail size={20} />}
                </div>
                <div className="text-left">
                  <div className="font-medium text-apple-text">{letterState.usedFallback ? '重试今日回访' : '今日守护回访'}</div>
                  <div className="text-[13px] text-apple-text-muted">
                    {letterState.usedFallback ? '上次为本地兜底，尚未计为完成' : guardianContextLines.length ? `回看 ${guardianContextLines.length} 条档案线索` : '先从一条近况线索开始'}
                  </div>
                </div>
              </div>
              <Sparkles size={16} className="text-apple-accent opacity-50 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : (
            <button
              onClick={generateDailyLetter}
              className="rail-panel w-full flex items-center justify-between gap-3 text-left hover:bg-apple-surface-hover"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-apple-accent/10 text-apple-accent flex items-center justify-center">
                  <Mail size={20} />
                </div>
                <div className="text-left">
                  <div className="font-medium">查看今日回访</div>
                  <div className="rail-muted">已生成，随时可以重温</div>
                </div>
              </div>
            </button>
          )}
          <div className="rail-panel text-left">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-apple-text">
                <History size={16} className="text-apple-accent" />
                今日引用线索
              </div>
              <div className="flex items-center gap-1 rounded-full bg-apple-accent/10 px-2.5 py-1 text-[13px] font-medium text-apple-accent">
                <ScrollText size={12} />
                档案 + 近 7 天
              </div>
            </div>
            {visibleContextLines.length ? (
              <div className="space-y-2">
                {visibleContextLines.map((line) => (
                  <div key={line} className="rounded-xl bg-apple-bg px-3 py-2 text-[13px] leading-relaxed text-apple-text-muted">
                    {line}
                  </div>
                ))}
                {hiddenContextCount > 0 && (
                  <div className="text-[13px] font-medium text-apple-accent">还有 {hiddenContextCount} 条线索会放进回访里</div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-apple-bg px-3 py-2 text-[13px] leading-relaxed text-apple-text-muted">
                还没有可引用的近况。写一篇日记、抽一次牌，或做一次沙盘后，守护会更像是在接着你的故事说话。
              </div>
            )}
          </div>
        </div>
        {letterState.usedFallback && <button onClick={() => setShowLetter(true)} className="rail-button-secondary mt-3">查看已保存的兜底回访</button>}
        <section className="mt-4 rounded-[20px] border border-apple-border bg-apple-surface p-4" aria-labelledby="guardian-starters-title">
          <h2 id="guardian-starters-title" className="text-[15px] font-semibold">不知道从哪句开始？</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-apple-text-muted">选一句放进输入框。有内容时会追加在末尾，你可以补充后再发送。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {GUARDIAN_STARTERS.map(starter => <button key={starter.label} className="rail-button-secondary px-3 text-[13px]" onClick={() => { setInput(current => appendGuardianStarter(current, starter.text)); composerRef.current?.focus(); }}>{starter.label}</button>)}
          </div>
        </section>
      </div>

      {/* Chat Area */}
      <div className="rail-page-content space-y-6 pb-6" role="log" aria-label="与守护的对话" aria-live="polite">
          {guardianMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx(
                "flex w-full",
                msg.role === 'user' ? "justify-end" : "justify-start"
              )}
            >
              <div className={clsx(
                "max-w-[88%] rounded-[20px] px-5 py-4 text-base leading-7 whitespace-pre-wrap break-words sm:max-w-[76%]",
                msg.role === 'user'
                  ? "bg-apple-text text-apple-bg rounded-tr-sm"
                  : "bg-apple-surface border border-apple-border rounded-tl-sm text-apple-text"
              )}>
                {msg.text}
              </div>
            </motion.div>
          ))}

          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="flex justify-start" role="status" aria-label="守护正在回复"
            >
              <div className="bg-apple-surface border border-apple-border rounded-[20px] rounded-tl-sm px-5 py-4 flex gap-1.5">
                <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-2 h-2 bg-apple-accent/50 rounded-full" />
                <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-2 h-2 bg-apple-accent/50 rounded-full" />
                <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-2 h-2 bg-apple-accent/50 rounded-full" />
              </div>
            </motion.div>
          )}
          <div ref={chatEndRef} />
      </div>
      </div>

      {/* Input Area */}
      <div className="absolute inset-x-0 z-20 border-t border-apple-border bg-apple-bg px-5 py-4 sm:px-10" style={{ bottom: 'calc(var(--rail-nav-height) + var(--app-safe-bottom))' }}>
        <div className="mx-auto max-w-[960px] relative">
          <textarea
            ref={composerRef}
            aria-label="向守护倾诉"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.shiftKey) return;
              if (!shouldSubmitOnEnter(e.nativeEvent)) return;
              e.preventDefault();
              void handleSend();
            }}
            placeholder="向守护灵倾诉..."
            className="rail-field min-h-20 resize-y pr-16"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            aria-label="发送给守护"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-xl bg-apple-text text-apple-bg disabled:opacity-50 hover:opacity-85"
          >
            <Send size={18} className="ml-0.5" />
          </button>
        </div>
        <p className="mx-auto mt-1 max-w-[960px] text-[12px] text-apple-text-muted">Enter 发送 · Shift + Enter 换行</p>
      </div>

      {/* Daily Letter Modal */}
      <AnimatePresence>
        {showLetter && dailyLetter && (
          <div className="fixed inset-0 z-[160] flex items-end justify-center p-3 pb-[calc(12px+var(--app-safe-bottom))] pt-[calc(12px+var(--app-safe-top))] sm:items-center sm:p-6">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => setShowLetter(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              ref={letterDialogRef}
              role="dialog" aria-modal="true" aria-labelledby="guardian-letter-title" tabIndex={-1}
              className="relative z-10 flex w-full max-w-2xl flex-col rounded-[20px] border border-apple-border bg-apple-surface p-5 sm:p-7"
              style={{
                height: 'min(82svh, 680px)',
                maxHeight: 'calc(100svh - var(--app-safe-top) - var(--app-safe-bottom) - 24px)',
              }}
            >

              <div className="flex justify-center mb-4 relative z-10 shrink-0">
                <div className="w-12 h-12 rounded-full bg-apple-accent/10 flex items-center justify-center">
                  <Moon size={24} className="text-apple-accent" />
                </div>
              </div>

              <h2 id="guardian-letter-title" className="font-serif text-2xl text-center text-apple-text mb-5 relative z-10 shrink-0">
                今日守护回访
              </h2>
              {letterState.usedFallback && <p role="status" className="relative z-10 mb-3 text-[13px] leading-relaxed text-apple-text-muted">这封是服务失败时的本地兜底，未计为今日完成，也未增加羁绊经验。可以保留阅读，或重试生成。</p>}

              <div className="relative z-10 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-apple-border/70 bg-apple-bg p-4 pr-3 text-base leading-8 text-apple-text whitespace-pre-wrap custom-scrollbar">
                {dailyLetter}
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-3 relative z-10 shrink-0 pt-2">
                {letterState.usedFallback && <button onClick={generateDailyLetter} disabled={isGeneratingLetter} aria-busy={isGeneratingLetter} className="rail-button">{isGeneratingLetter ? '正在重试…' : '重试今日回访'}</button>}
                <button
                  onClick={() => setShowLetter(false)}
                  className="rail-button px-10"
                >
                  {letterState.usedFallback ? '先收下这封' : '收下回访'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
