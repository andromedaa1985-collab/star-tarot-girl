import { resolveTarotArtwork, TAROT_CARDS, type TarotArtworkWidth } from './tarotDeck';

export const CARD_RARITIES = ['N', 'R', 'SR', 'SSR'] as const;
export type CardRarity = typeof CARD_RARITIES[number];
export type ConversationCardChannel = 'tarot' | 'daily-deep' | 'guardian' | 'bazi';

export interface CollectionCardDefinition {
  id: string;
  name: string;
  rarity: CardRarity;
  description: string;
  tarotIndex: number;
}

export const RARITY_DETAILS: Record<CardRarity, { label: string; finish: string; dropWeight: number }> = {
  N: { label: '普通卡', finish: '哑光', dropWeight: 60 },
  R: { label: '珍稀卡', finish: '银边', dropWeight: 27 },
  SR: { label: '特典卡', finish: '浮雕', dropWeight: 10 },
  SSR: { label: '典藏卡', finish: '全息闪膜', dropWeight: 3 },
};

// These are our collection rules, independent of any physical card brand.
export const COLLECTION_DROP_RATE = 0.4;
export const COLLECTION_CARDS: CollectionCardDefinition[] = [
  { id: 'n-first-meeting', name: '初见', rarity: 'N', tarotIndex: 0, description: '每一段故事，都从愿意开口的那一刻开始。' },
  { id: 'n-stillness', name: '静心', rarity: 'N', tarotIndex: 2, description: '把外面的声音放轻一点，听见自己的答案。' },
  { id: 'n-lamplight', name: '灯火', rarity: 'N', tarotIndex: 9, description: '不必照亮整条路，眼前的一步也值得被看见。' },
  { id: 'n-glimmer', name: '微光', rarity: 'N', tarotIndex: 17, description: '那些很小的好事，也能慢慢汇成光。' },
  { id: 'r-will', name: '意志', rarity: 'R', tarotIndex: 1, description: '把一个念头，变成今天可以开始的小行动。' },
  { id: 'r-abundance', name: '丰盈', rarity: 'R', tarotIndex: 3, description: '照顾自己的节奏，让喜欢的事物慢慢生长。' },
  { id: 'r-departure', name: '启程', rarity: 'R', tarotIndex: 7, description: '方向不必一次选对，出发以后仍然可以调整。' },
  { id: 'r-courage', name: '勇气', rarity: 'R', tarotIndex: 8, description: '温柔地面对困难，也是一种坚定的力量。' },
  { id: 'sr-balance', name: '平衡', rarity: 'SR', tarotIndex: 14, description: '在前进与休息之间，找到属于自己的步调。' },
  { id: 'sr-renewal', name: '新生', rarity: 'SR', tarotIndex: 20, description: '回应心里新的呼唤，给自己再开始的机会。' },
  { id: 'ssr-moon-oracle', name: '月之神谕', rarity: 'SSR', tarotIndex: 18, description: '月光照进未被说出的心事，留下一段独有的回响。' },
  { id: 'ssr-destiny-ring', name: '命运之环', rarity: 'SSR', tarotIndex: 21, description: '走过的片刻彼此连接，成为此刻完整的你。' },
];

export interface CollectionDropEvent {
  id: string;
  turnId: string;
  channel: ConversationCardChannel;
  cardId: string | null;
  createdAt: string;
}

export type NewCollectionCardDrop = CollectionDropEvent & { cardId: string };

export interface ConversationCardCompletion {
  turnId: string;
  channel: ConversationCardChannel;
  text: string;
  usedFallback?: boolean;
  regeneration?: boolean;
}

const CHANNELS: ConversationCardChannel[] = ['tarot', 'daily-deep', 'guardian', 'bazi'];

/** Keep old backups usable, without treating malformed records as new rewards. */
export function normalizeCollectionDrops(value: unknown): CollectionDropEvent[] {
  if (!Array.isArray(value)) return [];
  const records = new Map<string, CollectionDropEvent>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.turnId !== 'string' || !record.turnId.trim()
      || !CHANNELS.includes(record.channel as ConversationCardChannel)
      || (record.cardId !== null && (typeof record.cardId !== 'string' || !record.cardId.trim()))
      || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) continue;
    const turnId = record.turnId.trim();
    const channel = record.channel as ConversationCardChannel;
    const id = `${channel}:${turnId}`;
    // The first recorded result wins, including a recorded non-drop.
    if (!records.has(id)) records.set(id, { id, turnId, channel, cardId: record.cardId as string | null, createdAt: new Date(record.createdAt).toISOString() });
  }
  return Array.from(records.values());
}

function randomUnit(random: () => number) {
  const value = random();
  return Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0.5;
}

function chooseCard(rarity: CardRarity, random: () => number) {
  const pool = COLLECTION_CARDS.filter((card) => card.rarity === rarity);
  return pool[Math.floor(randomUnit(random) * pool.length)].id;
}

export function isEligibleConversationCardCompletion(input: ConversationCardCompletion) {
  return Boolean(input.turnId?.trim() && CHANNELS.includes(input.channel)
    && input.text?.trim() && !input.usedFallback && !input.regeneration);
}

/** Pure award calculation. Call only from a newly completed real conversation. */
export function appendConversationCardDrop(
  events: CollectionDropEvent[],
  input: ConversationCardCompletion,
  random: () => number = Math.random,
  now: () => Date = () => new Date(),
): { events: CollectionDropEvent[]; event: CollectionDropEvent | null } {
  if (!isEligibleConversationCardCompletion(input)) return { events, event: null };
  const turnId = input.turnId.trim();
  const id = `${input.channel}:${turnId}`;
  if (events.some((event) => event.id === id)) return { events, event: null };
  let cardId: string | null = null;
  if (events.length === 0) {
    cardId = chooseCard('N', random);
  } else if (randomUnit(random) < COLLECTION_DROP_RATE) {
    const rarityRoll = randomUnit(random) * 100;
    let cutoff = 0;
    const rarity = CARD_RARITIES.find((candidate) => {
      cutoff += RARITY_DETAILS[candidate].dropWeight;
      return rarityRoll < cutoff;
    }) || 'SSR';
    cardId = chooseCard(rarity, random);
  }
  const event: CollectionDropEvent = { id, turnId, channel: input.channel, cardId, createdAt: now().toISOString() };
  return { events: [...events, event], event };
}

export function getCollectionCardArtwork(card: CollectionCardDefinition, width: TarotArtworkWidth = 640) {
  return resolveTarotArtwork(TAROT_CARDS[card.tarotIndex]?.image, width);
}

export function getOwnedCollectionCards(events: CollectionDropEvent[]) {
  const owned = new Map<string, { card: CollectionCardDefinition; count: number; firstObtainedAt: string; lastObtainedAt: string }>();
  for (const event of normalizeCollectionDrops(events)) {
    const card = COLLECTION_CARDS.find((candidate) => candidate.id === event.cardId);
    if (!card) continue;
    const existing = owned.get(card.id);
    if (existing) {
      existing.count += 1;
      if (event.createdAt < existing.firstObtainedAt) existing.firstObtainedAt = event.createdAt;
      if (event.createdAt > existing.lastObtainedAt) existing.lastObtainedAt = event.createdAt;
    } else owned.set(card.id, { card, count: 1, firstObtainedAt: event.createdAt, lastObtainedAt: event.createdAt });
  }
  return Array.from(owned.values());
}
