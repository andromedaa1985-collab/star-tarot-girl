import React, { useEffect, useRef, useState } from 'react';
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getStoredAccountSession } from '../lib/accountClient';
import { writeWorkspaceStorage } from '../lib/workspacePersistence';
import { useAppContext, type SimulationHistoryEntry } from '../store';
import { recordAppEvent } from '../lib/engagement';
import { clsx } from 'clsx';
import { buildUserAddressInstruction, parseAiJson, SIMULATOR_JSON_SYSTEM_PROMPT } from '../lib/aiPrompting';
import { DEEPSEEK_MAX_TOKENS, DEEPSEEK_TEXT_MODEL } from '../lib/aiModels';
import { SERVICE_FALLBACK } from '../lib/serviceFeedback';
import { createGenerationTrace } from '../lib/generationTrace';
import { apiFetch } from '../lib/apiClient';
import PageHeader from '../components/ui/PageHeader';
import { appendSimulationHistory, calculateDecisionMatrix, createDefaultDecisionCriteria, createLocalComparisonEntry, decisionDraftSignature, getSimulationAction, hasDifferentDecisionDraft, normalizeSimulationResult, readDecisionCriteria, type DecisionCriterion, type DecisionDraft, type SimulationResult } from '../lib/decisionMatrix';
import { formatRecordDate, matchesRecordQuery } from '../lib/recordSearch';
import { hasFeatureAccess } from '../lib/membership';

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

