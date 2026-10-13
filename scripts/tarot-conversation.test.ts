import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendTarotReading, getRegenerationSource, removeTarotReading, replaceTarotAnswer } from '../src/lib/tarotConversation';
import type { Message, TarotReading } from '../src/store';

const reading = (id: string, date = '2026-10-10T08:00:00.000Z'): TarotReading => ({
  id, date, question: `问题 ${id}`, cards: '星星（正位）', summary: `解读 ${id}`,
  cardImage: `/tarot/${id}.png`, generationId: `generation-${id}`,
});

test('an expired membership preserves all 200 archived readings when its new-record quota is 30', () => {
  const archive = Array.from({ length: 200 }, (_, index) => reading(String(index)));
  const next = appendTarotReading(archive, reading('new'), 30);
  assert.equal(next, archive);
  assert.equal(next.length, 200);
  assert.deepEqual(next.map((item) => item.id), archive.map((item) => item.id));
});

test('the final available slot saves a new reading without changing earlier records, then rejects overflow', () => {
  const archive = Array.from({ length: 29 }, (_, index) => reading(String(index)));
  const accepted = appendTarotReading(archive, reading('new'), 30);
  assert.equal(accepted.length, 30);
  assert.equal(accepted[0].id, 'new');
  assert.deepEqual(accepted.slice(1), archive);
  assert.equal(appendTarotReading(accepted, reading('overflow'), 30), accepted);
});

test('regenerating an earlier draw or follow-up keeps its own question and original cards after a later draw', () => {
  const oldReading = reading('A');
  const laterReading = reading('C', '2026-10-10T09:00:00.000Z');
  const start = Date.parse(oldReading.date);
  const messages: Message[] = [
    { id: 'user-A', role: 'user', text: oldReading.question, timestamp: start - 1 },
    { id: 'answer-A', role: 'ai', text: 'A 的解读', timestamp: start + 1, cardImage: oldReading.cardImage, generationId: oldReading.generationId, generationKind: 'tarot' },
    { id: 'user-B', role: 'user', text: '问题 B：为什么？', timestamp: start + 2 },
    { id: 'answer-B', role: 'ai', text: 'B 的解读', timestamp: start + 3, generationKind: 'tarot_followup' },
    { id: 'user-C', role: 'user', text: laterReading.question, timestamp: start + 3600000 - 1 },
    { id: 'answer-C', role: 'ai', text: 'C 的解读', timestamp: start + 3600000 + 1, cardImage: laterReading.cardImage, generationId: laterReading.generationId, generationKind: 'tarot' },
  ];
  const original = getRegenerationSource(messages, [laterReading, oldReading], 'answer-A');
  const followup = getRegenerationSource(messages, [laterReading, oldReading], 'answer-B');
  assert.equal(original?.question, oldReading.question);
  assert.equal(original?.reading, oldReading);
  assert.equal(original?.originalDraw, true);
  assert.equal(followup?.question, '问题 B：为什么？');
  assert.equal(followup?.reading, oldReading);
  assert.equal(followup?.originalDraw, false);

  const replacement = replaceTarotAnswer(messages, 'answer-A', {
    id: 'new-answer', role: 'ai', text: '新的 A 解读', timestamp: Date.now(),
  });
  assert.equal(replacement.length, messages.length);
  assert.equal(replacement[1].text, '新的 A 解读');
  assert.equal(replacement[1].id, 'answer-A');
  assert.equal(replacement[1].timestamp, messages[1].timestamp);
  assert.deepEqual(replacement.filter((message) => message.role === 'user'), messages.filter((message) => message.role === 'user'));
  assert.equal(replacement[5], messages[5]);
});

test('a saved reply keeps its question and reading association after its user message is deleted', () => {
  const original = reading('A');
  const messages: Message[] = [
    { id: 'older-question', role: 'user', text: '更早的问题', timestamp: 1 },
    { id: 'reply', role: 'ai', text: '对 B 的回应', timestamp: 2,
      sourceQuestion: '问题 B', readingId: original.id, replyToMessageId: 'deleted-user-B', generationKind: 'tarot_followup' },
    { id: 'new-question', role: 'user', text: '之后的问题 C', timestamp: 3 },
  ];
  const source = getRegenerationSource(messages, [original], 'reply');
  assert.equal(source?.question, '问题 B');
  assert.equal(source?.reading, original);
  assert.equal(source?.originalDraw, false);
});

test('legacy replies without generation IDs recover the correct archived card instead of a later repeat', () => {
  const original = { ...reading('A'), generationId: undefined };
  const laterRepeat = { ...reading('C', '2026-10-11T08:00:00.000Z'), cardImage: original.cardImage, generationId: undefined };
  const timestamp = Date.parse(original.date) - 10;
  const messages: Message[] = [
    { id: 'question', role: 'user', text: original.question, timestamp: timestamp - 1 },
    { id: 'reply', role: 'ai', text: original.summary, timestamp, cardImage: original.cardImage },
  ];
  const source = getRegenerationSource(messages, [laterRepeat, original], 'reply');
  assert.equal(source?.question, original.question);
  assert.equal(source?.reading, original);
  assert.equal(source?.originalDraw, true);
});

test('removing one selected archive opens exactly one slot and leaves the other saved readings intact', () => {
  const archive = Array.from({ length: 200 }, (_, index) => reading(String(index)));
  const managed = removeTarotReading(archive, '120');
  assert.equal(archive.length, 200);
  assert.equal(managed.length, 199);
  assert.equal(managed.some((item) => item.id === '120'), false);
  assert.deepEqual(managed, archive.filter((item) => item.id !== '120'));
  const newArchive = appendTarotReading(managed, reading('new'), 200);
  assert.equal(newArchive.length, 200);
  assert.deepEqual(newArchive.slice(1), managed);
});

test('removing an archive does not silently redirect its existing conversation to a different reading', () => {
  const removed = reading('A');
  const remaining = reading('B');
  const messages: Message[] = [
    { id: 'user-B', role: 'user', text: remaining.question, timestamp: 1 },
    { id: 'answer-B', role: 'ai', text: remaining.summary, timestamp: 2, generationId: remaining.generationId, readingId: remaining.id },
    { id: 'user-A', role: 'user', text: removed.question, timestamp: 3 },
    { id: 'answer-A', role: 'ai', text: removed.summary, timestamp: 4, generationId: removed.generationId, readingId: removed.id, sourceQuestion: removed.question },
    { id: 'followup-A', role: 'ai', text: '继续 A 的问题', timestamp: 5, readingId: removed.id, sourceQuestion: '为什么？' },
  ];
  const archive = removeTarotReading([removed, remaining], removed.id);
  assert.equal(messages[3].text, removed.summary);
  assert.equal(messages.length, 5);
  assert.equal(getRegenerationSource(messages, archive, 'answer-A'), null);
  assert.equal(getRegenerationSource(messages, archive, 'followup-A'), null);
  assert.equal(getRegenerationSource(messages, archive, 'answer-B')?.reading, remaining);
});
