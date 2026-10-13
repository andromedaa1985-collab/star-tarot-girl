import assert from 'node:assert/strict';
import test from 'node:test';
import { appendSimulationHistory, calculateDecisionMatrix, createDefaultDecisionCriteria, createLocalComparisonEntry, decisionDraftSignature, getSimulationAction, hasDifferentDecisionDraft, normalizeSimulationResult, readDecisionCriteria, validateSimulationInput } from '../src/lib/decisionMatrix';

test('weighted preference reflects the users own importance and ratings', () => {
  const criteria = [
    { id: 'a', label: '稳定', weight: 3, scoreA: 5, scoreB: 2 },
    { id: 'b', label: '成长', weight: 1, scoreA: 1, scoreB: 5 },
    { id: 'c', label: '休息', weight: 0, scoreA: 1, scoreB: 5 },
  ];
  const result = calculateDecisionMatrix(criteria);
  assert.equal(result.scoreA, 4);
  assert.equal(result.scoreB, 2.75);
  assert.equal(result.preference, 'a');
  assert.deepEqual(result.rows.map(item => item.normalizedWeight), [0.75, 0.25, 0]);
  const updated = calculateDecisionMatrix(criteria.map(item => ({ ...item, weight: item.id === 'a' ? 1 : item.id === 'b' ? 5 : 0 })));
  assert.equal(updated.preference, 'b');
});

test('equal scores stay tied instead of manufacturing a preferred choice', () => {
  const result = calculateDecisionMatrix(createDefaultDecisionCriteria());
  assert.equal(result.preference, 'tie');
  assert.equal(result.scoreA, 3);
  assert.equal(result.scoreB, 3);
});

test('zero weight and invalid ratings produce actionable errors without NaN totals', () => {
  const zero = calculateDecisionMatrix(createDefaultDecisionCriteria().map(item => ({ ...item, weight: 0 })));
  assert.match(zero.error!, /大于 0/);
  assert.equal(zero.scoreA, null);
  assert.equal(zero.scoreB, null);
  for (const patch of [{ weight: -1 }, { weight: Infinity }, { weight: 6 }, { scoreA: 0 }, { scoreB: 6 }, { scoreA: 2.5 }, { label: '   ' }]) {
    assert.ok(calculateDecisionMatrix(createDefaultDecisionCriteria().map((item, index) => index === 0 ? { ...item, ...patch } : item)).error);
  }
});

test('simulation rejects blank and equivalent options before any generation', () => {
  const base = { dilemma: '是否换工作', choiceA: '留在公司', choiceB: '换新工作', decisionCriteria: createDefaultDecisionCriteria() };
  assert.equal(validateSimulationInput(base), null);
  assert.match(validateSimulationInput({ ...base, dilemma: '  ' })!, /填写/);
  assert.match(validateSimulationInput({ ...base, choiceA: 'Stay   Here', choiceB: ' stay here ' })!, /不同/);
});

test('AI action preserves the paywall before validating free local-comparison input', () => {
  const empty = { dilemma: '', choiceA: '', choiceB: '', decisionCriteria: createDefaultDecisionCriteria().map(item => ({ ...item, weight: 0 })) };
  assert.deepEqual(getSimulationAction(false, empty), { type: 'upgrade' });
  assert.equal(getSimulationAction(true, empty).type, 'invalid');
  const valid = { dilemma: '如何选择', choiceA: '留下', choiceB: '离开', decisionCriteria: createDefaultDecisionCriteria() };
  assert.deepEqual(getSimulationAction(false, valid), { type: 'upgrade' });
  assert.deepEqual(getSimulationAction(true, valid), { type: 'generate' });
  assert.equal(calculateDecisionMatrix(valid.decisionCriteria).preference, 'tie');
});

