import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Compass,
  GitMerge,
  History,
  Loader2,
  MessageCircle,
  RotateCcw,
  Scale,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext, type SimulationHistoryEntry } from '../store';
import { recordAppEvent } from '../lib/engagement';
import { clsx } from 'clsx';
import { parseAiJson, SIMULATOR_JSON_SYSTEM_PROMPT } from '../lib/aiPrompting';
import { DEEPSEEK_TEXT_MODEL } from '../lib/aiModels';
import { SERVICE_FALLBACK } from '../lib/serviceFeedback';
import { createGenerationTrace } from '../lib/generationTrace';
import { apiFetch } from '../lib/apiClient';

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

const PRESET_CATEGORIES = ['迷茫', '事业', '感情', '学业', '金钱', '家庭', '迁移', '自我'] as const;
type SimulationPresetCategory = (typeof PRESET_CATEGORIES)[number];

type SimulationPreset = {
  category: SimulationPresetCategory;
  label: string;
  hint: string;
  dilemma: string;
  choiceA: string;
  choiceB: string;
};

const SIMULATION_PRESETS: SimulationPreset[] = [
  {
    category: '迷茫',
    label: '只知道不满意',
    hint: '现状不差，但心里总觉得不对',
    dilemma: '最近对现状不太满意，但说不清是该继续调整、耐心等待，还是干脆换一个方向。',
    choiceA: '先留在原来的轨道里做小调整',
    choiceB: '主动换一个更大的方向',
  },
  {
    category: '迷茫',
    label: '想变好但没方向',
    hint: '不知道先动哪一块',
    dilemma: '我想让生活变好，但不知道该先解决现实事务，还是先处理自己的状态和情绪。',
    choiceA: '先稳定工作、收入和日常节奏',
    choiceB: '先处理情绪、关系和内在消耗',
  },
  {
    category: '迷茫',
    label: '该忍还是该动',
    hint: '怕冲动，也怕一直拖',
    dilemma: '我现在卡在一个不上不下的状态，继续忍会很累，主动改变又怕代价太大。',
    choiceA: '再观察一段时间，先不做大动作',
    choiceB: '立刻开始推进一个明显变化',
  },
  {
    category: '事业',
    label: '职业去留',
    hint: '稳定和机会之间摇摆',
    dilemma: '现在的工作稳定但消耗很大，另一个机会更有想象力，但不确定性也更高。',
    choiceA: '继续留在现在的公司',
    choiceB: '换到新的机会里重新开始',
  },
  {
    category: '事业',
    label: '升职或转岗',
    hint: '往上走还是换赛道',
    dilemma: '我面前有一个更高压力的晋升机会，也有一个更适合长期成长的转岗方向。',
    choiceA: '争取晋升，承担更高责任',
    choiceB: '转到更适合长期成长的方向',
  },
  {
    category: '事业',
    label: '副业要不要做',
    hint: '想多一条路，但怕分心',
    dilemma: '我想开始做副业或个人项目，但又担心影响主业和生活稳定。',
    choiceA: '先把主业做好，暂缓副业',
    choiceB: '开始投入副业，给自己多一条路',
  },
  {
    category: '感情',
    label: '关系进退',
    hint: '心动和不安同时存在',
    dilemma: '这段关系让我心动，也让我不安。我想知道继续投入和先拉开距离分别会怎样。',
    choiceA: '继续主动经营这段关系',
    choiceB: '先减少投入，把重心放回自己',
  },
  {
    category: '感情',
    label: '要不要复合',
    hint: '放不下，但怕重蹈覆辙',
    dilemma: '我对过去那段关系还有牵挂，但也担心复合只是重复之前的问题。',
    choiceA: '尝试重新靠近，给彼此一次机会',
    choiceB: '彻底放下，把注意力收回自己',
  },
  {
    category: '感情',
    label: '该不该表白',
    hint: '暧昧久了，不确定要不要推进',
    dilemma: '我们之间有一些暧昧和好感，但我不确定该不该主动把关系说清楚。',
    choiceA: '继续观察，不急着表明心意',
    choiceB: '主动表达，把关系推进一步',
  },
  {
    category: '学业',
    label: '考研或工作',
    hint: '继续读书还是先进入社会',
    dilemma: '我在继续深造和先工作之间摇摆，一边想提升学历，一边又担心错过现实机会。',
    choiceA: '继续备考或深造',
    choiceB: '先进入工作，边做边看方向',
  },
  {
    category: '学业',
    label: '换专业方向',
    hint: '原方向安全，新方向更喜欢',
    dilemma: '现在的专业或学习方向比较稳定，但我对另一个方向更有兴趣，也更有不确定性。',
    choiceA: '继续沿着原专业方向走',
    choiceB: '转向更感兴趣的新方向',
  },
  {
    category: '学业',
    label: '冲刺或保守',
    hint: '目标高低怎么选',
    dilemma: '我可以冲一个更高目标，也可以选择更稳妥的路径，但不知道哪种更适合现在的我。',
    choiceA: '选择稳妥目标，提高确定性',
    choiceB: '冲刺更高目标，接受更大压力',
  },
  {
    category: '金钱',
    label: '存钱或投入',
    hint: '安全感和成长之间取舍',
    dilemma: '我手上有一笔资源，可以继续存着提高安全感，也可以投入学习、项目或机会。',
    choiceA: '先存下来，保留安全边界',
    choiceB: '投入成长或机会，换取更大可能',
  },
  {
    category: '金钱',
    label: '买不买大件',
    hint: '想改善生活，又怕负担',
    dilemma: '我想买一个金额不小的东西来改善生活或效率，但担心它会带来后续压力。',
    choiceA: '暂时不买，先保留现金流',
    choiceB: '现在购买，用它改善生活或效率',
  },
  {
    category: '金钱',
    label: '合作或单干',
    hint: '资源共享还是掌控权',
    dilemma: '我面前有一个合作机会，可以分担风险和资源，但也可能带来分歧和失控。',
    choiceA: '保持单独推进，掌控节奏',
    choiceB: '接受合作，换取资源和速度',
  },
  {
    category: '家庭',
    label: '听家里还是自己选',
    hint: '亲近的人意见很重',
    dilemma: '家人或亲近的人给了我很明确的建议，但我内心有另一个想法。',
    choiceA: '更多听取家人的建议',
    choiceB: '按自己的真实想法选择',
  },
  {
    category: '家庭',
    label: '要不要摊牌',
    hint: '一直憋着很累',
    dilemma: '有一件事我一直没有和家人或重要的人说清楚，继续回避会轻松一点，但问题还在。',
    choiceA: '继续缓一缓，先不正面谈',
    choiceB: '找机会认真说清楚',
  },
  {
    category: '迁移',
    label: '城市迁移',
    hint: '熟悉环境和新机会之间取舍',
    dilemma: '留在熟悉的城市更安稳，去新的城市可能打开局面，但也会牺牲很多确定性。',
    choiceA: '留在现在的城市发展',
    choiceB: '去新的城市重新布局',
  },
  {
    category: '迁移',
    label: '回家或留下',
    hint: '亲密支持和个人机会之间摇摆',
    dilemma: '我在回到更靠近家人的地方和继续留在现在的城市之间犹豫。',
    choiceA: '回到更靠近家人的地方',
    choiceB: '继续留在现在的城市发展',
  },
  {
    category: '自我',
    label: '休息或硬撑',
    hint: '身体和目标都在拉扯',
    dilemma: '我最近很疲惫，但又担心一停下来就落后或失去机会。',
    choiceA: '先降低强度，恢复状态',
    choiceB: '继续撑过这段关键期',
  },
  {
    category: '自我',
    label: '改变习惯',
    hint: '旧模式熟悉，新模式很难',
    dilemma: '我知道自己有一个旧习惯或旧模式在消耗我，但改变它会很不舒服。',
    choiceA: '先维持原来的节奏，慢慢观察',
    choiceB: '立刻开始建立新的生活规则',
  },
];

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

