import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GitMerge, ArrowRight, Loader2, Compass, Sparkles, Scale, AlertTriangle, CheckCircle2, History } from 'lucide-react';
import { useAppContext } from '../store';
import { recordAppEvent } from '../lib/engagement';

interface SimulationResult {
  choiceA: {
    title: string;
    shortTerm: string;
    longTerm: string;
    riskLevel: number;
    baziFit: string;
  };
  choiceB: {
    title: string;
    shortTerm: string;
    longTerm: string;
    riskLevel: number;
    baziFit: string;
  };
  advice: string;
}

const createFallbackSimulation = (choiceA: string, choiceB: string): SimulationResult => ({
  choiceA: {
    title: choiceA || '选择 A',
    shortTerm: '这条路短期更需要稳定执行，先别急着赌结果。',
    longTerm: '长期看，结果取决于你能不能持续复盘和调整节奏。',
    riskLevel: 55,
    baziFit: '暂时无法结合完整命理细节，只能先按现实风险判断。',
  },
  choiceB: {
    title: choiceB || '选择 B',
    shortTerm: '这条路短期不确定性更强，需要先准备退路。',
    longTerm: '长期看，它可能带来变化，但也会放大成本。',
    riskLevel: 65,
    baziFit: '暂时无法结合完整命理细节，只能先按选择压力判断。',
  },
  advice: '服务暂时不稳定，所以先给你保底判断：别急着选最刺激的，也别自动选最安全的。先问自己哪条路的代价你更愿意承担。',
});

