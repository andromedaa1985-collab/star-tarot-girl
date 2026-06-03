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

const MEMORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
  const { 
    userName, preferredAddress, bondLevel, setBondExp,
    diaryEntries, baziResult,
    tarotReadings, simulationHistory, profiles, activeProfileId,
    guardianMessages, setGuardianMessages,
    dailyLetter, setDailyLetter,
    dailyLetterDate, setDailyLetterDate,
    setAppEvents
  } = useAppContext();
  
  const [input, setInput, clearInputDraft] = usePersistentDraft('draft:guardian:input', '');
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);
  const [showLetter, setShowLetter] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const todayStr = new Date().toLocaleDateString('zh-CN');
  const hasLetterToday = dailyLetterDate === todayStr && dailyLetter;
  const bondTitle = LEVEL_TITLES[bondLevel - 1] || LEVEL_TITLES[0];
  const userAddress = normalizeUserAddress(preferredAddress) || normalizeUserAddress(userName) || '你';
  const userAddressInstruction = buildUserAddressInstruction(preferredAddress, userName);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0] || null;
  const recentReadings = [...tarotReadings]
    .filter((reading) => Date.now() - getTime(reading.date) <= MEMORY_WINDOW_MS)
    .sort((a, b) => getTime(b.date) - getTime(a.date));
  const recentDiaries = [...diaryEntries]
    .filter((entry) => Date.now() - getTime(entry.date) <= MEMORY_WINDOW_MS)
    .sort((a, b) => getTime(b.date) - getTime(a.date));
  const recentSimulation = [...simulationHistory]
    .filter((item) => Date.now() - getTime(item.date) <= MEMORY_WINDOW_MS)
    .sort((a, b) => getTime(b.date) - getTime(a.date))[0];
  const recentGuardianReplies = [...guardianMessages]
    .filter((message) => (
      message.role === 'ai' &&
      Date.now() - message.timestamp <= MEMORY_WINDOW_MS &&
      !message.text.includes('我是你的星轨守护灵')
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
      const greeting = `你好，${userAddress}。我是你的星轨守护灵。我能看见你的命理星盘，也能感知你的情绪起伏。无论发生什么，我都在这里。`;
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

      const prompt = `作为用户的【星轨守护灵】，请为ta写一封今天的【今日守护回访】。
【上下文信息】：
- 用户姓名：${userName}
- 用户希望被称呼：${userAddress}
- 羁绊等级：${bondTitle}
- 命理信息：${baziContext}
- 近期情绪：${diaryContext}

【要求】：
1. 先轻轻点出一条你记得的近况，再回应今天可以怎么照顾自己。
2. 必须结合ta的八字命理（如五行喜忌、性格）和最近的日记情绪来写。如果线索不足，就温柔地邀请ta留下一个具体问题。
3. 纯文本，不要使用任何Markdown格式。
4. 字数控制在120字左右，分2段，最后给一个低压力小动作。`;

      let aiText = "";
      try {
        const res = await apiFetch('/api/deepseek/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: DEEPSEEK_TEXT_MODEL,
            temperature: 0.7,
            max_tokens: DEEPSEEK_MAX_TOKENS.guardianLetter,
            messages: [
              { role: 'system', content: '你是用户的星轨守护灵。' },
              {
                role: 'user',
                content: [
                  GUARDIAN_LETTER_SYSTEM_PROMPT,
                  userAddressInstruction,
                  '这封来信必须像今日回访，而不是泛泛寄语。',
                  guardianContextLines.length
                    ? `星轨近期记得：\n${guardianContextLines.join('\n')}`
                    : '星轨近期还没有足够线索，请引导用户先留下牌迹或日记。',
                  ACTIONABLE_MEMORY_RULES,
                  prompt,
                ].join('\n\n'),
              }
            ]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        aiText = data.choices[0].message.content;
      } catch (err) {
        console.error("DeepSeek Error:", err);
        aiText = SERVICE_FALLBACK.guardianLetter;
      }

      const cleanedText = cleanAiText(aiText);
      setDailyLetter(cleanedText);
      setDailyLetterDate(todayStr);
      setShowLetter(true);
      setBondExp(prev => prev + 10); // Big bond boost for reading the letter
      setAppEvents((events) => recordAppEvent(events, 'guardian_letter'));

    } catch (error) {
      console.error("Letter Generation Error:", error);
      setDailyLetter(SERVICE_FALLBACK.guardianLetter);
      setDailyLetterDate(todayStr);
      setShowLetter(true);
    } finally {
      setIsGeneratingLetter(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

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

      const systemPrompt = `你是一个名为“星轨守护灵”的AI伴侣。你的核心目标是提供【基于命理的情绪价值】和【深度陪伴】。

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
        const res = await apiFetch('/api/deepseek/chat', {
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

    } catch (error) {
      console.error("Guardian Chat Error:", error);
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
      setIsTyping(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden text-apple-text">
      {/* Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <picture>
          {/* 横版图片 (图2) 放在这里的 srcSet 里 */}
          <source media="(min-aspect-ratio: 1/1)" srcSet="/image-262.png" />
          {/* 竖版图片 (图1) 放在这里的 src 里 */}
          <img src="/image-259.png" alt="Guardian Background" className="w-full h-full object-cover opacity-60 dark:opacity-40" referrerPolicy="no-referrer" />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-apple-bg/50 to-apple-bg"></div>
      </div>
      
      <div className="relative z-10 h-full overflow-y-auto overscroll-contain px-4 pb-[calc(var(--app-bottom-pad)+150px)] pt-7 no-scrollbar sm:px-6 sm:pt-9">
      {/* Header & Guardian Orb */}
      <div className="mx-auto flex w-full max-w-md flex-col items-center pb-6">
        <h1 className="font-serif text-2xl font-bold tracking-widest text-apple-accent mb-4 relative z-10 dark:text-[#6B8AFF]">星轨守护</h1>
        
        {/* The "Guardian" Orb */}
        <div className="relative mb-5 flex h-24 w-24 items-center justify-center">
          <motion.div 
            animate={{ scale: isTyping ? [1, 1.1, 1] : [1, 1.05, 1], opacity: 0.4 }}
            transition={{ duration: isTyping ? 1.5 : 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 bg-apple-gold rounded-full blur-2xl dark:bg-[#6B8AFF]"
          />
          <motion.div 
            animate={{ scale: isTyping ? [1, 1.05, 1] : [1, 1.02, 1] }}
            transition={{ duration: isTyping ? 1.5 : 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative w-16 h-16 bg-gradient-to-tr from-apple-gold to-[#dcb66f] rounded-full shadow-[0_18px_38px_rgba(185,123,40,0.26)] flex items-center justify-center overflow-hidden border border-apple-border dark:from-[#6B8AFF] dark:to-[#8BA4FF] dark:shadow-[0_0_30px_rgba(107,138,255,0.6)]"
          >
            <Moon size={28} className="text-white/90 drop-shadow-md" fill="currentColor" />
          </motion.div>
        </div>

        {/* Daily Letter Trigger */}
        <div className="w-full max-w-md relative z-10">
          {!hasLetterToday ? (
            <button 
              onClick={generateDailyLetter}
              disabled={isGeneratingLetter}
              className="w-full bg-apple-surface backdrop-blur-xl p-4 rounded-2xl border border-apple-border hover:bg-apple-surface-hover transition-all flex items-center justify-between shadow-sm group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-apple-accent/10 flex items-center justify-center text-apple-accent">
                  {isGeneratingLetter ? <Loader2 size={20} className="animate-spin" /> : <Mail size={20} />}
                </div>
                <div className="text-left">
                  <div className="font-medium text-apple-text">今日守护回访</div>
                  <div className="text-xs text-apple-text-muted">
                    {guardianContextLines.length ? `回看 ${guardianContextLines.length} 条档案线索` : '先从一条近况线索开始'}
                  </div>
                </div>
              </div>
              <Sparkles size={16} className="text-apple-accent opacity-50 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : (
            <button 
              onClick={() => setShowLetter(true)}
              className="w-full bg-gradient-to-r from-apple-gold to-[#dcb66f] p-4 rounded-2xl text-[#17130f] transition-all flex items-center justify-between shadow-lg shadow-[rgba(185,123,40,0.18)] dark:from-[#6B8AFF] dark:to-[#8BA4FF] dark:text-white dark:shadow-[#6B8AFF]/20"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Mail size={20} />
                </div>
                <div className="text-left">
                  <div className="font-medium">查看今日回访</div>
                  <div className="text-xs text-white/75">已生成，随时可以重温</div>
                </div>
              </div>
            </button>
          )}
          <div className="mt-3 rounded-2xl border border-apple-border bg-apple-surface/90 p-4 text-left shadow-sm backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-apple-text">
                <History size={16} className="text-apple-accent" />
                今日引用线索
              </div>
              <div className="flex items-center gap-1 rounded-full bg-apple-accent/10 px-2.5 py-1 text-[11px] font-medium text-apple-accent">
                <ScrollText size={12} />
                档案 + 近 7 天
              </div>
            </div>
            {visibleContextLines.length ? (
              <div className="space-y-2">
                {visibleContextLines.map((line) => (
                  <div key={line} className="rounded-xl bg-apple-bg/55 px-3 py-2 text-xs leading-relaxed text-apple-text-muted">
                    {line}
                  </div>
                ))}
                {hiddenContextCount > 0 && (
                  <div className="text-xs font-medium text-apple-accent">还有 {hiddenContextCount} 条线索会放进回访里</div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-apple-bg/55 px-3 py-2 text-xs leading-relaxed text-apple-text-muted">
                还没有可引用的近况。写一篇日记、抽一次牌，或做一次沙盘后，守护会更像是在接着你的故事说话。
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="mx-auto w-full max-w-md space-y-6 pb-6">
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
                "max-w-[80%] rounded-3xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm",
                msg.role === 'user' 
                  ? "bg-apple-gold text-[#17130f] rounded-tr-sm dark:bg-[#6B8AFF] dark:text-white" 
                  : "bg-apple-surface backdrop-blur-xl border border-apple-border rounded-tl-sm text-apple-text"
              )}>
                {msg.text}
              </div>
            </motion.div>
          ))}
          
          {isTyping && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-apple-surface backdrop-blur-xl border border-apple-border rounded-3xl rounded-tl-sm px-5 py-4 flex gap-1.5 shadow-sm">
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
      <div className="fixed left-0 w-full px-4 pb-4 bg-gradient-to-t from-apple-bg via-apple-bg/95 to-transparent pt-10 z-20 dark:from-[#05050A] dark:via-[#05050A]" style={{ bottom: 'calc(var(--app-bottom-pad) + 76px)' }}>
        <div className="max-w-md mx-auto relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="向守护灵倾诉..."
            className="w-full bg-apple-surface backdrop-blur-xl border border-apple-border rounded-full pl-6 pr-14 py-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-apple-accent/35 shadow-[0_12px_34px_rgba(117,82,42,0.13)] text-apple-text placeholder:text-apple-text-muted/55 dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            aria-label="发送给守护"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-apple-gold text-[#17130f] rounded-full flex items-center justify-center shadow-[0_12px_24px_rgba(185,123,40,0.20)] disabled:opacity-50 disabled:shadow-none transition-all hover:bg-[#c88a34] dark:bg-[#6B8AFF] dark:text-white dark:shadow-[0_0_15px_rgba(107,138,255,0.4)] dark:hover:bg-[#5A75E6]"
          >
            <Send size={18} className="ml-0.5" />
          </button>
        </div>
      </div>

      {/* Daily Letter Modal */}
      <AnimatePresence>
        {showLetter && dailyLetter && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-3 pb-[calc(12px+var(--app-safe-bottom))] pt-[calc(12px+var(--app-safe-top))] sm:items-center sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowLetter(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative z-10 flex w-full max-w-md flex-col rounded-[30px] border border-apple-border bg-apple-surface p-5 shadow-2xl backdrop-blur-xl sm:p-7"
              style={{
                height: 'min(82svh, 680px)',
                maxHeight: 'calc(100svh - var(--app-safe-top) - var(--app-safe-bottom) - 24px)',
              }}
            >
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-apple-accent/10 to-transparent rounded-t-3xl pointer-events-none shrink-0"></div>
              
              <div className="flex justify-center mb-4 relative z-10 shrink-0">
                <div className="w-12 h-12 rounded-full bg-apple-accent/10 flex items-center justify-center">
                  <Moon size={24} className="text-apple-accent" />
                </div>
              </div>
              
              <h3 className="font-serif font-bold text-xl text-center text-apple-text mb-4 tracking-widest relative z-10 shrink-0">
                今日守护回访
              </h3>
              
              <div className="relative z-10 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-apple-border/70 bg-apple-bg/48 p-4 pr-3 font-serif text-[15px] leading-8 text-apple-text-muted whitespace-pre-wrap custom-scrollbar">
                {dailyLetter}
              </div>
              
              <div className="mt-6 flex justify-center relative z-10 shrink-0 pt-2">
                <button 
                  onClick={() => setShowLetter(false)}
                  className="px-8 py-3 bg-apple-gold text-[#17130f] rounded-full font-bold shadow-[0_12px_24px_rgba(185,123,40,0.20)] hover:bg-[#c88a34] transition-colors dark:bg-[#6B8AFF] dark:text-white dark:shadow-[0_4px_15px_rgba(107,138,255,0.3)] dark:hover:bg-[#5A75E6]"
                >
                  收下回访
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