test('request signature detects edits to both input and comparison settings', () => {
  const draft = { dilemma: '做哪一个项目', choiceA: 'A', choiceB: 'B', decisionCriteria: createDefaultDecisionCriteria() };
  const captured = decisionDraftSignature(draft);
  assert.equal(decisionDraftSignature({ ...draft, decisionCriteria: draft.decisionCriteria.map(item => ({ ...item })) }), captured);
  assert.notEqual(decisionDraftSignature({ ...draft, choiceB: 'C' }), captured);
  assert.notEqual(decisionDraftSignature({ ...draft, decisionCriteria: draft.decisionCriteria.map((item, index) => index === 1 ? { ...item, scoreA: 5 } : item) }), captured);
});

test('reusing history distinguishes an empty form, equal input and meaningful changed drafts', () => {
  const incoming = { dilemma: '选择', choiceA: 'A', choiceB: 'B', decisionCriteria: createDefaultDecisionCriteria() };
  assert.equal(hasDifferentDecisionDraft({ dilemma: '', choiceA: '', choiceB: '', decisionCriteria: createDefaultDecisionCriteria() }, incoming), false);
  assert.equal(hasDifferentDecisionDraft({ ...incoming }, incoming), false);
  assert.equal(hasDifferentDecisionDraft({ ...incoming, dilemma: '新的选择' }, incoming), true);
  assert.equal(hasDifferentDecisionDraft({ dilemma: '', choiceA: '', choiceB: '', decisionCriteria: createDefaultDecisionCriteria().map(item => ({ ...item, weight: 5 })) }, incoming), true);
});

test('history retains records beyond the former thirty-record limit', () => {
  const previous = Array.from({ length: 40 }, (_, id) => ({ id }));
  const next = appendSimulationHistory(previous, { id: 40 });
  assert.equal(next.length, 41);
  assert.equal(next[0].id, 40);
  assert.equal(next.at(-1)?.id, 39);
  assert.equal(previous.length, 40);
});

test('old records do not acquire invented criteria and malformed criteria are safely absent', () => {
  assert.equal(readDecisionCriteria(undefined), undefined);
  assert.equal(readDecisionCriteria([null]), undefined);
  assert.equal(readDecisionCriteria([{ id: 'a', label: '成本', weight: '5', scoreA: 1, scoreB: 2 }]), undefined);
  const source = createDefaultDecisionCriteria();
  const restored = readDecisionCriteria(source)!;
  restored[0].scoreA = 5;
  assert.equal(source[0].scoreA, 3);
});

test('partial or malformed AI results are readable without fabricated risk values', () => {
  for (const raw of [null, [], {}, { choiceA: null, choiceB: 'bad', advice: 3 }, { choiceA: { title: 'A', riskLevel: '75' }, choiceB: { title: 'B', riskLevel: Infinity }, advice: '建议' }]) {
    const normalized = normalizeSimulationResult(raw, '留下', '离开');
    assert.equal(normalized.complete, false);
    assert.ok(normalized.result.choiceA.shortTerm);
    assert.ok(normalized.result.choiceB.longTerm);
    assert.equal(normalized.result.choiceA.riskLevel, null);
    assert.equal(normalized.result.choiceB.riskLevel, null);
    assert.ok(normalized.result.advice);
  }
});

test('complete analysis preserves valid zero risk while fallback records suppress legacy invented risks', () => {
  const branch = { title: '选项', shortTerm: '短期', longTerm: '长期', baziFit: '契合', riskLevel: 0 };
  const raw = { choiceA: branch, choiceB: { ...branch, riskLevel: 65 }, advice: '建议' };
  const normalized = normalizeSimulationResult(raw, 'A', 'B');
  assert.equal(normalized.complete, true);
  assert.equal(normalized.result.choiceA.riskLevel, 0);
  assert.equal(normalizeSimulationResult(raw, 'A', 'B', true).result.choiceB.riskLevel, null);
  assert.equal(raw.choiceB.riskLevel, 65);
});