export default function Simulator() {
  const { baziFormData, simulatorState, setSimulatorState, simulationHistory, setSimulationHistory, profiles, activeProfileId, setAppEvents } = useAppContext();
  const [isSimulating, setIsSimulating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dilemma = simulatorState.dilemma;
  const choiceA = simulatorState.choiceA;
  const choiceB = simulatorState.choiceB;
  const result = simulatorState.result;

  const setDilemma = (val: string) => {
    setFormError(null);
    setSimulatorState(prev => ({ ...prev, dilemma: val }));
  };
  const setChoiceA = (val: string) => {
    setFormError(null);
    setSimulatorState(prev => ({ ...prev, choiceA: val }));
  };
  const setChoiceB = (val: string) => {
    setFormError(null);
    setSimulatorState(prev => ({ ...prev, choiceB: val }));
  };
  const setResult = (val: any) => setSimulatorState(prev => ({ ...prev, result: val }));

  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const currentBazi = activeProfile || baziFormData;

  const handleSimulate = async () => {
    if (!dilemma || !choiceA || !choiceB) {
      setFormError("把困境、选择 A、选择 B 都填上，我才能帮你推演。");
      return;
    }

    setIsSimulating(true);
    setFormError(null);
    setResult(null);

    try {
      let baziContext = "用户未提供八字信息。";
      if (currentBazi && currentBazi.name) {
        baziContext = `用户姓名：${currentBazi.name}，性别：${currentBazi.gender}，出生日期：${currentBazi.birthYear || currentBazi.birthDate} ${currentBazi.birthHour || currentBazi.birthTime}。`;
      }

      const prompt = `
你是一位精通命理学、心理学与概率推演的“人生沙盘推演大师”。
请根据用户的先天命理（如果有）和当前的困境，推演两条不同选择的平行宇宙发展路线。

【用户基础信息】
${baziContext}

【当前人生岔路口】
困境描述：${dilemma}
选择A：${choiceA}
选择B：${choiceB}

请务必返回合法的JSON对象，严格遵循以下结构（不要包含任何Markdown标记，直接输出JSON）：
{
  "choiceA": {
    "title": "选择A的提炼标题",
    "shortTerm": "短期发展（3-6个月内的可能遭遇，约50字）",
    "longTerm": "长期结局（1-3年后的可能状态，约50字）",
    "riskLevel": 75, // 风险指数 0-100的整数（必须严格根据该选择的实际客观风险、不确定性、以及与用户命理的冲突程度进行严谨评估，高风险对应高数值）
    "baziFit": "与命理/性格的契合度分析（约50字）"
  },
  "choiceB": {
    "title": "选择B的提炼标题",
    "shortTerm": "短期发展（3-6个月内的可能遭遇，约50字）",
    "longTerm": "长期结局（1-3年后的可能状态，约50字）",
    "riskLevel": 40, // 风险指数 0-100的整数（必须严格根据该选择的实际客观风险、不确定性、以及与用户命理的冲突程度进行严谨评估，高风险对应高数值）
    "baziFit": "与命理/性格的契合度分析（约50字）"
  },
  "advice": "大师的最终破局建议（约100字，客观、深刻、有启发性）"
}
`;

      let aiText = "";
      try {
        const res = await fetch('/api/deepseek/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: '你是一个严格输出JSON格式的人生沙盘推演系统。' },
              { role: 'user', content: prompt }
            ]
          })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        aiText = data.choices[0].message.content;
      } catch (err) {
        console.error("DeepSeek Error:", err);
        aiText = "{}";
      }
      
      const cleanedText = aiText.replace(/```json\n?|\n?```/g, '').trim();
      const parsedResult = JSON.parse(cleanedText);
      const safeResult =
        parsedResult?.choiceA?.title && parsedResult?.choiceB?.title && parsedResult?.advice
          ? parsedResult
          : createFallbackSimulation(choiceA, choiceB);
      setResult(safeResult);
      setSimulationHistory(prev => [{
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        dilemma,
        choiceA,
        choiceB,
        advice: safeResult.advice || '',
        result: safeResult
      }, ...prev].slice(0, 30));
      setAppEvents((events) => recordAppEvent(events, 'simulation_run', { hasProfile: Boolean(currentBazi?.name) }));

    } catch (error: any) {
      console.error("Simulation Error:", error);
      const fallback = createFallbackSimulation(choiceA, choiceB);
      setResult(fallback);
      setFormError("AI 推演暂时不稳定，我先给你一份保底判断，输入内容没有丢。");
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain p-6 pt-12 pb-40 text-apple-text no-scrollbar">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-2 relative">
          {currentBazi && currentBazi.name && (
            <div className="absolute top-0 right-0 bg-[#6B8AFF]/10 border border-[#6B8AFF]/20 rounded-full px-3 py-1 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#6B8AFF] animate-pulse"></div>
              <span className="text-xs text-[#6B8AFF]">当前命主: {currentBazi.name}</span>
            </div>
          )}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#6B8AFF]/20 text-[#6B8AFF] mb-4 shadow-[0_0_30px_rgba(107,138,255,0.3)]"
          >
            <GitMerge size={32} />
          </motion.div>
          <h1 className="text-3xl font-bold tracking-tight text-apple-text">
            命运沙盘推演
          </h1>
          <p className="text-apple-text-muted text-sm">
            站在人生的岔路口，让星辰为你预演两种未来的可能
          </p>
        </div>

        {simulationHistory.length > 0 && !result && !isSimulating && (
          <section className="rounded-3xl border border-apple-border bg-apple-surface/70 p-4 dark:border-white/10 dark:bg-white/[0.045]">
            <div className="mb-3 flex items-center gap-2 text-apple-text">
              <History size={16} className="text-[#F4CF83]" />
              <h2 className="text-sm font-bold">最近推演</h2>
            </div>
            <div className="space-y-2">
              {simulationHistory.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setDilemma(item.dilemma);
                    setChoiceA(item.choiceA);
                    setChoiceB(item.choiceB);
                    setResult(item.result);
                  }}
                  className="w-full rounded-2xl border border-apple-border bg-apple-surface p-3 text-left transition-colors hover:bg-apple-surface-hover dark:border-white/10 dark:bg-[#0b0f18]/70 dark:hover:bg-white/[0.06]"
                >
                  <div className="line-clamp-1 text-sm font-semibold text-apple-text">{item.dilemma}</div>
                  <div className="mt-1 line-clamp-1 text-xs text-apple-text-muted">{item.advice}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Input Form */}
        <AnimatePresence mode="wait">
          {!result && !isSimulating && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-apple-surface backdrop-blur-xl border border-apple-border rounded-3xl p-6 shadow-2xl space-y-6"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium text-apple-text-muted flex items-center gap-2">
                  <Compass size={16} className="text-[#6B8AFF]" />
                  你当前面临的困境或抉择是什么？
                </label>
                <textarea
                  value={dilemma}
                  onChange={(e) => setDilemma(e.target.value)}
                  placeholder="例如：我现在的工作很稳定但没有激情，有个创业机会风险很大但收益可能很高..."
                  className="w-full bg-apple-surface border border-apple-border rounded-xl p-4 text-apple-text placeholder-[#888899] focus:outline-none focus:ring-2 focus:ring-[#6B8AFF]/50 resize-none h-28 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-apple-text-muted flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-[10px] text-blue-400">A</div>
                    选择 A
                  </label>
                  <input
                    type="text"
                    value={choiceA}
                    onChange={(e) => setChoiceA(e.target.value)}
                    placeholder="例如：继续留在现在的公司"
                    className="w-full bg-apple-surface border border-apple-border rounded-xl p-4 text-apple-text placeholder-[#888899] focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-apple-text-muted flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-[10px] text-rose-400">B</div>
                    选择 B
                  </label>
                  <input
                    type="text"
                    value={choiceB}
                    onChange={(e) => setChoiceB(e.target.value)}
                    placeholder="例如：辞职去创业"
                    className="w-full bg-apple-surface border border-apple-border rounded-xl p-4 text-apple-text placeholder-[#888899] focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all"
                  />
                </div>
              </div>

              {formError && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm leading-relaxed text-apple-text-muted">
                  {formError}
                </div>
              )}

              <button
                onClick={handleSimulate}
                disabled={!dilemma || !choiceA || !choiceB}
                className="w-full py-4 rounded-xl bg-[#6B8AFF] text-white font-medium shadow-[0_4px_15px_rgba(107,138,255,0.3)] hover:bg-[#4F46E5] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Sparkles size={18} />
                开启平行宇宙推演
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading State */}
        <AnimatePresence>
          {isSimulating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 space-y-6"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-[#6B8AFF]/20 blur-xl rounded-full animate-pulse"></div>
                <Loader2 size={48} className="text-[#6B8AFF] animate-spin relative z-10" />
              </div>
              <p className="text-[#6B8AFF] font-medium animate-pulse tracking-widest">正在推演平行宇宙的因果线...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {result && !isSimulating && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Choice A Card */}
                <div className="bg-apple-surface backdrop-blur-xl border border-blue-500/30 rounded-3xl p-6 space-y-6 relative overflow-hidden shadow-[0_8px_30px_rgba(59,130,246,0.15)]">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full"></div>
                  
                  <div className="flex items-center gap-3 border-b border-apple-border pb-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-blue-400 font-bold">A</div>
                    <h3 className="text-lg font-bold text-apple-text">{result.choiceA.title}</h3>
                  </div>

                  <div className="space-y-4 relative z-10">
                    <div>
                      <h4 className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Compass size={12}/> 短期发展</h4>
                      <p className="text-sm text-apple-text-muted leading-relaxed">{result.choiceA.shortTerm}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-1 flex items-center gap-1"><ArrowRight size={12}/> 长期结局</h4>
                      <p className="text-sm text-apple-text-muted leading-relaxed">{result.choiceA.longTerm}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-1 flex items-center gap-1"><CheckCircle2 size={12}/> 命理契合</h4>
                      <p className="text-sm text-apple-text-muted leading-relaxed">{result.choiceA.baziFit}</p>
                    </div>
                    
                    <div className="pt-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-apple-text-muted flex items-center gap-1"><AlertTriangle size={12}/> 风险指数</span>
                        <span className="text-blue-400 font-mono">{result.choiceA.riskLevel}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-apple-surface rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                          style={{ width: `${result.choiceA.riskLevel}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Choice B Card */}
                <div className="bg-apple-surface backdrop-blur-xl border border-rose-500/30 rounded-3xl p-6 space-y-6 relative overflow-hidden shadow-[0_8px_30px_rgba(244,63,94,0.15)]">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-3xl rounded-full"></div>
                  
                  <div className="flex items-center gap-3 border-b border-apple-border pb-4">
                    <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 font-bold">B</div>
                    <h3 className="text-lg font-bold text-apple-text">{result.choiceB.title}</h3>
                  </div>

                  <div className="space-y-4 relative z-10">
                    <div>
                      <h4 className="text-xs font-medium text-rose-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Compass size={12}/> 短期发展</h4>
                      <p className="text-sm text-apple-text-muted leading-relaxed">{result.choiceB.shortTerm}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-rose-400 uppercase tracking-wider mb-1 flex items-center gap-1"><ArrowRight size={12}/> 长期结局</h4>
                      <p className="text-sm text-apple-text-muted leading-relaxed">{result.choiceB.longTerm}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-rose-400 uppercase tracking-wider mb-1 flex items-center gap-1"><CheckCircle2 size={12}/> 命理契合</h4>
                      <p className="text-sm text-apple-text-muted leading-relaxed">{result.choiceB.baziFit}</p>
                    </div>
                    
                    <div className="pt-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-apple-text-muted flex items-center gap-1"><AlertTriangle size={12}/> 风险指数</span>
                        <span className="text-rose-400 font-mono">{result.choiceB.riskLevel}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-apple-surface rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-rose-500 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                          style={{ width: `${result.choiceB.riskLevel}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Master's Advice */}
              <div className="bg-apple-surface backdrop-blur-xl border border-[#6B8AFF]/30 rounded-3xl p-6 relative overflow-hidden shadow-[0_8px_30px_rgba(107,138,255,0.15)]">
                <div className="absolute -top-10 -right-10 text-[#6B8AFF]/10">
                  <Scale size={120} />
                </div>
                <h3 className="text-sm font-bold text-[#6B8AFF] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Sparkles size={16} />
                  破局箴言
                </h3>
                <p className="text-apple-text leading-relaxed relative z-10 text-justify">
                  {result.advice}
                </p>
              </div>

              <button
                onClick={() => {
                  setResult(null);
                  setChoiceA('');
                  setChoiceB('');
                  setDilemma('');
                }}
                className="w-full py-4 rounded-xl bg-apple-surface border border-apple-border text-apple-text font-medium hover:bg-apple-surface-hover transition-all"
              >
                重新推演
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
