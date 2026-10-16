import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendConversationCardDrop, CARD_RARITIES, COLLECTION_CARDS, COLLECTION_DROP_RATE,
  getCollectionCardArtwork, getOwnedCollectionCards, normalizeCollectionDrops, RARITY_DETAILS,
  type CollectionDropEvent, type ConversationCardCompletion,
} from '../src/lib/collectionCards';

const now = () => new Date('2026-10-16T04:00:00.000Z');
const completion = (turnId = 'turn-one'): ConversationCardCompletion => ({ turnId, channel: 'tarot', text: '一段完成的真实回复。' });
const baseline: CollectionDropEvent[] = [{ id: 'tarot:old-turn', turnId: 'old-turn', channel: 'tarot', cardId: 'n-first-meeting', createdAt: now().toISOString() }];
function sequence(...values: number[]) {
  let index = 0;
  return () => { assert.ok(index < values.length, 'unexpected random draw'); return values[index++]; };
}

test('collection catalog has twelve stable cards, distinct tiers and responsive compressed art', () => {
  assert.equal(COLLECTION_CARDS.length, 12);
  assert.equal(new Set(COLLECTION_CARDS.map(card => card.id)).size, 12);
  assert.deepEqual(CARD_RARITIES.map(rarity => COLLECTION_CARDS.filter(card => card.rarity === rarity).length), [4, 4, 2, 2]);
  assert.equal(CARD_RARITIES.reduce((total, rarity) => total + RARITY_DETAILS[rarity].dropWeight, 0), 100);
  assert.equal(COLLECTION_DROP_RATE, 0.4);
  for (const card of COLLECTION_CARDS) {
    assert.match(getCollectionCardArtwork(card, 320), /\/tarot\/mecha-v1\/.*-320\.webp$/);
    assert.match(getCollectionCardArtwork(card, 1024), /\.webp$/);
  }
});

test('first eligible completed conversation guarantees an N card without requiring prior history', () => {
  const result = appendConversationCardDrop([], completion(), sequence(0.999), now);
  assert.equal(result.events.length, 1);
  assert.equal(result.event?.cardId, 'n-glimmer');
  assert.equal(result.event?.id, 'tarot:turn-one');
  assert.equal(result.event?.createdAt, now().toISOString());
});

test('subsequent drops use the disclosed forty percent boundary', () => {
  const missed = appendConversationCardDrop(baseline, completion(), sequence(0.4), now);
  assert.equal(missed.event?.cardId, null);
  assert.equal(missed.events.length, 2);
  const hit = appendConversationCardDrop(baseline, completion(), sequence(0.399999, 0, 0), now);
  assert.equal(hit.event?.cardId, 'n-first-meeting');
});

test('rarity boundaries follow sixty, twenty-seven, ten and three percent weights', () => {
  for (const [roll, expected] of [[0, 'N'], [0.59999, 'N'], [0.6, 'R'], [0.86999, 'R'], [0.87, 'SR'], [0.96999, 'SR'], [0.97, 'SSR'], [0.99999, 'SSR']] as const) {
    const result = appendConversationCardDrop(baseline, completion(), sequence(0, roll, 0), now);
    assert.equal(COLLECTION_CARDS.find(card => card.id === result.event?.cardId)?.rarity, expected, String(roll));
  }
});

test('a recorded non-drop cannot reroll on duplicate completion', () => {
  const first = appendConversationCardDrop(baseline, completion(), sequence(0.7), now);
  const duplicate = appendConversationCardDrop(first.events, completion(), () => { throw new Error('must not reroll'); }, now);
  assert.equal(duplicate.events, first.events);
  assert.equal(duplicate.event, null);
});

test('a recorded awarded card cannot be awarded twice', () => {
  const first = appendConversationCardDrop([], completion(), sequence(0), now);
  const duplicate = appendConversationCardDrop(first.events, completion(), () => { throw new Error('must not reroll'); }, now);
  assert.equal(duplicate.events, first.events);
  assert.equal(getOwnedCollectionCards(duplicate.events)[0].count, 1);
});

test('fallbacks, regenerations, empty messages and empty turn IDs never create draw events', () => {
  for (const patch of [{ usedFallback: true }, { regeneration: true }, { text: '  \n ' }, { turnId: ' ' }]) {
    const result = appendConversationCardDrop([], { ...completion(), ...patch }, () => { throw new Error('must not draw'); }, now);
    assert.deepEqual(result.events, []);
    assert.equal(result.event, null);
  }
});

test('all four conversation channels work and equal turn IDs in separate channels remain separate', () => {
  let events: CollectionDropEvent[] = [];
  for (const channel of ['tarot', 'daily-deep', 'guardian', 'bazi'] as const) {
    const result = appendConversationCardDrop(events, { ...completion(), channel }, () => 0, now);
    events = result.events;
    assert.ok(result.event?.id.startsWith(`${channel}:`));
  }
  assert.equal(events.length, 4);
});

test('the ledger stores no private message text and leaves inputs untouched', () => {
  const events = baseline.map(item => ({ ...item }));
  const input = completion();
  const before = JSON.stringify({ events, input });
  const result = appendConversationCardDrop(events, input, sequence(0.6), now);
  assert.equal(JSON.stringify({ events, input }), before);
  assert.deepEqual(Object.keys(result.event!).sort(), ['cardId', 'channel', 'createdAt', 'id', 'turnId']);
});

test('restored records normalize IDs, dates and duplicates without changing the first outcome', () => {
  const normalized = normalizeCollectionDrops([
    { id: 'untrusted-id', turnId: ' turn-one ', channel: 'tarot', cardId: null, createdAt: '2026-10-16T12:00:00+08:00' },
    { ...baseline[0], turnId: 'turn-one', cardId: 'ssr-moon-oracle' },
  ]);
  assert.deepEqual(normalized, [{ id: 'tarot:turn-one', turnId: 'turn-one', channel: 'tarot', cardId: null, createdAt: now().toISOString() }]);
});

test('old or malformed storage restores as an empty ledger rather than granting historical cards', () => {
  assert.deepEqual(normalizeCollectionDrops(undefined), []);
  assert.deepEqual(normalizeCollectionDrops([null, {}, { ...baseline[0], channel: 'unknown' }, { ...baseline[0], createdAt: 'invalid' }, { ...baseline[0], cardId: undefined }]), []);
});

test('duplicate cards stay permanent and are counted from distinct events only', () => {
  const events = [baseline[0], { ...baseline[0], id: 'guardian:other-turn', turnId: 'other-turn', channel: 'guardian' as const, createdAt: '2026-10-17T04:00:00Z' }, baseline[0]];
  const owned = getOwnedCollectionCards(events);
  assert.equal(owned.length, 1);
  assert.equal(owned[0].count, 2);
  assert.equal(owned[0].firstObtainedAt, now().toISOString());
  assert.equal(owned[0].lastObtainedAt, '2026-10-17T04:00:00.000Z');
});

test('unknown future cards are retained in the ledger without rendering false owned cards', () => {
  const events = normalizeCollectionDrops([{ ...baseline[0], cardId: 'future-card' }]);
  assert.equal(events[0].cardId, 'future-card');
  assert.deepEqual(getOwnedCollectionCards(events), []);
});

test('boundary random samples never index outside a rarity pool', () => {
  for (const value of [1, -1, NaN, Infinity]) {
    const result = appendConversationCardDrop([], completion(), sequence(value), now);
    assert.ok(COLLECTION_CARDS.some(card => card.id === result.event?.cardId && card.rarity === 'N'));
  }
});