test('local save records a distinct comparison with input, date and an independent criteria snapshot', () => {
  const draft = { dilemma: '  留下还是出发  ', choiceA: ' 留下 ', choiceB: ' 出发 ', decisionCriteria: createDefaultDecisionCriteria() };
  draft.decisionCriteria[0].scoreA = 5;
  draft.decisionCriteria[0].scoreB = 1;
  const saved = createLocalComparisonEntry(draft, { id: 'local-1', date: '2024-03-02T12:00:00.000Z' });
  assert.equal(saved.error, null);
  assert.equal(saved.entry!.analysisKind, 'comparison');
  assert.equal(saved.entry!.result, null);
  assert.equal(saved.entry!.dilemma, '留下还是出发');
  assert.equal(saved.entry!.date, '2024-03-02T12:00:00.000Z');
  assert.match(saved.entry!.advice, /A 3\.67 \/ 5，B 2\.33 \/ 5/);
  assert.match(saved.entry!.advice, /A 更符合当前填写的偏好/);
  assert.equal('generationId' in saved.entry!, false);
  assert.equal('model' in saved.entry!, false);
  draft.decisionCriteria[0].scoreA = 1;
  draft.decisionCriteria[0].label = '已改标准';
  assert.equal(saved.entry!.decisionCriteria[0].scoreA, 5);
  assert.equal(saved.entry!.decisionCriteria[0].label, '稳定性');
  const restored = JSON.parse(JSON.stringify(saved.entry));
  assert.deepEqual(readDecisionCriteria(restored.decisionCriteria), saved.entry!.decisionCriteria);
  assert.equal(restored.analysisKind, 'comparison');
  assert.equal(restored.result, null);
});

test('saving tied local ratings states the tie without an AI forecast', () => {
  const saved = createLocalComparisonEntry({ dilemma: '选一个方向', choiceA: 'A', choiceB: 'B', decisionCriteria: createDefaultDecisionCriteria() }, { id: 'tie', date: '2024-01-01' });
  assert.match(saved.entry!.advice, /A、B 当前自评分相同/);
  assert.match(saved.entry!.advice, /主观偏好比较，不是成功概率/);
  assert.equal(saved.entry!.result, null);
});

test('local save rejects missing input, duplicate choices, absent criteria and zero weights', () => {
  const base = { dilemma: '选择', choiceA: 'A', choiceB: 'B', decisionCriteria: createDefaultDecisionCriteria() };
  for (const invalid of [{ ...base, dilemma: ' ' }, { ...base, choiceB: ' a ' }, { ...base, decisionCriteria: undefined }, { ...base, decisionCriteria: base.decisionCriteria.map(item => ({ ...item, weight: 0 })) }]) {
    const saved = createLocalComparisonEntry(invalid, { id: 'invalid', date: '2024-01-01' });
    assert.ok(saved.error);
    assert.equal(saved.entry, null);
  }
});

test('synchronous signature guard saves one entry for repeated clicks and accepts a changed comparison', () => {
  const draft = { dilemma: '选择', choiceA: 'A', choiceB: 'B', decisionCriteria: createDefaultDecisionCriteria() };
  let signature: string | null = null;
  let history: Array<NonNullable<ReturnType<typeof createLocalComparisonEntry>['entry']>> = [];
  const save = (input: typeof draft, id: string) => {
    const saved = createLocalComparisonEntry(input, { id, date: '2024-01-01' }, signature);
    if (saved.entry) {
      signature = decisionDraftSignature(input);
      history = appendSimulationHistory(history, saved.entry);
    }
    return saved;
  };
  assert.equal(save(draft, 'first').duplicate, false);
  assert.equal(save(draft, 'repeat').duplicate, true);
  assert.equal(history.length, 1);
  const revised = { ...draft, decisionCriteria: draft.decisionCriteria.map((item, index) => index === 0 ? { ...item, scoreA: 5 } : item) };
  assert.equal(save(revised, 'revised').duplicate, false);
  assert.equal(history.length, 2);
  assert.equal(history[0].id, 'revised');
  assert.equal(history[1].decisionCriteria[0].scoreA, 3);
});
