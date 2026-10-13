import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatRecordDate, getRecordTime, isWithinRecordRange, matchesRecordQuery } from '../src/lib/recordSearch';

test('record queries match Chinese body text, array tags and every query token without changing records', () => {
  assert.equal(matchesRecordQuery(' 项目 焦虑 ', '今天准备项目', ['工作', '焦虑']), true);
  assert.equal(matchesRecordQuery('工作 轻松', '工作时有点焦虑'), false);
  assert.equal(matchesRecordQuery('TOWER', 'The Tower'), true);
  assert.equal(matchesRecordQuery('   ', undefined), true);
});

test('date-only records use local calendar days and reject overflow dates', () => {
  assert.equal(getRecordTime('2026-10-13'), new Date(2026, 9, 13).getTime());
  assert.equal(getRecordTime('2026-02-30'), null);
  assert.equal(getRecordTime('2024-02-29'), new Date(2024, 1, 29).getTime());
});

test('recent ranges include today and the first day while excluding the previous day and future days', () => {
  const now = new Date(2026, 9, 13, 15);
  assert.equal(isWithinRecordRange('2026-10-07', '7d', now), true);
  assert.equal(isWithinRecordRange('2026-10-06', '7d', now), false);
  assert.equal(isWithinRecordRange('2026-10-13', '7d', now), true);
  assert.equal(isWithinRecordRange('2026-10-14', '7d', now), false);
  assert.equal(isWithinRecordRange('2026-09-14', '30d', now), true);
  assert.equal(isWithinRecordRange('2026-09-13', '30d', now), false);
});

test('all-record view retains legacy records with missing dates, with an honest display label', () => {
  assert.equal(isWithinRecordRange(undefined, 'all'), true);
  assert.equal(isWithinRecordRange('invalid', '7d'), false);
  assert.equal(formatRecordDate('invalid'), '日期未记录');
});
