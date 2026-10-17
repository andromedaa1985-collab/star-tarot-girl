import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TarotCardMessage from '../src/components/TarotCardMessage';
import { drawWithTarotOrientation, extractTarotPositions, getCardPositions, getTodaysDailyReading } from '../src/lib/tarotPresentation';
import { normalizeGeneratedStorageValue } from '../src/lib/generationTrace';
import { TAROT_CARDS } from '../src/lib/tarotDeck';
import type { Message, TarotReading } from '../src/store';

const reading = (id: string, date: string, question = '今日运势'): TarotReading => ({
  id, date, question, cards: '星星（逆位）', summary: '放慢脚步，留意自己的感受。', cardImage: TAROT_CARDS[17].image,
});

test('returning today restores the latest completed daily reading without mutating the archive', () => {
  const records = [
    reading('older', '2026-10-17T01:00:00Z'),
    reading('latest', '2026-10-17T04:00:00Z', '帮我看看今天的运势'),
    reading('other', '2026-10-17T05:00:00Z', '工作上该怎样做选择？'),
    reading('invalid', 'invalid'),
  ];
  const original = JSON.stringify(records);
  assert.equal(getTodaysDailyReading(records, new Date('2026-10-17T09:00:00Z'))?.id, 'latest');
  const restored = JSON.parse(JSON.stringify(records));
  assert.equal(getTodaysDailyReading(restored, new Date('2026-10-17T09:00:00Z'))?.id, 'latest');
  assert.equal(JSON.stringify(records), original);
});

test('a new day opens the draw entry at Shanghai midnight rather than UTC midnight', () => {
  const records = [reading('daily', '2026-10-17T15:55:00Z')];
  assert.equal(getTodaysDailyReading(records, new Date('2026-10-17T15:59:59Z'))?.id, 'daily');
  assert.equal(getTodaysDailyReading(records, new Date('2026-10-17T16:00:00Z')), null);
  const nextDay = reading('next-day', '2026-10-17T16:01:00Z');
  assert.equal(getTodaysDailyReading([...records, nextDay], new Date('2026-10-17T16:05:00Z'))?.id, 'next-day');
});

test('other readings and an unfinished question do not count as a completed daily fortune', () => {
  const now = new Date('2026-10-17T09:00:00Z');
  assert.equal(getTodaysDailyReading([], now), null);
  assert.equal(getTodaysDailyReading([reading('work', now.toISOString(), '事业岔路牌阵')], now), null);
  assert.equal(getTodaysDailyReading([reading('yesterday', '2026-10-16T04:00:00Z')], now), null);
});

test('legacy Chinese and ASCII card notation retains each card orientation', () => {
  assert.deepEqual(extractTarotPositions('星星（逆位），太阳(正位)，世界（ 正位 ）'), ['逆位', '正位', '正位']);
  assert.deepEqual(getCardPositions(), []);
  assert.deepEqual(getCardPositions({ cards: '星星（逆位）' }), ['逆位']);
  assert.deepEqual(getCardPositions({ cards: '星星（正位）', cardPositions: ['逆位'] }), ['逆位']);
});

test('saved message metadata survives archive normalization even after its reading is removed', () => {
  const message: Message = { id: 'draw', role: 'ai', timestamp: Date.now(), text: '解读', cardImage: TAROT_CARDS[17].image, cardPositions: ['逆位'] };
  const restored = normalizeGeneratedStorageValue('messages', JSON.parse(JSON.stringify([message]))) as Message[];
  const markup = renderToStaticMarkup(createElement(TarotCardMessage, { message: restored[0] }));
  assert.match(markup, /rotate\(180deg\)/);
  assert.match(markup, /逆位/);
});

test('the image message displays a large standalone card, leaving the answer for its separate bubble', () => {
  const archive = reading('daily', '2026-10-17T04:00:00Z');
  const message: Message = { id: 'draw', role: 'ai', timestamp: Date.parse(archive.date), text: '这段解读应该在独立文字消息里', cardImage: archive.cardImage };
  const markup = renderToStaticMarkup(createElement(TarotCardMessage, { message, reading: archive }));
  assert.match(markup, /aria-label="塔罗牌图片消息"/);
  assert.match(markup, /alt="星星 · 逆位"/);
  assert.match(markup, /rotate\(180deg\)/);
  assert.match(markup, /srcSet=/);
  assert.doesNotMatch(markup, /这段解读应该在独立文字消息里/);
  assert.equal((markup.match(/<img /g) || []).length, 1);
});

test('multi-card messages retain their own positions when a non-card image is omitted', () => {
  const message: Message = {
    id: 'spread', role: 'ai', timestamp: 1, text: '解读',
    cardImages: [TAROT_CARDS[0].image, '/unrelated.png', ...TAROT_CARDS.slice(1, 5).map(card => card.image)],
    cardPositions: ['正位', '逆位', '逆位', '正位', '逆位', '正位'],
  };
  const markup = renderToStaticMarkup(createElement(TarotCardMessage, { message }));
  assert.equal((markup.match(/<img /g) || []).length, 5);
  assert.equal((markup.match(/rotate\(180deg\)/g) || []).length, 2);
  assert.doesNotMatch(markup, /unrelated\.png/);
});

test('text-only replies do not create empty image messages', () => {
  const message: Message = { id: 'reply', role: 'ai', timestamp: 1, text: '继续聊聊' };
  assert.equal(renderToStaticMarkup(createElement(TarotCardMessage, { message })), '');
});

test('a reversed share image stays in its original bounds and leaves later text upright', () => {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const ctx = {
    save() { stack.push([...matrix]); },
    restore() { matrix = stack.pop()!; },
    translate(x: number, y: number) { matrix[4] += matrix[0] * x + matrix[2] * y; matrix[5] += matrix[1] * x + matrix[3] * y; },
    rotate(angle: number) {
      const [a, b, c, d] = matrix, cos = Math.cos(angle), sin = Math.sin(angle);
      matrix = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, matrix[4], matrix[5]];
    },
  } as unknown as CanvasRenderingContext2D;
  const point = (x: number, y: number) => [Math.round(matrix[0] * x + matrix[2] * y + matrix[4]), Math.round(matrix[1] * x + matrix[3] * y + matrix[5])];
  drawWithTarotOrientation(ctx, '逆位', 92, 230, 360, 560, () => {
    assert.deepEqual(point(92, 230), [452, 790]);
    assert.deepEqual(point(452, 790), [92, 230]);
  });
  assert.deepEqual(point(500, 268), [500, 268]);
  drawWithTarotOrientation(ctx, '正位', 92, 230, 360, 560, () => assert.deepEqual(point(92, 230), [92, 230]));
  assert.throws(() => drawWithTarotOrientation(ctx, '逆位', 92, 230, 360, 560, () => { throw new Error('image unavailable'); }));
  assert.deepEqual(point(500, 268), [500, 268]);
});