const clampRisk = (value: number | null) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;

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
  const delta = riskA == null || riskB == null ? null : Math.abs(riskA - riskB);
  const saferLine = delta == null ? '先核实现实条件' : delta < 8 ? '两条线提示接近' : riskA < riskB ? 'A 线提示更稳' : 'B 线提示更稳';
  const source = `${dilemma} ${choiceA} ${choiceB} ${result.advice} ${result.choiceA.title} ${result.choiceB.title}`;
  const keywords = SIMULATION_KEYWORD_HINTS.filter((keyword) => source.includes(keyword)).slice(0, 5);
  const advice = splitAdviceLines(result.advice);

  return {
    dateLabel: formatRecordDate(date),
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
  const workspaceOwner = useRef(getStoredAccountSession()?.user.id || null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { baziFormData, simulatorState, setSimulatorState, simulationHistory, setSimulationHistory, profiles, activeProfileId, setAppEvents, userName, preferredAddress, membership } = useAppContext();
  const [isSimulating, setIsSimulating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedPresetCategory, setSelectedPresetCategory] = useState<SimulationPresetCategory>('迷茫');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyLimit, setHistoryLimit] = useState(6);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [pendingReuse, setPendingReuse] = useState<DecisionDraft | null>(null);
  const reuseDialogRef = useRef<HTMLDialogElement>(null);
  const reuseCancelRef = useRef<HTMLButtonElement>(null);
  const requestActiveRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);
  const lastComparisonSignatureRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const dilemma = simulatorState.dilemma;
  const choiceA = simulatorState.choiceA;
  const choiceB = simulatorState.choiceB;
  const decisionCriteria = readDecisionCriteria(simulatorState.decisionCriteria) ?? createDefaultDecisionCriteria();
  const draft: DecisionDraft = { dilemma, choiceA, choiceB, decisionCriteria };
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const selectedRecordId = searchParams.get('record');
  const selectedRecord = simulationHistory.find(item => item.id === selectedRecordId);
  const draftRecord = simulatorState.result ? simulationHistory.find(item => item.dilemma === dilemma && item.choiceA === choiceA && item.choiceB === choiceB && JSON.stringify(item.result) === JSON.stringify(simulatorState.result)) : null;
  const source = selectedRecord || (simulatorState.result ? { date: draftRecord?.date, dilemma, choiceA, choiceB, result: simulatorState.result, decisionCriteria: draftRecord?.decisionCriteria ?? simulatorState.decisionCriteria, usedFallback: draftRecord?.usedFallback, analysisKind: 'ai' as const } : null);
  const isComparison = source?.analysisKind === 'comparison';
  const result = source && !isComparison ? normalizeSimulationResult(source.result, source.choiceA, source.choiceB, source.usedFallback).result : null;
  const filteredHistory = simulationHistory.filter(item => matchesRecordQuery(historyQuery, item.dilemma, item.choiceA, item.choiceB, item.advice, item.date));
  const simulatorUnlocked = hasFeatureAccess(membership, 'simulator');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; requestAbortRef.current?.abort(); };
  }, []);
  useEffect(() => { setHistoryLimit(6); }, [historyQuery]);
  useEffect(() => {
    if (!pendingReuse || !reuseDialogRef.current) return;
    reuseDialogRef.current.showModal();
    reuseCancelRef.current?.focus();
  }, [pendingReuse]);

  const updateDraft = (patch: Partial<DecisionDraft>) => {
    draftRef.current = { ...draftRef.current, ...patch };
    lastComparisonSignatureRef.current = null;
    setFormError(null);
    setSimulatorState(prev => ({ ...prev, ...patch, result: null }));
  };

  const setDilemma = (val: string) => {
    updateDraft({ dilemma: val });
  };
  const setChoiceA = (val: string) => {
    updateDraft({ choiceA: val });
  };
  const setChoiceB = (val: string) => {
    updateDraft({ choiceB: val });
  };
  const setResult = (val: SimulationResult | null) => setSimulatorState(prev => ({ ...prev, result: val }));

  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const currentBazi = activeProfile || baziFormData;
  const userAddressInstruction = buildUserAddressInstruction(preferredAddress, userName);
  const visiblePresets = SIMULATION_PRESETS.filter((preset) => preset.category === selectedPresetCategory);

  const applyPreset = (preset: SimulationPreset) => {
    updateDraft({ dilemma: preset.dilemma, choiceA: preset.choiceA, choiceB: preset.choiceB });
  };

  const closeRecord = () => { const next = new URLSearchParams(searchParams); next.delete('record'); setSearchParams(next, { replace: true }); };
  const openRecord = (id: string) => { const next = new URLSearchParams(searchParams); next.set('record', id); setSearchParams(next, { replace: true }); setHistoryNotice(null); };
  const reuseRecord = (item: SimulationHistoryEntry) => {
    const incoming: DecisionDraft = { dilemma: item.dilemma, choiceA: item.choiceA, choiceB: item.choiceB, decisionCriteria: readDecisionCriteria(item.decisionCriteria) ?? createDefaultDecisionCriteria() };
    if (hasDifferentDecisionDraft(draftRef.current, incoming)) setPendingReuse(incoming);
    else { updateDraft(incoming); closeRecord(); }
  };

  const saveLocalComparison = () => {
    const signature = decisionDraftSignature(draftRef.current);
    const saved = createLocalComparisonEntry(draftRef.current, { id: crypto.randomUUID(), date: new Date().toISOString() }, lastComparisonSignatureRef.current);
    if (saved.duplicate) {
      setHistoryNotice('这份本地比较已保存，修改输入后可以保存新的比较。');
      return;
    }
    if (saved.error || !saved.entry) { setFormError(saved.error); return; }
    lastComparisonSignatureRef.current = signature;
    setSimulationHistory(history => appendSimulationHistory(history, saved.entry!));
    setFormError(null);
    openRecord(saved.entry.id);
    setHistoryNotice('本地比较已保存到沙盘档案。');
  };

  const askTarotFromSimulation = async (providedSource?: {
    date?: string;
    dilemma: string;
    choiceA: string;
    choiceB: string;
    result?: SimulationResult | null;
    decisionCriteria?: DecisionCriterion[];
    advice?: string;
  }) => {
    const activeSource = providedSource || (source ? { ...source, result, advice: selectedRecord?.advice || result?.advice } : null);
    if (!activeSource) return;

    const archive = activeSource.result ? buildSimulationArchive({ ...activeSource, result: activeSource.result }) : { saferLine: '用户自评比较', keywords: activeSource.decisionCriteria?.map(item => item.label) || [] };
    const prompt = [
      `请沿着我的「沙盘推演档案」继续看。`,
      `当前问题：${activeSource.dilemma}`,
      `A 线：${activeSource.choiceA}`,
      `B 线：${activeSource.choiceB}`,
      `档案判断：${archive.saferLine}，关键词：${archive.keywords.join('、')}。`,
      ...(activeSource.advice ? [`记录结论：${activeSource.advice}`] : []),
      '我想知道今天最适合先验证哪一步，以及哪种代价要提前准备。',
    ].join('\n');

    try {
      if (!await writeWorkspaceStorage(workspaceOwner.current, 'draft:home:input', JSON.stringify(prompt))) return;
    } catch {
      // Draft handoff is optional. Navigation still works if storage is unavailable.
    }
    navigate('/app');
  };

  const handleSimulate = async () => {
    const action = getSimulationAction(hasFeatureAccess(membership, 'simulator'), draftRef.current);
    if (action.type === 'upgrade') {
      navigate('/app/profile?plus=1&plan=plus_monthly');
      return;
    }
    if (requestActiveRef.current) return;
    const requestDraft: DecisionDraft = { ...draftRef.current, decisionCriteria: draftRef.current.decisionCriteria?.map(item => ({ ...item })) };
    if (action.type === 'invalid') {
      setFormError(action.error);
      return;
    }

    requestActiveRef.current = true;
    const requestSignature = decisionDraftSignature(requestDraft);
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    setIsSimulating(true);
    setFormError(null);
    setResult(null);

    const finishSimulation = (safeResult: SimulationResult, usedFallback: boolean) => {
      if (!mountedRef.current || (getStoredAccountSession()?.user.id || null) !== workspaceOwner.current) return;
      const entry: SimulationHistoryEntry = {
        id: crypto.randomUUID(), date: new Date().toISOString(),
        dilemma: requestDraft.dilemma, choiceA: requestDraft.choiceA, choiceB: requestDraft.choiceB,
        decisionCriteria: requestDraft.decisionCriteria?.map(item => ({ ...item })),
        advice: safeResult.advice, result: safeResult,
        analysisKind: 'ai',
        ...createGenerationTrace('simulator', { model: DEEPSEEK_TEXT_MODEL, usedFallback }),
      };
      setSimulationHistory(prev => appendSimulationHistory(prev, entry));
      if (requestSignature === decisionDraftSignature(draftRef.current)) {
        setSimulatorState(prev => requestSignature === decisionDraftSignature({ dilemma: prev.dilemma, choiceA: prev.choiceA, choiceB: prev.choiceB, decisionCriteria: readDecisionCriteria(prev.decisionCriteria) ?? createDefaultDecisionCriteria() }) ? { ...prev, decisionCriteria: entry.decisionCriteria, result: safeResult } : prev);
        setFormError(usedFallback ? SERVICE_FALLBACK.simulator : null);
      } else {
        setHistoryNotice('推演已保存到沙盘档案，你修改后的草稿已保留。');
      }
      setAppEvents(events => recordAppEvent(events, 'simulation_run', { hasProfile: Boolean(currentBazi?.name) }));
    };

    try {
      let baziContext = '用户未提供八字信息。';
      if (currentBazi && currentBazi.name) {
        baziContext = `用户姓名：${currentBazi.name}，性别：${currentBazi.gender}，出生日期：${currentBazi.birthYear || currentBazi.birthDate} ${currentBazi.birthHour || currentBazi.birthTime}。`;
      }

      const prompt = `
你是一位精通命理学、心理学与概率推演的“人生沙盘推演大师”。
请根据用户的先天命理（如果有）和当前的困境，推演两条不同选择的平行宇宙发展路线。
请把输出写成可能的情境与需要验证的条件，不要声称可以预测事实。riskLevel 仅是你的主观风险提示分，不是成功或失败概率；命理部分只能作文化参考，不得替代现实证据。

【用户基础信息】
${baziContext}
${userAddressInstruction}

【当前人生岔路口】
困境描述：${requestDraft.dilemma}
选择A：${requestDraft.choiceA}
选择B：${requestDraft.choiceB}
用户自己的比较标准（仅是主观偏好，不是预测概率）：${requestDraft.decisionCriteria?.map(item => `${item.label}：重要程度 ${item.weight}/5，A 自评 ${item.scoreA}/5，B 自评 ${item.scoreB}/5`).join('；')}

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
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: DEEPSEEK_TEXT_MODEL,
            max_tokens: DEEPSEEK_MAX_TOKENS.simulator,
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
      const normalized = normalizeSimulationResult(parsedResult, requestDraft.choiceA, requestDraft.choiceB);
      if (!normalized.complete) usedFallbackSimulation = true;
      finishSimulation(normalized.result, usedFallbackSimulation);

    } catch (error: any) {
      console.error('Simulation Error:', error);
      finishSimulation(normalizeSimulationResult(null, requestDraft.choiceA, requestDraft.choiceB).result, true);
    } finally {
      window.clearTimeout(timeout);
      requestActiveRef.current = false;
      if (mountedRef.current) setIsSimulating(false);
    }
  };

  return (
    <div className="rail-page">
      <PageHeader eyebrow="把选择想清楚" title="命运沙盘" description="把纠结拆成两条路，看看短期变化、长期代价，以及你愿意承担的风险。" />
      <div className="rail-page-content space-y-6">
        <section className="rail-surface p-4">
          <div className="grid grid-cols-3 gap-3">
            <SignalPill label="命主" value={currentBazi?.name || '未绑定'} active={Boolean(currentBazi?.name)} />
            <SignalPill label="历史" value={`${simulationHistory.length} 次`} active={simulationHistory.length > 0} />
            <SignalPill label="模式" value="A/B" active />
          </div>
        </section>

        {formError && <p role="alert" className="rounded-2xl border border-apple-gold/22 bg-apple-gold/10 p-4 text-[15px] leading-7 text-apple-text">{formError}</p>}
        {historyNotice && <p role="status" className="rail-muted">{historyNotice}</p>}
        {selectedRecordId && !selectedRecord && <div role="status" className="rail-panel"><p>这条沙盘记录已不在当前存档中。</p><button type="button" onClick={closeRecord} className="rail-button-secondary mt-3">返回当前草稿</button></div>}

        {simulationHistory.length > 0 && (
          <section className="rounded-[20px] border border-apple-border bg-apple-surface p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-apple-text">
                <History size={16} className="text-apple-gold" />
                沙盘档案
              </div>
              <span className="text-[13px] text-apple-text-muted">共 {simulationHistory.length} 条</span>
            </div>
            <label htmlFor="simulation-history-search" className="rail-muted mb-2 block">搜索沙盘档案</label>
            <input id="simulation-history-search" type="search" value={historyQuery} onChange={event => setHistoryQuery(event.target.value)} placeholder="搜问题、选择或建议" className="rail-field mb-3" />
            <div className="grid gap-2 sm:grid-cols-3">
              {filteredHistory.slice(0, historyLimit).map((item) => (
                <React.Fragment key={item.id}>
                  <SimulationHistoryCard
                    item={item}
                    onOpen={() => openRecord(item.id)}
                    onReuse={() => reuseRecord(item)}
                    onContinue={() => askTarotFromSimulation({
                      date: item.date,
                      dilemma: item.dilemma,
                      choiceA: item.choiceA,
                      choiceB: item.choiceB,
                      result: item.analysisKind === 'comparison' ? null : normalizeSimulationResult(item.result, item.choiceA, item.choiceB, item.usedFallback).result,
                      decisionCriteria: readDecisionCriteria(item.decisionCriteria),
                      advice: item.advice,
                    })}
                  />
                </React.Fragment>
              ))}
            </div>
            {filteredHistory.length === 0 && <p className="rail-muted py-5 text-center">没有找到匹配的沙盘记录，试试其他关键词。</p>}
            {filteredHistory.length > historyLimit && <button type="button" onClick={() => setHistoryLimit(limit => limit + 6)} className="rail-button-secondary mt-3 w-full">加载更多（还有 {filteredHistory.length - historyLimit} 条）</button>}
          </section>
        )}

        <AnimatePresence mode="wait">
          {!source && (
            <motion.section
              key="input"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              className="space-y-4"
            >
              <div className="rail-panel">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="rail-section-title">不知道怎么问，先选方向</div>
                    <p className="mt-1 text-[13px] text-apple-text-muted">适合只有大概烦恼、还没组织好问题的时候。</p>
                  </div>
                </div>
                <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {PRESET_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={selectedPresetCategory === category}
                      onClick={() => setSelectedPresetCategory(category)}
                      className={clsx(
                        'rounded-full border px-2 py-2 text-[13px] font-medium transition-transform active:scale-[0.98]',
                        selectedPresetCategory === category
                          ? 'border-apple-gold/42 bg-apple-text text-apple-bg'
                          : 'border-apple-border bg-apple-surface text-apple-text-muted',
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
                      className="group rounded-[20px] border border-apple-border bg-apple-surface p-3 text-left transition-transform active:scale-[0.98]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-apple-text">{preset.label}</span>
                        <span className="rounded-full bg-apple-gold/12 px-2 py-0.5 text-[13px] font-medium text-apple-gold group-active:bg-apple-gold group-active:text-[#17130f]">
                          填入
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-apple-text-muted">{preset.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rail-panel">
                <div className="space-y-3">
                  <label htmlFor="simulation-dilemma" className="flex items-center gap-2 text-[15px] font-semibold text-apple-text">
                    <Compass size={16} className="text-apple-gold" />
                    当前岔路
                  </label>
                  <textarea id="simulation-dilemma" required
                    aria-describedby="simulation-form-hint"
                    value={dilemma}
                    onChange={(e) => setDilemma(e.target.value)}
                    placeholder="比如：现在工作稳定但消耗很大，另一个机会更有想象力，可风险也高。"
                    className="rail-field min-h-32 resize-y"
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

                <DecisionMatrix criteria={decisionCriteria} choiceA={choiceA} choiceB={choiceB} onChange={criteria => updateDraft({ decisionCriteria: criteria })} />
                <button type="button" onClick={saveLocalComparison} className="rail-button-secondary mt-5 w-full">保存这次本地比较</button>

                <p id="simulation-form-hint" className="rail-muted mt-4">本地比较和旧记录回看可直接使用，不调用 AI。{simulatorUnlocked ? '你已拥有双线推演权限，填写不同的 A、B 选择后可以补充生成式分析。' : 'Plus 解锁额外的生成式双线分析。'}</p>

                <button
                  onClick={handleSimulate}
                  disabled={isSimulating} aria-describedby="simulation-form-hint"
                  className="rail-button mt-5 w-full"
                >
                  <Sparkles size={18} />
                  {isSimulating ? '分析中，仍可调整草稿' : simulatorUnlocked ? '开始双线推演' : '查看 Plus 双线推演'}
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isSimulating && (
            <motion.section role="status" aria-label="正在校准两条时间线"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="rounded-[20px] border border-apple-border bg-apple-surface p-8 text-center"
            >
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[20px] border border-apple-gold/28 bg-apple-gold/12 text-apple-gold">
                <Loader2 size={34} className="animate-spin" />
              </div>
              <div className="mt-5 text-base font-semibold text-apple-text">正在校准两条时间线</div>
              <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-apple-text-muted">
                星轨会拆解短期阻力、长期代价和命理契合度，给你一个更清醒的选择视角。
              </p>
            </motion.section>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {source && (result || isComparison) && (!isSimulating || selectedRecord) && (
            <motion.section
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {selectedRecord && <div className="flex flex-wrap items-center justify-between gap-3"><p className="rail-muted">正在回看旧记录，当前草稿已保留。</p><button type="button" onClick={closeRecord} className="rail-button-secondary">返回当前草稿</button></div>}
              {isComparison ? <ComparisonArchivePanel date={source.date} dilemma={source.dilemma} choiceA={source.choiceA} choiceB={source.choiceB} advice={selectedRecord?.advice || ''} /> : <>
              {source.usedFallback && <p role="status" className="rail-muted">这条记录包含服务兜底内容，可先参考你保存的本地比较。</p>}
              <SimulationArchivePanel
                date={source.date}
                dilemma={source.dilemma}
                choiceA={source.choiceA}
                choiceB={source.choiceB}
                result={result!}
                onContinue={() => askTarotFromSimulation()}
              />
              </>}

              {readDecisionCriteria(source.decisionCriteria) ? <DecisionMatrix criteria={readDecisionCriteria(source.decisionCriteria)!} choiceA={source.choiceA} choiceB={source.choiceB} /> : <p className="rail-muted">这条旧记录没有保存比较评分。复用输入后可以建立新的标准。</p>}

              {result && <><div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <ResultBranch label="A 线" result={result.choiceA} tone="a" />
                <ResultBranch label="B 线" result={result.choiceB} tone="b" />
              </div>
              <div className="rail-panel relative overflow-hidden">
                <div className="pointer-events-none absolute right-4 top-4 text-apple-gold/10">
                  <Scale size={108} />
                </div>
                <div className="relative z-10 mb-3 flex items-center gap-2 text-[15px] font-semibold text-apple-gold">
                  <Sparkles size={16} />
                  破局建议
                </div>
                <p className="rail-reader relative z-10">
                  {result.advice}
                </p>
              </div>
              </>}

              <button
                onClick={() => selectedRecord ? reuseRecord(selectedRecord) : setResult(null)}
                className="rail-button-secondary w-full"
              >
                <RotateCcw size={16} />
                {selectedRecord ? '复用这条记录的输入' : '调整输入与比较标准'}
              </button>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
      <dialog ref={reuseDialogRef} aria-labelledby="simulation-reuse-title" onCancel={() => setPendingReuse(null)} onClose={() => setPendingReuse(null)} className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-apple-border bg-apple-surface p-6 text-apple-text backdrop:bg-black/45">
        <h2 id="simulation-reuse-title" className="rail-section-title">替换当前沙盘草稿？</h2>
        <p className="rail-body mt-3">当前输入或比较标准和这条记录不同。复用会替换草稿，已保存的历史记录仍会保留。</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button ref={reuseCancelRef} type="button" onClick={() => reuseDialogRef.current?.close()} className="rail-button-secondary">取消</button>
          <button type="button" onClick={() => { if (pendingReuse) { updateDraft(pendingReuse); closeRecord(); } reuseDialogRef.current?.close(); }} className="rail-button">替换草稿</button>
        </div>
      </dialog>
    </div>
  );
}

function ComparisonArchivePanel({ date, dilemma, choiceA, choiceB, advice }: { date?: string; dilemma: string; choiceA: string; choiceB: string; advice: string }) {
  return <section className="rail-panel" aria-labelledby="comparison-archive-title">
    <p className="rail-muted">本地比较 · {formatRecordDate(date)}</p>
    <h2 id="comparison-archive-title" className="rail-section-title mt-2">{dilemma}</h2>
    <dl className="mt-5 space-y-3"><div><dt className="rail-muted">选择 A</dt><dd className="rail-body mt-1">{choiceA}</dd></div><div><dt className="rail-muted">选择 B</dt><dd className="rail-body mt-1">{choiceB}</dd></div></dl>
    <p className="rail-body mt-5">{advice}</p>
    <p className="rail-muted mt-3">依据你保存的标准与自评分计算，没有生成 AI 推演。</p>
  </section>;
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
    <div className="rail-panel relative overflow-hidden">

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-semibold uppercase text-apple-gold">
            <Scale size={14} />
            推演档案
          </div>
          <h2 className="mt-1 line-clamp-2 text-xl font-semibold text-apple-text">{archive.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-apple-text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock3 size={12} />
              {archive.dateLabel}
            </span>
            <span>{archive.saferLine}</span>
            {archive.riskA != null && archive.riskB != null && <span>AI 风险提示分：A {archive.riskA} / B {archive.riskB}</span>}
          </div>
        </div>
        <button
          onClick={onContinue}
          className="shrink-0 rounded-full bg-apple-text px-3 py-2 text-[13px] font-semibold text-apple-bg transition-transform active:scale-[0.98]"
        >
          继续问
        </button>
      </div>

      <p className="rail-reader relative z-10 mt-5">
        {archive.summary}
      </p>

      <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
        {archive.keywords.map((keyword) => (
          <span key={keyword} className="rounded-full border border-apple-gold/22 bg-apple-gold/10 px-2.5 py-1 text-[13px] font-medium text-apple-gold">
            {keyword}
          </span>
        ))}
      </div>

      <div className="relative z-10 mt-4 grid gap-2 sm:grid-cols-3">
        {archive.timeline.map((item) => (
          <div key={item.label} className="rounded-[20px] border border-apple-border bg-apple-surface p-3">
            <div className="text-[13px] font-semibold text-apple-text">{item.label}</div>
            <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-apple-text-muted">{item.text}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onContinue}
        className="rail-button-secondary relative z-10 mt-4 w-full"
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
  onReuse,
  onContinue,
}: {
  item: SimulationHistoryEntry;
  onOpen: () => void;
  onReuse: () => void;
  onContinue: () => void;
}) {
  const archive = item.analysisKind === 'comparison' ? {
    dateLabel: formatRecordDate(item.date), summary: compactSimulationText(item.dilemma, 92),
    saferLine: '本地比较', keywords: readDecisionCriteria(item.decisionCriteria)?.map(criterion => criterion.label) || [],
  } : buildSimulationArchive({
    date: item.date,
    dilemma: item.dilemma,
    choiceA: item.choiceA,
    choiceB: item.choiceB,
    result: normalizeSimulationResult(item.result, item.choiceA, item.choiceB, item.usedFallback).result,
  });

  return (
    <div className="min-w-0 rounded-[20px] border border-apple-border bg-apple-surface p-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-apple-gold">
            <Scale size={12} />
            {archive.dateLabel}
          </div>
          <div className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-apple-text">{archive.summary}</div>
        </div>
        <div className="shrink-0 rounded-full bg-apple-gold/12 px-2 py-1 text-[13px] font-medium text-apple-gold">
          {archive.saferLine}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {archive.keywords.slice(0, 3).map((keyword, index) => (
          <span key={`${index}:${keyword}`} className="rounded-full bg-apple-bg px-2 py-0.5 text-[13px] text-apple-text-muted">
            {keyword}
          </span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full border border-apple-border bg-apple-surface px-3 py-2 text-[13px] font-semibold text-apple-text-muted transition-transform active:scale-[0.98]"
        >
          回看
        </button>
        <button type="button" onClick={onReuse} className="rounded-full border border-apple-border bg-apple-surface px-2 py-2 text-[13px] font-semibold text-apple-text-muted">复用</button>
        <button
          type="button"
          onClick={onContinue}
          className="rounded-full bg-apple-text px-3 py-2 text-[13px] font-semibold text-apple-bg transition-transform active:scale-[0.98]"
        >
          继续问
        </button>
      </div>
    </div>
  );
}

function DecisionMatrix({ criteria, choiceA, choiceB, onChange }: { criteria: DecisionCriterion[]; choiceA: string; choiceB: string; onChange?: (criteria: DecisionCriterion[]) => void }) {
  const matrix = calculateDecisionMatrix(criteria);
  const update = (index: number, patch: Partial<DecisionCriterion>) => onChange?.(criteria.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : { ...item }));
  const numberOptions = (start: number) => Array.from({ length: 6 - start }, (_, index) => start + index).map(value => <option key={value} value={value}>{value}</option>);

  return (
    <section className="mt-6 border-t border-apple-border pt-5" aria-label={onChange ? '本地选择比较' : '已保存的选择比较'}>
      <h3 className="rail-section-title">{onChange ? '按你在意的标准比较' : '你当时的比较标准'}</h3>
      <p className="rail-muted mt-2">重要程度 0–5，0 表示暂不考虑；自评分 1–5，分数越高表示越符合你的期待。</p>
      {onChange ? <div className="mt-4 space-y-5">
        {criteria.map((item, index) => <fieldset key={item.id} className="min-w-0">
          <legend className="rail-muted mb-2">标准 {index + 1}</legend>
          <label className="block"><span className="sr-only">标准 {index + 1} 名称</span><input value={item.label} onChange={event => update(index, { label: event.target.value })} maxLength={30} className="rail-field" /></label>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="rail-muted">重要程度<select aria-label={`${item.label || `标准 ${index + 1}`} 重要程度`} value={item.weight} onChange={event => update(index, { weight: Number(event.target.value) })} className="rail-field mt-1">{numberOptions(0)}</select></label>
            <label className="rail-muted">A 线自评<select aria-label={`${item.label || `标准 ${index + 1}`} A 线自评分`} value={item.scoreA} onChange={event => update(index, { scoreA: Number(event.target.value) })} className="rail-field mt-1">{numberOptions(1)}</select></label>
            <label className="rail-muted">B 线自评<select aria-label={`${item.label || `标准 ${index + 1}`} B 线自评分`} value={item.scoreB} onChange={event => update(index, { scoreB: Number(event.target.value) })} className="rail-field mt-1">{numberOptions(1)}</select></label>
          </div>
        </fieldset>)}
      </div> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">保存时的标准、权重和自评分</caption><thead><tr className="border-b border-apple-border"><th scope="col" className="py-2 pr-3">标准</th><th scope="col" className="py-2 pr-3">重要程度</th><th scope="col" className="py-2 pr-3">A</th><th scope="col" className="py-2">B</th></tr></thead><tbody>{criteria.map(item => <tr key={item.id} className="border-b border-apple-border"><th scope="row" className="py-3 pr-3 font-medium">{item.label}</th><td className="py-3 pr-3 tabular-nums">{item.weight}</td><td className="py-3 pr-3 tabular-nums">{item.scoreA}</td><td className="py-3 tabular-nums">{item.scoreB}</td></tr>)}</tbody></table></div>}
      <div aria-live="polite" aria-atomic="true" className="mt-5">
        {matrix.error ? <p className="text-sm leading-6 text-apple-text-muted">{matrix.error}</p> : <>
          <div className="grid grid-cols-2 gap-4"><div><p className="rail-muted break-words">A · {compactSimulationText(choiceA || '选择 A', 28)}</p><p className="mt-1 text-2xl font-medium tabular-nums">{matrix.scoreA!.toFixed(2)}<span className="ml-1 text-sm text-apple-text-muted">/ 5</span></p></div><div><p className="rail-muted break-words">B · {compactSimulationText(choiceB || '选择 B', 28)}</p><p className="mt-1 text-2xl font-medium tabular-nums">{matrix.scoreB!.toFixed(2)}<span className="ml-1 text-sm text-apple-text-muted">/ 5</span></p></div></div>
          <p className="mt-3 text-sm font-medium">{matrix.preference === 'tie' ? '当前自评分相同，可以先补充最重要的现实信息。' : `${matrix.preference === 'a' ? 'A' : 'B'} 线更符合你当前填写的偏好。`}</p>
          <p className="rail-muted mt-2">权重占比：{matrix.rows.map(item => `${item.label} ${(item.normalizedWeight * 100).toFixed(0)}%`).join(' · ')}</p>
        </>}
      </div>
      <p className="rail-muted mt-3">计算方式：各项「重要程度 × 自评分」之和，除以总重要程度。结果只是你的偏好分，不是成功概率，也不代表未来会按分数发生。</p>
    </section>
  );
}

function SignalPill({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-apple-border bg-apple-surface px-3 py-2">
      <div className="text-[13px] font-medium text-apple-text-muted">{label}</div>
      <div className={clsx('mt-0.5 truncate text-[15px] font-semibold', active ? 'text-apple-text' : 'text-apple-text-muted')}>
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
    <div className="rounded-2xl border border-apple-border bg-apple-bg p-4">
      <label htmlFor={`simulation-choice-${tone}`} className="mb-3 flex items-center gap-2 text-[15px] font-medium text-apple-text">
        <span className={clsx(
          'flex h-6 w-6 items-center justify-center rounded-full text-[13px]',
          isA ? 'bg-apple-text text-apple-bg' : 'bg-[#486B78] text-white dark:bg-[#8eb7c5] dark:text-[#071018]',
        )}>
          {isA ? 'A' : 'B'}
        </span>
        {label}
      </label>
      <input id={`simulation-choice-${tone}`} required
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="rail-field"
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
      'relative overflow-hidden rounded-[20px] border bg-apple-surface p-4',
      isA ? 'border-apple-gold/28' : 'border-[#486B78]/30',
    )}>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={clsx('mb-2 inline-flex rounded-full px-2.5 py-1 text-[13px] font-semibold', isA ? 'bg-apple-text text-apple-bg' : 'bg-[#486B78] text-white dark:bg-[#8eb7c5] dark:text-[#071018]')}>
            {label}
          </div>
          <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-apple-text">{result.title}</h3>
        </div>
        {risk != null && <RiskDial value={risk} tone={tone} />}
      </div>

      <div className="space-y-3">
        <ResultPoint icon={<Compass size={13} />} title="短期变化" content={result.shortTerm} tone={tone} />
        <ResultPoint icon={<ArrowRight size={13} />} title="长期走向" content={result.longTerm} tone={tone} />
        <ResultPoint icon={<CheckCircle2 size={13} />} title="命理契合" content={result.baziFit} tone={tone} />
      </div>

      <div className="mt-4 rounded-2xl border border-apple-border bg-apple-bg p-3">
        <div className="mb-2 flex items-center justify-between text-[13px]">
          <span className="flex items-center gap-1 font-medium text-apple-text-muted">
            <AlertTriangle size={12} />
            AI 风险提示
          </span>
          <span className={clsx('font-semibold', isA ? 'text-apple-gold' : 'text-[#486B78] dark:text-[#8eb7c5]')}>
            {risk == null ? '信息不足，尚无提示分' : `${getRiskLabel(risk)} · ${risk} / 100`}
          </span>
        </div>
        {risk != null && <div className="h-2 overflow-hidden rounded-full bg-apple-border/30">
          <div
            className={clsx('h-full rounded-full transition-all', isA ? 'bg-apple-gold' : 'bg-[#486B78] dark:bg-[#8eb7c5]')}
            style={{ width: `${risk}%` }}
          />
        </div>}
        <p className="rail-muted mt-2">生成内容仅供梳理，提示分不是概率，请核实费用、时间与退出条件。</p>
      </div>
    </div>
  );
}

function ResultPoint({ icon, title, content, tone }: { icon: React.ReactNode; title: string; content: string; tone: 'a' | 'b' }) {
  const isA = tone === 'a';
  return (
    <div className="rounded-2xl border border-apple-border bg-apple-bg p-3">
      <div className={clsx('mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold', isA ? 'text-apple-gold' : 'text-[#486B78] dark:text-[#8eb7c5]')}>
        {icon}
        {title}
      </div>
      <p className="rail-body">{content}</p>
    </div>
  );
}

function RiskDial({ value, tone }: { value: number; tone: 'a' | 'b' }) {
  const isA = tone === 'a';
  const color = isA ? 'var(--app-gold)' : '#486B78';

  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full p-[3px]"
      style={{ background: `conic-gradient(${color} ${value * 3.6}deg, rgba(116,105,94,0.18) 0deg)` }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-apple-surface text-center">
        <span className="text-[13px] font-medium text-apple-text-muted">风险</span>
        <span className={clsx('text-[15px] font-semibold', isA ? 'text-apple-gold' : 'text-[#486B78] dark:text-[#8eb7c5]')}>
          {value}
        </span>
      </div>
    </div>
  );
}
