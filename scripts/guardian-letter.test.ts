import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendGuardianStarter, getGuardianLetterState, normalizeGuardianDate, shouldRewardGuardianLetter } from '../src/lib/guardianLetter';

const today = '2026-10-13';
const status = (usedFallback: boolean) => ({ date: today, usedFallback, generatedAt: `${today}T04:00:00.000Z` });

test('existing zh-CN letter dates still count as today without accepting invalid calendar dates', () => {
  assert.equal(normalizeGuardianDate('2026/10/13'), today);
  assert.equal(normalizeGuardianDate('2026-2-28'), '2026-02-28');
  assert.equal(normalizeGuardianDate('2026/2/29'), null);
  assert.equal(normalizeGuardianDate('2026/13/1'), null);
  assert.equal(getGuardianLetterState(today, '今天的来信', '2026/10/13', undefined).completed, true);
});

test('a failed letter remains retryable after reload and never awards the daily completion reward', () => {
  const failed = getGuardianLetterState(today, '回访服务刚才不稳定，先留一封保底回访。', today, status(true));
  assert.equal(failed.hasToday, true);
  assert.equal(failed.completed, false);
  assert.equal(failed.canGenerate, true);
  assert.equal(shouldRewardGuardianLetter(failed, true), false);
  assert.equal(shouldRewardGuardianLetter(failed, false), true);
});

test('successful retry completes the day and cannot award the same day again', () => {
  const completed = getGuardianLetterState(today, '今天先走到窗边看看天空。', today, status(false));
  assert.equal(completed.completed, true);
  assert.equal(completed.canGenerate, false);
  assert.equal(shouldRewardGuardianLetter(completed, false), false);
  const tomorrow = getGuardianLetterState('2026-10-14', '今天先走到窗边看看天空。', today, status(false));
  assert.equal(tomorrow.canGenerate, true);
  assert.equal(shouldRewardGuardianLetter(tomorrow, false), true);
});

test('older fallback letters lacking metadata are migrated as retryable, while empty letters never complete a day', () => {
  assert.equal(getGuardianLetterState(today, '回访服务刚才不稳定，我先留下一封保底回访。', '2026/10/13', undefined).canGenerate, true);
  assert.equal(getGuardianLetterState(today, ' ', today, status(false)).completed, false);
  assert.equal(getGuardianLetterState(today, null, null, undefined).canGenerate, true);
});

test('starter prompts retain the existing draft and repeated selection does not duplicate the same sentence', () => {
  const starter = '今天我想先照顾自己一件小事：';
  assert.equal(appendGuardianStarter('', starter), starter);
  const combined = appendGuardianStarter('我想先把工作说清楚。', starter);
  assert.equal(combined, `我想先把工作说清楚。\n${starter}`);
  assert.equal(appendGuardianStarter(combined, starter), combined);
});
