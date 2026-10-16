export interface DecisionCriterion {
  id: string;
  label: string;
  weight: number;
  scoreA: number;
  scoreB: number;
}

export interface SimulationResult {
  choiceA: SimulationBranch;
  choiceB: SimulationBranch;
  advice: string;
}

interface SimulationBranch {
  title: string;
  shortTerm: string;
  longTerm: string;
  riskLevel: number | null;
  baziFit: string;
}

export interface DecisionDraft {
  dilemma: string;
  choiceA: string;
  choiceB: string;
  decisionCriteria?: DecisionCriterion[];
}

export function prepareSimulationDraft(input: DecisionDraft): DecisionDraft {
  const choiceA = input.choiceA.trim();
  const choiceB = input.choiceB.trim();
  const dilemma = input.dilemma.trim() || (choiceA && choiceB ? `如何在「${choiceA}」与「${choiceB}」之间选择？` : '');
  return {
    dilemma,
    choiceA,
    choiceB,
    ...(input.decisionCriteria !== undefined ? { decisionCriteria: input.decisionCriteria.map(item => ({ ...item })) } : {}),
  };
}

export function createDefaultDecisionCriteria(): DecisionCriterion[] {
  return [
    { id: 'stability', label: '稳定性', weight: 3, scoreA: 3, scoreB: 3 },
    { id: 'growth', label: '成长空间', weight: 3, scoreA: 3, scoreB: 3 },
    { id: 'affordability', label: '负担可承受', weight: 3, scoreA: 3, scoreB: 3 },
  ];
}

export function readDecisionCriteria(value: unknown): DecisionCriterion[] | undefined {
  if (!Array.isArray(value) || !value.length || value.some(item => !item || typeof item !== 'object' || typeof item.label !== 'string' || typeof item.id !== 'string' || ![item.weight, item.scoreA, item.scoreB].every(number => typeof number === 'number' && Number.isFinite(number)))) return undefined;
  return value.map(item => ({ id: item.id, label: item.label, weight: item.weight, scoreA: item.scoreA, scoreB: item.scoreB }));
}

export function getDecisionCriteriaError(criteria: DecisionCriterion[]): string | null {
  if (!criteria.length) return '先添加比较标准，再调整重要程度。';
  if (criteria.some(item => !item.label?.trim())) return '请给每一项比较标准命名。';
  if (criteria.some(item => !Number.isFinite(item.weight) || item.weight < 0 || item.weight > 5)) return '重要程度需要在 0 到 5 之间。';
  if (criteria.some(item => ![item.scoreA, item.scoreB].every(score => Number.isInteger(score) && score >= 1 && score <= 5))) return 'A、B 自评分需要在 1 到 5 之间。';
  if (criteria.every(item => item.weight === 0)) return '至少给一项标准设置大于 0 的重要程度。';
  return null;
}

export function calculateDecisionMatrix(criteria: DecisionCriterion[]) {
  const error = getDecisionCriteriaError(criteria);
  if (error) return { error, scoreA: null, scoreB: null, preference: null, rows: [] };
  const totalWeight = criteria.reduce((sum, item) => sum + item.weight, 0);
  const scoreA = criteria.reduce((sum, item) => sum + item.weight * item.scoreA, 0) / totalWeight;
  const scoreB = criteria.reduce((sum, item) => sum + item.weight * item.scoreB, 0) / totalWeight;
  return {
    error: null,
    scoreA,
    scoreB,
    preference: Math.abs(scoreA - scoreB) < 0.000001 ? 'tie' as const : scoreA > scoreB ? 'a' as const : 'b' as const,
    rows: criteria.map(item => ({ ...item, normalizedWeight: item.weight / totalWeight })),
  };
}

export function validateSimulationInput(input: DecisionDraft): string | null {
  if (![input.choiceA, input.choiceB].every(value => value.trim())) return '请填写选择 A 和选择 B。';
  const comparable = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  if (comparable(input.choiceA) === comparable(input.choiceB)) return 'A、B 需要是不同的选择，才能进行比较。';
  return input.decisionCriteria ? getDecisionCriteriaError(input.decisionCriteria) : null;
}

