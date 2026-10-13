import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterTarotArchive, getReadingSource } from '../src/lib/tarotArchiveSearch';
import { formatArchiveTime, getRecentProfileRecords } from '../src/lib/profileRecords';
import type { DiaryEntry, SimulationHistoryEntry, TarotReading } from '../src/store';

const readings: TarotReading[] = [
  { id: 'new', date: '2026-10-13', question: '项目怎么开始', cards: '塔（逆位）', summary: '简短摘要', usedFallback: false, model: 'deepseek-chat' },
  { id: 'old', date: '2026-09-01', question: '关系沟通', cards: '恋人', summary: '先倾听', usedFallback: true, model: 'local-fallback' },
  { id: 'legacy', date: '2026-10-12', question: '今天', cards: '星星', summary: '休息' },
];

test('tarot archive search includes the full saved answer and combines date and source filters', () => {
  const matches = filterTarotArchive(readings, { query: '项目 先整理', range: '7d', source: 'ai', now: new Date(2026, 9, 13) }, reading => reading.id === 'new' ? '先整理桌面，再开始项目' : reading.summary);
  assert.deepEqual(matches.map(record => record.id), ['new']);
  assert.equal(readings.length, 3);
  assert.equal(filterTarotArchive(readings, { query: '关系', range: '7d', source: 'all', now: new Date(2026, 9, 13) }).length, 0);
});

test('legacy readings are not falsely labelled as verified AI and clearing filters retains every archive', () => {
  assert.equal(getReadingSource(readings[2]), 'unknown');
  assert.equal(getReadingSource(readings[1]), 'fallback');
  assert.deepEqual(filterTarotArchive(readings, { query: '', range: 'all', source: 'all' }), readings);
});

test('the personal record hub interleaves actual dates and uses working encoded routes for each record kind', () => {
  const diaries = [{ id: '日记 / 1', date: '2026-10-14', content: '今天记录', tags: [], mood: 'neutral' }] as DiaryEntry[];
  const simulations = [{ id: 'sim1', date: 'bad date', dilemma: '做选择' }] as SimulationHistoryEntry[];
  const records = getRecentProfileRecords(readings, diaries, simulations, 10);
  assert.equal(records[0].kind, 'diary');
  assert.equal(records[0].href, '/app/diary?entry=%E6%97%A5%E8%AE%B0%20%2F%201');
  assert.equal(records[1].href, '/app?history=1&reading=new');
  assert.equal(records.at(-1)?.href, '/app/simulator?record=sim1');
  assert.equal(formatArchiveTime('bad date', '未确认'), '未确认');
  assert.equal(getRecentProfileRecords([], [], []).length, 0);
});
