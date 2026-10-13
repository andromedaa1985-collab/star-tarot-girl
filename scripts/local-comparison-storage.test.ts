import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeGeneratedStorageValue } from '../src/lib/generationTrace';

test('reload and backup normalization preserve local comparison snapshots without inventing AI generation metadata', () => {
  const comparison = { id: 'local', date: '2026-10-13T01:00:00Z', analysisKind: 'comparison', dilemma: 'Fictional choice', choiceA: 'A', choiceB: 'B', result: null, decisionCriteria: [{ id: 'one', label: 'Time', weight: 1, scoreA: 5, scoreB: 2 }] };
  const legacyAi = { id: 'ai', date: '2026-10-12T01:00:00Z', result: { advice: 'Saved legacy analysis' } };
  const normalized = normalizeGeneratedStorageValue('simulationHistory', [comparison, legacyAi]) as Array<Record<string, unknown>>;
  assert.deepEqual(normalized[0], comparison);
  assert.equal('generationId' in normalized[0], false);
  assert.equal('generationKind' in normalized[0], false);
  assert.equal(normalized[1].generationKind, 'simulator');
  assert.equal(typeof normalized[1].generationId, 'string');
});
