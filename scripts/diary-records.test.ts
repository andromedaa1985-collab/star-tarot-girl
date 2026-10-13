import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterDiaryEntries, getDiarySourceSignature, isDiaryReviewCurrent, parseDiaryTags, updateDiaryEntry } from '../src/lib/diaryRecords';
import type { DiaryEntry } from '../src/store';

const entries: DiaryEntry[] = [
  { id: 'work', date: '2026-10-12', mood: 'bad', content: '项目交付让我有些焦虑，今晚先整理任务。', tags: ['工作', '压力'] },
  { id: 'walk', date: '2026-10-13', mood: 'good', content: '公园散步很舒服，遇到了一只猫。', tags: ['散步', '生活'] },
  { id: 'rest', date: '2026-10-13', mood: 'bad', content: '工作结束后散步，压力轻了一点。', tags: ['工作', '散步'] },
];

test('editing a diary updates only the chosen record and retains its original identity and date', () => {
  const next = updateDiaryEntry(entries, 'work', { content: '  今天把任务拆小了。  ', mood: 'neutral', tags: ['工作'] }, '2026-10-13T02:00:00.000Z');
  assert.equal(next.length, entries.length);
  assert.equal(next[0].id, 'work');
  assert.equal(next[0].date, '2026-10-12');
  assert.equal(next[0].content, '今天把任务拆小了。');
  assert.equal(next[0].updatedAt, '2026-10-13T02:00:00.000Z');
  assert.equal(next[1], entries[1]);
  assert.equal(entries[0].content, '项目交付让我有些焦虑，今晚先整理任务。');
});

test('an empty edit is rejected and a missing target does not create another diary', () => {
  assert.equal(updateDiaryEntry(entries, 'work', { content: ' \n ', mood: 'good', tags: [] }, 'now'), entries);
  const missing = updateDiaryEntry(entries, 'deleted', { content: '新的内容', mood: 'good', tags: [] }, 'now');
  assert.deepEqual(missing, entries);
});

test('diary keywords, exact mood and exact tag filters intersect without changing stored entries', () => {
  const filtered = filterDiaryEntries(entries, { query: '工作 散步', mood: 'bad', tag: '工作' });
  assert.deepEqual(filtered.map(entry => entry.id), ['rest']);
  assert.equal(entries.length, 3);
  assert.deepEqual(filterDiaryEntries(entries, { query: '2026-10-13', mood: 'all', tag: '' }).map(entry => entry.id), ['walk', 'rest']);
  assert.equal(filterDiaryEntries(entries, { query: '不存在的关键词', mood: 'all', tag: '' }).length, 0);
  assert.deepEqual(filterDiaryEntries(entries, { query: ' ', mood: 'all', tag: '' }), entries);
});

test('tag input handles both Chinese and English separators and removes duplicates', () => {
  assert.deepEqual(parseDiaryTags(' 工作，压力 工作,生活\n '), ['工作', '压力', '生活']);
});

test('a review fingerprint stays compact and ignores record order, tag order and edit timestamps', () => {
  const signature = getDiarySourceSignature(entries);
  assert.ok(signature.length < 50);
  assert.ok(!signature.includes(entries[0].content));
  const reordered = [...entries].reverse().map(entry => ({ ...entry, tags: [...entry.tags].reverse(), updatedAt: 'later' }));
  assert.equal(getDiarySourceSignature(reordered), signature);
  assert.equal(isDiaryReviewCurrent({ sourceSignature: signature }, reordered), true);
});

test('content, mood, date, tags and deleted sources each invalidate a previous review', () => {
  const review = { sourceSignature: getDiarySourceSignature(entries) };
  for (const change of [{ content: '其他内容' }, { mood: 'awful' as const }, { date: '2026-10-11' }, { tags: ['家庭'] }]) {
    assert.equal(isDiaryReviewCurrent(review, [{ ...entries[0], ...change }, ...entries.slice(1)]), false);
  }
  assert.equal(isDiaryReviewCurrent(review, entries.slice(1)), false);
  assert.equal(isDiaryReviewCurrent({}, entries), false);
});