export function getSimulationAction(hasAccess: boolean, input: DecisionDraft): { type: 'upgrade' } | { type: 'invalid'; error: string } | { type: 'generate' } {
  if (!hasAccess) return { type: 'upgrade' };
  const error = validateSimulationInput(input);
  return error ? { type: 'invalid', error } : { type: 'generate' };
}

export function createLocalComparisonEntry(input: DecisionDraft, metadata: { id: string; date: string }, lastSavedSignature?: string | null) {
  if (lastSavedSignature === decisionDraftSignature(input)) return { error: null, entry: null, duplicate: true };
  const error = validateSimulationInput(input) || (!input.decisionCriteria?.length ? '请填写比较标准后保存。' : null);
  if (error) return { error, entry: null, duplicate: false };
  const prepared = prepareSimulationDraft(input);
  const matrix = calculateDecisionMatrix(input.decisionCriteria!);
  const conclusion = matrix.preference === 'tie' ? 'A、B 当前自评分相同。' : `${matrix.preference === 'a' ? 'A' : 'B'} 更符合当前填写的偏好。`;
  return {
    error: null,
    duplicate: false,
    entry: {
      ...metadata,
      dilemma: prepared.dilemma, choiceA: prepared.choiceA, choiceB: prepared.choiceB,
      decisionCriteria: input.decisionCriteria!.map(item => ({ ...item, label: item.label.trim() })),
      result: null,
      analysisKind: 'comparison' as const,
      advice: `依据你填写的标准与自评分，A ${matrix.scoreA!.toFixed(2)} / 5，B ${matrix.scoreB!.toFixed(2)} / 5。${conclusion}这是主观偏好比较，不是成功概率。`,
    },
  };
}

export function decisionDraftSignature(input: DecisionDraft): string {
  return JSON.stringify([input.dilemma, input.choiceA, input.choiceB, input.decisionCriteria ?? null]);
}

export function hasDifferentDecisionDraft(current: DecisionDraft, incoming: DecisionDraft): boolean {
  const hasText = [current.dilemma, current.choiceA, current.choiceB].some(value => value.trim());
  const customCriteria = current.decisionCriteria && JSON.stringify(current.decisionCriteria) !== JSON.stringify(createDefaultDecisionCriteria());
  return Boolean(hasText || customCriteria) && decisionDraftSignature(current) !== decisionDraftSignature(incoming);
}

export function appendSimulationHistory<T>(history: T[], entry: T): T[] {
  return [entry, ...history];
}

export function normalizeSimulationResult(value: unknown, choiceA: string, choiceB: string, hideRisk = false): { result: SimulationResult; complete: boolean } {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  let complete = true;
  const text = (value: unknown, fallback: string) => {
    if (typeof value === 'string' && value.trim()) return value.trim();
    complete = false;
    return fallback;
  };
  const branch = (value: unknown, title: string): SimulationBranch => {
    const rawBranch = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const risk = rawBranch.riskLevel;
    const hasRisk = typeof risk === 'number' && Number.isFinite(risk) && risk >= 0 && risk <= 100;
    if (!hasRisk) complete = false;
    return {
      title: text(rawBranch.title, title || '未命名选择'),
      shortTerm: text(rawBranch.shortTerm, '短期信息暂不完整。先列出成本、准备时间和能否撤回。'),
      longTerm: text(rawBranch.longTerm, '长期信息暂不完整。建议先做小范围验证，再决定是否扩大投入。'),
      riskLevel: hasRisk && !hideRisk ? risk as number : null,
      baziFit: text(rawBranch.baziFit, '暂未提供完整契合分析，请结合自己的现实条件判断。'),
    };
  };
  const result = {
    choiceA: branch(raw.choiceA, choiceA),
    choiceB: branch(raw.choiceB, choiceB),
    advice: text(raw.advice, '服务暂时无法提供完整分析。先用你自己的比较标准找出差异，并核实最重要的一项现实条件。'),
  };
  return { result, complete };
}
