import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Book, Plus, Calendar, Sparkles, X, Smile, Meh, Frown, CloudRain, Sun, ChevronRight, Loader2, BrainCircuit, History } from 'lucide-react';
import { useAppContext, DiaryEntry, ReviewEntry } from '../store';
import clsx from 'clsx';
import { recordAppEvent } from '../lib/engagement';
import { usePersistentDraft } from '../lib/usePersistentDraft';

const MOODS = [
  { value: 'great', icon: <Sun size={24} />, label: '极佳', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  { value: 'good', icon: <Smile size={24} />, label: '不错', color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  { value: 'neutral', icon: <Meh size={24} />, label: '平淡', color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  { value: 'bad', icon: <Frown size={24} />, label: '糟糕', color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30' },
  { value: 'awful', icon: <CloudRain size={24} />, label: '极差', color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
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

export default function Diary() {
  const { diaryEntries, setDiaryEntries, baziResult, profiles, activeProfileId, reviewHistory, setReviewHistory, setAppEvents } = useAppContext();
  const [isAdding, setIsAdding] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // New entry state
  const [newContent, setNewContent, clearContentDraft] = usePersistentDraft('draft:diary:content', '');
  const [newMood, setNewMood, clearMoodDraft] = usePersistentDraft<DiaryEntry['mood']>('draft:diary:mood', 'neutral');
  const [newTags, setNewTags, clearTagsDraft] = usePersistentDraft('draft:diary:tags', '');

  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const todayPrompt = DAILY_DIARY_PROMPTS[Math.floor(Date.now() / 86400000) % DAILY_DIARY_PROMPTS.length];
  const thisWeekCount = diaryEntries.filter(entry => Date.now() - new Date(entry.date).getTime() < 7 * 86400000).length;
  const latestMood = diaryEntries[0]?.mood;
  const latestMoodLabel = MOODS.find(mood => mood.value === latestMood)?.label || '未记录';

  const handleSaveEntry = () => {
    if (!newContent.trim()) return;
    
    const entry: DiaryEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
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
    if (diaryEntries.length === 0) {
      setReviewResult('先写一篇日记，我才能帮你复盘。随便写几句也行，不用写得很好。');
      return;
    }

    setIsReviewing(true);
    setReviewResult(null);

    try {
      const prompt = `
你是一位精通心理学与命理学的“命运复盘导师”。
请根据用户最近的日记记录（以及八字命理信息，如果有的话），进行深度的命运复盘。

【用户档案信息】：
${activeProfile ? `姓名：${activeProfile.name}，性别：${activeProfile.gender === 'male' ? '男' : '女'}，出生日期：${activeProfile.birthDate} ${activeProfile.birthTime}，出生地：${activeProfile.birthLocation}` : '未提供'}

【用户八字五行信息】：
${baziResult ? JSON.stringify(baziResult.wuxing) : '未提供'}

【用户近期日记】：
${JSON.stringify(diaryEntries.slice(0, 7).map(e => ({ date: e.date, mood: e.mood, content: e.content, tags: e.tags })))}

【复盘要求】：
1. 语气要温和、睿智、充满洞察力，像一位心灵导师。
2. 分析用户近期的情绪起伏与事件规律。
3. 结合用户档案中的出生时间、八字五行（如果有），指出可能受到的流日/流月气场影响（例如：“最近火气较旺，导致你比较急躁...”）。
4. 给出1-2条切实可行的改运/调整心态的建议。
5. 字数控制在300-500字左右。纯文本格式，段落之间用换行分隔。绝对不要使用Markdown格式（如**加粗**、#标题等）。
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
        aiText = "星轨受到了干扰，无法完成复盘...";
      }

      const finalResult = aiText.replace(/\*\*/g, '').replace(/#/g, '');
      setReviewResult(finalResult);
      
      // Save to history (limit to 30)
      const newReview: ReviewEntry = {
        id: Date.now().toString(),
        date: new Date().toISOString().split('T')[0],
        content: finalResult
      };
      setReviewHistory(prev => [newReview, ...prev].slice(0, 30));
      setAppEvents((events) => recordAppEvent(events, 'diary_review', { diaryCount: diaryEntries.length }));

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
        <h1 className="font-sans text-3xl font-bold tracking-widest text-[#6B8AFF] mb-2 flex items-center gap-2">
          <Book size={28} />
          命运日记
        </h1>
        <p className="text-apple-text-muted text-sm tracking-widest">记录心路历程，洞察命运轨迹</p>
      </div>

      <div className="max-w-md mx-auto space-y-6 relative z-10">
        <section className="rounded-3xl border border-[#F4CF83]/18 bg-[#F4CF83]/[0.055] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[#F4CF83]">
                <Sparkles size={16} />
                <span className="text-sm font-bold">今日记录灵感</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-apple-text">{todayPrompt}</p>
            </div>
            <button
              onClick={() => {
                setNewContent((prev) => prev.trim() ? prev : `${todayPrompt}\n`);
                setIsAdding(true);
              }}
              className="shrink-0 rounded-full bg-[#F4CF83] px-3 py-1.5 text-xs font-bold text-[#080a11]"
            >
              去写
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <DiaryStat label="本周记录" value={`${thisWeekCount} 篇`} />
            <DiaryStat label="最近心情" value={latestMoodLabel} />
          </div>
        </section>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setIsAdding(true)}
            className="col-span-2 bg-apple-surface backdrop-blur-xl rounded-3xl p-5 flex flex-col items-center justify-center gap-3 shadow-[0_14px_38px_rgba(117,82,42,0.12)] hover:shadow-[0_12px_32px_rgba(107,138,255,0.15)] transition-all text-[#6B8AFF] border border-apple-border dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
          >
            <div className="w-12 h-12 rounded-full bg-[#6B8AFF]/10 flex items-center justify-center">
              <Plus size={24} />
            </div>
            <span className="font-medium text-sm tracking-widest">写日记</span>
          </button>
          
          <button
            onClick={handleReview}
            disabled={isReviewing}
            className="bg-gradient-to-br from-[#6B8AFF] to-[#4F46E5] rounded-3xl p-5 flex flex-col items-center justify-center gap-3 shadow-[0_4px_20px_rgba(107,138,255,0.3)] text-white hover:opacity-90 transition-all disabled:opacity-70"
          >
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              {isReviewing ? <Loader2 size={24} className="animate-spin" /> : <BrainCircuit size={24} />}
            </div>
            <span className="font-medium text-sm tracking-widest">{isReviewing ? '复盘中...' : '命运复盘'}</span>
          </button>

          <button
            onClick={() => setShowHistoryModal(true)}
            className="bg-apple-surface backdrop-blur-xl rounded-3xl p-5 flex flex-col items-center justify-center gap-3 shadow-[0_14px_38px_rgba(117,82,42,0.12)] hover:shadow-[0_12px_32px_rgba(107,138,255,0.15)] transition-all text-apple-text-muted border border-apple-border dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
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
              <div className="bg-apple-surface backdrop-blur-xl border border-[#6B8AFF]/30 rounded-3xl p-6 shadow-[0_8px_32px_rgba(107,138,255,0.15)] relative">
                <button 
                  onClick={() => setReviewResult(null)}
                  className="absolute top-4 right-4 text-apple-text-muted hover:text-apple-text"
                >
                  <X size={18} />
                </button>
                <div className="flex items-center gap-2 mb-4 text-[#6B8AFF]">
                  <Sparkles size={20} />
                  <h3 className="font-sans font-bold text-lg">近期命运复盘</h3>
                </div>
                <div className="text-sm leading-relaxed text-apple-text whitespace-pre-wrap">
                  {reviewResult}
                </div>
              </div>
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
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
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
              className="w-full max-w-md bg-apple-surface backdrop-blur-xl border border-apple-border rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto no-scrollbar"
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
                          newMood === mood.value ? "scale-110 bg-apple-surface shadow-[0_4px_15px_rgba(0,0,0,0.2)]" : "opacity-50 hover:opacity-100"
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
                    placeholder="记录下今天的感悟、遇到的困难，或是小确幸..."
                    className="w-full bg-apple-surface border border-apple-border rounded-2xl p-4 text-sm text-apple-text focus:outline-none focus:ring-2 focus:ring-[#6B8AFF]/50 resize-none h-32 transition-all placeholder:text-apple-text-muted/50"
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
                    className="w-full bg-apple-surface border border-apple-border rounded-xl p-3 text-sm text-apple-text focus:outline-none focus:ring-2 focus:ring-[#6B8AFF]/50 transition-all placeholder:text-apple-text-muted/50"
                  />
                </div>

                <button
                  onClick={handleSaveEntry}
                  disabled={!newContent.trim()}
                  className="w-full py-4 bg-[#6B8AFF] text-white rounded-2xl font-medium tracking-widest shadow-[0_4px_20px_rgba(107,138,255,0.3)] disabled:opacity-50 disabled:shadow-none transition-all hover:bg-[#4F46E5]"
                >
                  保存日记
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
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
                  <History size={20} className="text-[#6B8AFF]" />
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
                  reviewHistory.map((review) => (
                    <div key={review.id} className="bg-apple-surface rounded-2xl p-5 border border-apple-border">
                      <div className="font-mono text-xs font-bold tracking-widest text-apple-text-muted mb-3">{review.date}</div>
                      <div className="text-sm leading-relaxed text-apple-text whitespace-pre-wrap">
                        {review.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DiaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-apple-border bg-apple-surface/70 p-3 dark:border-white/10 dark:bg-white/[0.045]">
      <div className="text-[11px] text-apple-text-muted">{label}</div>
      <div className="mt-1 text-base font-bold text-apple-text">{value}</div>
    </div>
  );
}