const clampRisk = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50));

const getRiskLabel = (value: number) => {
  if (value >= 72) return '高波动';
  if (value >= 45) return '中等波动';
  return '相对稳';
};

const SIMULATION_KEYWORD_HINTS = ['工作', '关系', '恋爱', '学习', '金钱', '家庭', '迁移', '自我', '合作', '离开', '留下', '机会', '压力', '风险'];

function compactSimulationText(text: string, limit = 68) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function formatSimulationDate(date?: string) {
  if (!date) return '刚刚生成';
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return date;
  return value.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function splitAdviceLines(text: string) {
  return text
    .replace(/\*\*/g, '')
    .split(/[。！？\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function buildSimulationArchive({
  date,
  dilemma,
  choiceA,
  choiceB,
  result,
}: {
  date?: string;
  dilemma: string;
  choiceA: string;
  choiceB: string;
  result: SimulationResult;
}) {
  const riskA = clampRisk(result.choiceA.riskLevel);
  const riskB = clampRisk(result.choiceB.riskLevel);
  const delta = Math.abs(riskA - riskB);
  const saferLine = delta < 8 ? '两条线风险接近' : riskA < riskB ? 'A 线更稳' : 'B 线更稳';
  const source = `${dilemma} ${choiceA} ${choiceB} ${result.advice} ${result.choiceA.title} ${result.choiceB.title}`;
  const keywords = SIMULATION_KEYWORD_HINTS.filter((keyword) => source.includes(keyword)).slice(0, 5);
  const advice = splitAdviceLines(result.advice);

  return {
    dateLabel: formatSimulationDate(date),
    title: `${compactSimulationText(choiceA || 'A 线', 16)} / ${compactSimulationText(choiceB || 'B 线', 16)}`,
    keywords: keywords.length > 0 ? keywords : ['选择', '代价', '节奏'],
    saferLine,
    riskA,
    riskB,
    summary: compactSimulationText(dilemma || '这次推演记录了一个重要选择。', 92),
    timeline: [
      { label: 'A 线短期', text: result.choiceA.shortTerm },
      { label: 'B 线短期', text: result.choiceB.shortTerm },
      { label: '最终提醒', text: advice[0] || result.advice },
    ],
  };
}

export default function Simulator() {
  const navigate = useNavigate();
  const { baziFormData, simulatorState, setSimulatorState, simulationHistory, setSimulationHistory, profiles, activeProfileId, setAppEvents } = useAppContext();
  const [isSimulating, setIsSimulating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedPresetCategory, setSelectedPresetCategory] = useState<SimulationPresetCategory>('迷茫');

  const dilemma = simulatorState.dilemma;
  const choiceA = simulatorState.choiceA;
  const choiceB = simulatorState.choiceB;
  const result = simulatorState.result as SimulationResult | null;

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
  const setResult = (val: SimulationResult | null) => setSimulatorState(prev => ({ ...prev, result: val }));

  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const currentBazi = activeProfile || baziFormData;
  const canSimulate = Boolean(dilemma.trim() && choiceA.trim() && choiceB.trim());
  const visiblePresets = SIMULATION_PRESETS.filter((preset) => preset.category === selectedPresetCategory);

  const applyPreset = (preset: SimulationPreset) => {
    setDilemma(preset.dilemma);
    setChoiceA(preset.choiceA);
    setChoiceB(preset.choiceB);
    setResult(null);
    setFormError(null);
  };

  const resetForm = () => {
    setResult(null);
    setChoiceA('');
    setChoiceB('');
    setDilemma('');
    setFormError(null);
  };

  const askTarotFromSimulation = (source?: {
    date?: string;
    dilemma: string;
    choiceA: string;
    choiceB: string;
    result: SimulationResult;
  }) => {
    const activeSource = source || (result ? {
      date: new Date().toISOString(),
      dilemma,
      choiceA,
      choiceB,
      result,
    } : null);
    if (!activeSource) return;

    const archive = buildSimulationArchive(activeSource);
    const prompt = [
      `请沿着我的「沙盘推演档案」继续看。`,
      `当前问题：${activeSource.dilemma}`,
      `A 线：${activeSource.choiceA}`,
      `B 线：${activeSource.choiceB}`,
      `档案判断：${archive.saferLine}，关键词：${archive.keywords.join('、')}。`,
      '我想知道今天最适合先验证哪一步，以及哪种代价要提前准备。',
    ].join('\n');

    try {
      localStorage.setItem('draft:home:input', JSON.stringify(prompt));
    } catch {
      // Draft handoff is optional. Navigation still works if storage is unavailable.
    }
    navigate('/app');
  };

  const handleSimulate = async () => {
    if (!canSimulate) {
      setFormError('把困境、选择 A、选择 B 都填上，我才能帮你推演。');
      return;
    }

    setIsSimulating(true);
    setFormError(null);
    setResult(null);

    try {
      let baziContext = '用户未提供八字信息。';
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
    "riskLevel": 75,
    "baziFit": "与命理/性格的契合度分析（约50字）"
  },
  "choiceB": {
    "title": "选择B的提炼标题",
    "shortTerm": "短期发展（3-6个月内的可能遭遇，约50字）",
    "longTerm": "长期结局（1-3年后的可能状态，约50字）",
    "riskLevel": 40,
    "baziFit": "与命理/性格的契合度分析（约50字）"
  },
  "advice": "大师的最终破局建议（约100字，客观、深刻、有启发性）"
}
`;

      let aiText = '';
      let usedFallbackSimulation = false;
      try {
        const res = await apiFetch('/api/deepseek/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: DEEPSEEK_TEXT_MODEL,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: '你是一个严格输出JSON格式的人生沙盘推演系统。' },
              { role: 'user', content: `${SIMULATOR_JSON_SYSTEM_PROMPT}\n\n${prompt}` }
            ]
          })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        aiText = data.choices[0].message.content;
      } catch (err) {
        console.error('DeepSeek Error:', err);
        aiText = '{}';
        usedFallbackSimulation = true;
      }

      let parsedResult: Partial<SimulationResult> = {};
      try {
        parsedResult = parseAiJson<Partial<SimulationResult>>(aiText);
      } catch (parseError) {
        console.error('Simulation JSON Parse Error:', parseError);
        usedFallbackSimulation = true;
      }
      const hasCompleteResult = Boolean(parsedResult?.choiceA?.title && parsedResult?.choiceB?.title && parsedResult?.advice);
      const safeResult: SimulationResult = hasCompleteResult
        ? parsedResult as SimulationResult
        : createFallbackSimulation(choiceA, choiceB);
      if (!hasCompleteResult) usedFallbackSimulation = true;
      setResult(safeResult);
      setFormError(usedFallbackSimulation ? SERVICE_FALLBACK.simulator : null);
      setSimulationHistory(prev => [{
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        dilemma,
        choiceA,
        choiceB,
        advice: safeResult.advice || '',
        result: safeResult,
        ...createGenerationTrace('simulator', {
          model: DEEPSEEK_TEXT_MODEL,
          usedFallback: usedFallbackSimulation,
        }),
      }, ...prev].slice(0, 30));
      setAppEvents((events) => recordAppEvent(events, 'simulation_run', { hasProfile: Boolean(currentBazi?.name) }));

    } catch (error: any) {
      console.error('Simulation Error:', error);
      const fallback = createFallbackSimulation(choiceA, choiceB);
      setResult(fallback);
      setFormError(SERVICE_FALLBACK.simulator);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain px-4 pt-5 pb-36 text-apple-text no-scrollbar sm:px-6 sm:pt-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <section className="relative overflow-hidden rounded-[34px] border border-apple-border bg-[linear-gradient(145deg,rgba(255,252,246,0.94),rgba(244,232,214,0.72))] p-5 shadow-[0_22px_58px_rgba(117,82,42,0.14)] backdrop-blur-2xl dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(24,29,42,0.94),rgba(8,10,18,0.88))] dark:shadow-[0_24px_68px_rgba(0,0,0,0.42)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(185,123,40,0.08)_1px,transparent_1px),linear-gradient(180deg,rgba(185,123,40,0.08)_1px,transparent_1px)] bg-[length:36px_36px] opacity-45 dark:opacity-25" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-apple-gold/45 to-transparent" />

          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-apple-gold/26 bg-apple-gold/10 px-3 py-1.5 text-xs font-bold text-apple-gold">
                <Sparkles size={14} />
                双线推演
              </div>
              <h1 className="text-[28px] font-black leading-tight tracking-tight text-apple-text sm:text-4xl">
                命运沙盘
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-apple-text-muted">
                把纠结拆成两条路：短期会发生什么，长期会付出什么，哪条代价更值得承受。
              </p>
            </div>
            <div className="shrink-0 rounded-[24px] border border-apple-gold/24 bg-apple-surface/72 p-3 text-apple-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:bg-white/[0.055]">
              <GitMerge size={28} />
            </div>
          </div>

          <div className="relative z-10 mt-5 grid grid-cols-3 gap-2">
            <SignalPill label="命主" value={currentBazi?.name || '未绑定'} active={Boolean(currentBazi?.name)} />
            <SignalPill label="历史" value={`${simulationHistory.length} 次`} active={simulationHistory.length > 0} />
            <SignalPill label="模式" value="A/B" active />
          </div>
        </section>

        {simulationHistory.length > 0 && !result && !isSimulating && (
          <section className="rounded-[28px] border border-apple-border bg-apple-surface/72 p-3 shadow-[0_14px_38px_rgba(117,82,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.045] dark:shadow-[0_12px_34px_rgba(0,0,0,0.28)]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-black text-apple-text">
                <History size={16} className="text-apple-gold" />
                沙盘档案
              </div>
              <span className="text-[11px] text-apple-text-muted">可回看、可继续问</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {simulationHistory.slice(0, 3).map((item) => (
                <React.Fragment key={item.id}>
                  <SimulationHistoryCard
                    item={item}
                    onOpen={() => {
                      setDilemma(item.dilemma);
                      setChoiceA(item.choiceA);
                      setChoiceB(item.choiceB);
                      setResult(item.result);
                    }}
                    onContinue={() => askTarotFromSimulation({
                      date: item.date,
                      dilemma: item.dilemma,
                      choiceA: item.choiceA,
                      choiceB: item.choiceB,
                      result: item.result as SimulationResult,
                    })}
                  />
                </React.Fragment>
              ))}
            </div>
          </section>
        )}

        <AnimatePresence mode="wait">
          {!result && !isSimulating && (
            <motion.section
              key="input"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              className="space-y-4"
            >
              <div className="rounded-[32px] border border-apple-border bg-apple-surface/82 p-4 shadow-[0_18px_48px_rgba(117,82,42,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#111722]/78 dark:shadow-[0_18px_52px_rgba(0,0,0,0.34)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-apple-text">不知道怎么问，先选方向</div>
                    <p className="mt-1 text-xs text-apple-text-muted">适合只有大概烦恼、还没组织好问题的时候。</p>
                  </div>
                </div>
                <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {PRESET_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedPresetCategory(category)}
                      className={clsx(
                        'rounded-full border px-2 py-2 text-xs font-bold transition-transform active:scale-[0.98]',
                        selectedPresetCategory === category
                          ? 'border-apple-gold/42 bg-apple-gold text-[#17130f] shadow-[0_10px_24px_rgba(185,123,40,0.18)]'
                          : 'border-apple-border bg-apple-surface/72 text-apple-text-muted dark:border-white/10 dark:bg-white/[0.045]',
                      )}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {visiblePresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="group rounded-[22px] border border-apple-border bg-apple-surface/72 p-3 text-left transition-transform active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.045]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-apple-text">{preset.label}</span>
                        <span className="rounded-full bg-apple-gold/12 px-2 py-0.5 text-[10px] font-bold text-apple-gold group-active:bg-apple-gold group-active:text-[#17130f]">
                          填入
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-apple-text-muted">{preset.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[34px] border border-apple-border bg-apple-surface/86 p-4 shadow-[0_20px_58px_rgba(117,82,42,0.13)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#111722]/82 dark:shadow-[0_22px_62px_rgba(0,0,0,0.36)] sm:p-5">
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-black text-apple-text">
                    <Compass size={16} className="text-apple-gold" />
                    当前岔路
                  </label>
                  <textarea
                    value={dilemma}
                    onChange={(e) => setDilemma(e.target.value)}
                    placeholder="比如：现在工作稳定但消耗很大，另一个机会更有想象力，可风险也高。"
                    className="h-28 w-full resize-none rounded-[24px] border border-apple-border bg-apple-bg/55 p-4 text-sm leading-relaxed text-apple-text outline-none transition-all placeholder:text-apple-text-muted/55 focus:border-apple-gold/45 focus:ring-4 focus:ring-apple-gold/12 dark:border-white/10 dark:bg-black/18"
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ChoiceInput
                    tone="a"
                    label="A 线"
                    value={choiceA}
                    onChange={setChoiceA}
                    placeholder="比如：继续留在现在的公司"
                  />
                  <ChoiceInput
                    tone="b"
                    label="B 线"
                    value={choiceB}
                    onChange={setChoiceB}
                    placeholder="比如：辞职去新的机会"
                  />
                </div>

                {formError && (
                  <div className="mt-4 rounded-2xl border border-apple-gold/22 bg-apple-gold/10 p-3 text-xs leading-relaxed text-apple-text-muted">
                    {formError}
                  </div>
                )}

                <button
                  onClick={handleSimulate}
                  disabled={!canSimulate}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-apple-gold py-4 text-sm font-black text-[#17130f] shadow-[0_18px_36px_rgba(185,123,40,0.24)] transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none dark:shadow-[0_14px_34px_rgba(244,207,131,0.18)]"
                >
                  <Sparkles size={18} />
                  开始双线推演
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isSimulating && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="rounded-[34px] border border-apple-border bg-apple-surface/82 p-8 text-center shadow-[0_20px_58px_rgba(117,82,42,0.13)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#111722]/82 dark:shadow-[0_22px_62px_rgba(0,0,0,0.36)]"
            >
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] border border-apple-gold/28 bg-apple-gold/12 text-apple-gold">
                <Loader2 size={34} className="animate-spin" />
              </div>
              <div className="mt-5 text-base font-black text-apple-text">正在校准两条时间线</div>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-apple-text-muted">
                星轨会拆解短期阻力、长期代价和命理契合度，给你一个更清醒的选择视角。
              </p>
            </motion.section>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {result && !isSimulating && (
            <motion.section
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <SimulationArchivePanel
                date={new Date().toISOString()}
                dilemma={dilemma}
                choiceA={choiceA}
                choiceB={choiceB}
                result={result}
                onContinue={() => askTarotFromSimulation()}
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <ResultBranch label="A 线" result={result.choiceA} tone="a" />
                <ResultBranch label="B 线" result={result.choiceB} tone="b" />
              </div>

              <div className="relative overflow-hidden rounded-[32px] border border-apple-gold/24 bg-[linear-gradient(145deg,rgba(185,123,40,0.12),rgba(255,252,246,0.82))] p-5 shadow-[0_18px_48px_rgba(117,82,42,0.13)] backdrop-blur-2xl dark:border-apple-gold/18 dark:bg-[linear-gradient(145deg,rgba(244,207,131,0.13),rgba(18,23,34,0.82))] dark:shadow-[0_20px_56px_rgba(0,0,0,0.36)]">
                <div className="pointer-events-none absolute right-4 top-4 text-apple-gold/10">
                  <Scale size={108} />
                </div>
                <div className="relative z-10 mb-3 flex items-center gap-2 text-sm font-black text-apple-gold">
                  <Sparkles size={16} />
                  破局建议
                </div>
                <p className="relative z-10 text-sm leading-relaxed text-apple-text">
                  {result.advice}
                </p>
              </div>

              <button
                onClick={resetForm}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-apple-border bg-apple-surface/76 py-3.5 text-sm font-bold text-apple-text-muted shadow-[0_12px_32px_rgba(117,82,42,0.10)] backdrop-blur-xl transition-transform active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.045]"
              >
                <RotateCcw size={16} />
                重新推演
              </button>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SimulationArchivePanel({
  date,
  dilemma,
  choiceA,
  choiceB,
  result,
  onContinue,
}: {
  date?: string;
  dilemma: string;
  choiceA: string;
  choiceB: string;
  result: SimulationResult;
  onContinue: () => void;
}) {
  const archive = buildSimulationArchive({ date, dilemma, choiceA, choiceB, result });

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-apple-gold/24 bg-[linear-gradient(145deg,rgba(244,207,131,0.16),rgba(255,252,246,0.82))] p-5 shadow-[0_18px_48px_rgba(117,82,42,0.13)] backdrop-blur-2xl dark:border-apple-gold/18 dark:bg-[linear-gradient(145deg,rgba(244,207,131,0.13),rgba(18,23,34,0.82))] dark:shadow-[0_20px_56px_rgba(0,0,0,0.36)]">
      <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-apple-gold/16 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-apple-gold/42 to-transparent" />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-apple-gold">
            <Scale size={14} />
            推演档案
          </div>
          <h2 className="mt-1 line-clamp-2 text-xl font-black text-apple-text">{archive.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-apple-text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock3 size={12} />
              {archive.dateLabel}
            </span>
            <span>{archive.saferLine}</span>
            <span>A {archive.riskA}% / B {archive.riskB}%</span>
          </div>
        </div>
        <button
          onClick={onContinue}
          className="shrink-0 rounded-full bg-apple-gold px-3 py-2 text-[11px] font-black text-[#17130f] shadow-[0_12px_28px_rgba(185,123,40,0.20)] transition-transform active:scale-[0.98]"
        >
          继续问
        </button>
      </div>

      <p className="relative z-10 mt-4 rounded-[20px] border border-apple-border bg-apple-surface/70 p-3 text-sm leading-relaxed text-apple-text dark:border-white/10 dark:bg-black/16">
        {archive.summary}
      </p>

      <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
        {archive.keywords.map((keyword) => (
          <span key={keyword} className="rounded-full border border-apple-gold/22 bg-apple-gold/10 px-2.5 py-1 text-[11px] font-bold text-apple-gold">
            {keyword}
          </span>
        ))}
      </div>

      <div className="relative z-10 mt-4 grid gap-2 sm:grid-cols-3">
        {archive.timeline.map((item) => (
          <div key={item.label} className="rounded-[20px] border border-apple-border bg-apple-surface/70 p-3 dark:border-white/10 dark:bg-black/16">
            <div className="text-xs font-black text-apple-text">{item.label}</div>
            <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-apple-text-muted">{item.text}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onContinue}
        className="relative z-10 mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-apple-gold/24 bg-apple-surface/70 py-3 text-sm font-black text-apple-gold transition-transform active:scale-[0.99] dark:bg-black/18"
      >
        <MessageCircle size={16} />
        带着这次推演问塔罗
      </button>
    </div>
  );
}

function SimulationHistoryCard({
  item,
  onOpen,
  onContinue,
}: {
  item: SimulationHistoryEntry;
  onOpen: () => void;
  onContinue: () => void;
}) {
  const result = item.result as SimulationResult;
  const archive = buildSimulationArchive({
    date: item.date,
    dilemma: item.dilemma,
    choiceA: item.choiceA,
    choiceB: item.choiceB,
    result,
  });

  return (
    <div className="min-w-0 rounded-[22px] border border-apple-border bg-apple-surface/72 p-3 text-left dark:border-white/10 dark:bg-black/15">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-black text-apple-gold">
            <Scale size={12} />
            {archive.dateLabel}
          </div>
          <div className="mt-1 line-clamp-2 text-xs font-black leading-snug text-apple-text">{archive.summary}</div>
        </div>
        <div className="shrink-0 rounded-full bg-apple-gold/12 px-2 py-1 text-[10px] font-bold text-apple-gold">
          {archive.saferLine}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {archive.keywords.slice(0, 3).map((keyword) => (
          <span key={keyword} className="rounded-full bg-apple-bg/55 px-2 py-0.5 text-[10px] text-apple-text-muted dark:bg-white/[0.055]">
            {keyword}
          </span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full border border-apple-border bg-apple-surface/80 px-3 py-2 text-[11px] font-black text-apple-text-muted transition-transform active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.045]"
        >
          回看
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="rounded-full bg-apple-gold px-3 py-2 text-[11px] font-black text-[#17130f] transition-transform active:scale-[0.98]"
        >
          继续问
        </button>
      </div>
    </div>
  );
}

function SignalPill({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-apple-border bg-apple-surface/62 px-3 py-2 backdrop-blur-xl dark:border-white/10 dark:bg-black/15">
      <div className="text-[10px] font-bold text-apple-text-muted">{label}</div>
      <div className={clsx('mt-0.5 truncate text-sm font-black', active ? 'text-apple-text' : 'text-apple-text-muted')}>
        {value}
      </div>
    </div>
  );
}

function ChoiceInput({
  tone,
  label,
  value,
  onChange,
  placeholder,
}: {
  tone: 'a' | 'b';
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const isA = tone === 'a';

  return (
    <div className="rounded-[26px] border border-apple-border bg-apple-bg/42 p-3 dark:border-white/10 dark:bg-black/16">
      <label className="mb-2 flex items-center gap-2 text-xs font-black text-apple-text">
        <span className={clsx(
          'flex h-6 w-6 items-center justify-center rounded-full text-[11px]',
          isA ? 'bg-apple-gold text-[#17130f]' : 'bg-[#486B78] text-white dark:bg-[#8eb7c5] dark:text-[#071018]',
        )}>
          {isA ? 'A' : 'B'}
        </span>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-2xl border border-apple-border bg-apple-surface/82 px-3 text-sm text-apple-text outline-none transition-all placeholder:text-apple-text-muted/55 focus:border-apple-gold/42 focus:ring-4 focus:ring-apple-gold/12 dark:border-white/10 dark:bg-[#0b0f18]/72"
      />
    </div>
  );
}

function ResultBranch({
  label,
  result,
  tone,
}: {
  label: string;
  result: SimulationResult['choiceA'];
  tone: 'a' | 'b';
}) {
  const risk = clampRisk(result.riskLevel);
  const isA = tone === 'a';

  return (
    <div className={clsx(
      'relative overflow-hidden rounded-[32px] border bg-apple-surface/84 p-4 shadow-[0_18px_48px_rgba(117,82,42,0.12)] backdrop-blur-2xl dark:bg-[#111722]/80 dark:shadow-[0_20px_54px_rgba(0,0,0,0.34)]',
      isA ? 'border-apple-gold/28 dark:border-apple-gold/18' : 'border-[#486B78]/30 dark:border-[#8eb7c5]/22',
    )}>
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-apple-gold/34 to-transparent" />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={clsx('mb-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-black', isA ? 'bg-apple-gold text-[#17130f]' : 'bg-[#486B78] text-white dark:bg-[#8eb7c5] dark:text-[#071018]')}>
            {label}
          </div>
          <h3 className="line-clamp-2 text-lg font-black leading-snug text-apple-text">{result.title}</h3>
        </div>
        <RiskDial value={risk} tone={tone} />
      </div>

      <div className="space-y-3">
        <ResultPoint icon={<Compass size={13} />} title="短期变化" content={result.shortTerm} tone={tone} />
        <ResultPoint icon={<ArrowRight size={13} />} title="长期走向" content={result.longTerm} tone={tone} />
        <ResultPoint icon={<CheckCircle2 size={13} />} title="命理契合" content={result.baziFit} tone={tone} />
      </div>

      <div className="mt-4 rounded-2xl border border-apple-border bg-apple-bg/45 p-3 dark:border-white/10 dark:bg-black/16">
        <div className="mb-2 flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1 font-bold text-apple-text-muted">
            <AlertTriangle size={12} />
            风险指数
          </span>
          <span className={clsx('font-black', isA ? 'text-apple-gold' : 'text-[#486B78] dark:text-[#8eb7c5]')}>
            {getRiskLabel(risk)} · {risk}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-apple-border/30 dark:bg-white/10">
          <div
            className={clsx('h-full rounded-full transition-all', isA ? 'bg-apple-gold' : 'bg-[#486B78] dark:bg-[#8eb7c5]')}
            style={{ width: `${risk}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ResultPoint({ icon, title, content, tone }: { icon: React.ReactNode; title: string; content: string; tone: 'a' | 'b' }) {
  const isA = tone === 'a';
  return (
    <div className="rounded-2xl border border-apple-border bg-apple-bg/42 p-3 dark:border-white/10 dark:bg-black/16">
      <div className={clsx('mb-1.5 flex items-center gap-1.5 text-[11px] font-black', isA ? 'text-apple-gold' : 'text-[#486B78] dark:text-[#8eb7c5]')}>
        {icon}
        {title}
      </div>
      <p className="text-xs leading-relaxed text-apple-text-muted">{content}</p>
    </div>
  );
}

function RiskDial({ value, tone }: { value: number; tone: 'a' | 'b' }) {
  const isA = tone === 'a';
  const color = isA ? 'var(--app-gold)' : '#486B78';

  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.42)]"
      style={{ background: `conic-gradient(${color} ${value * 3.6}deg, rgba(116,105,94,0.18) 0deg)` }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-apple-surface text-center dark:bg-[#101622]">
        <span className="text-[10px] font-bold text-apple-text-muted">风险</span>
        <span className={clsx('text-sm font-black', isA ? 'text-apple-gold' : 'text-[#486B78] dark:text-[#8eb7c5]')}>
          {value}
        </span>
      </div>
    </div>
  );
}
