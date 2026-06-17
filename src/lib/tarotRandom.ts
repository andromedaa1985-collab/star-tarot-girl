export type TarotPosition = '正位' | '逆位';

const LEGACY_POSITION_QUEUE_STORAGE_KEY = 'astrorail:tarot-position-queue:v1';
const CARD_QUEUE_STORAGE_KEY_PREFIX = 'astrorail:tarot-card-queue:v1';
const MAX_POSITION_STREAK = 3;
const POSITION_IMBALANCE_WINDOW = 12;
const POSITION_IMBALANCE_THRESHOLD = 5;
const POSITION_REBALANCE_PERCENT = 68;
const CARD_RECENT_BLOCK_SIZE = 6;

const memoryCardQueues = new Map<number, number[]>();

export const getRandomInt = (maxExclusive: number) => {
  if (maxExclusive <= 1) return 0;
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    return Math.floor(Math.random() * maxExclusive);
  }

  const bucketSize = 0x100000000;
  const limit = Math.floor(bucketSize / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  let value = 0;

  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return value % maxExclusive;
};

export const shuffleWithRandom = <T,>(items: T[]) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = getRandomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

const isTarotPosition = (value: unknown): value is TarotPosition =>
  value === '正位' || value === '逆位';

const normalizeTarotPositions = (positions: unknown[]) => positions.filter(isTarotPosition);

const normalizeCardCount = (cardCount: number) => Math.max(0, Math.floor(cardCount));

const normalizeCardQueue = (queue: unknown, cardCount: number) => {
  if (!Array.isArray(queue)) return [];
  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const value of queue) {
    if (!Number.isInteger(value) || value < 0 || value >= cardCount || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
};

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const getCardQueueStorageKey = (cardCount: number) => `${CARD_QUEUE_STORAGE_KEY_PREFIX}:${cardCount}`;

const readCardQueue = (cardCount: number) => {
  const storage = getStorage();
  if (!storage) return memoryCardQueues.get(cardCount) || [];

  try {
    return normalizeCardQueue(JSON.parse(storage.getItem(getCardQueueStorageKey(cardCount)) || '[]'), cardCount);
  } catch {
    return [];
  }
};

const writeCardQueue = (cardCount: number, queue: number[]) => {
  const normalized = normalizeCardQueue(queue, cardCount);
  const storage = getStorage();
  if (!storage) {
    memoryCardQueues.set(cardCount, normalized);
    return;
  }

  try {
    storage.setItem(getCardQueueStorageKey(cardCount), JSON.stringify(normalized));
  } catch {
    memoryCardQueues.set(cardCount, normalized);
  }
};

const getRecentCardBlockSet = (recentCardIndices: number[], cardCount: number) => {
  const blockSize = Math.min(CARD_RECENT_BLOCK_SIZE, Math.max(0, cardCount - 1));
  return new Set(normalizeCardQueue(recentCardIndices, cardCount).slice(-blockSize));
};

const createCardQueue = (cardCount: number, recentCardIndices: number[] = []) => {
  const shuffled = shuffleWithRandom(Array.from({ length: cardCount }, (_, index) => index));
  const recentSet = getRecentCardBlockSet(recentCardIndices, cardCount);
  if (recentSet.size === 0) return shuffled;

  const fresh = shuffled.filter((cardIndex) => !recentSet.has(cardIndex));
  const recent = shuffled.filter((cardIndex) => recentSet.has(cardIndex));
  return [...fresh, ...recent];
};

const getTailStreak = (positions: TarotPosition[], position: TarotPosition) => {
  let streak = 0;
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    if (positions[index] !== position) break;
    streak += 1;
  }
  return streak;
};

export const drawTarotPosition = (recentPositions: TarotPosition[] = []) => {
  const normalizedRecent = normalizeTarotPositions(recentPositions);
  if (getTailStreak(normalizedRecent, '正位') >= MAX_POSITION_STREAK) return '逆位';
  if (getTailStreak(normalizedRecent, '逆位') >= MAX_POSITION_STREAK) return '正位';

  const randomPosition: TarotPosition = getRandomInt(2) === 0 ? '正位' : '逆位';
  const window = normalizedRecent.slice(-POSITION_IMBALANCE_WINDOW);
  const uprightCount = window.filter((position) => position === '正位').length;
  const reversedCount = window.length - uprightCount;
  const imbalance = uprightCount - reversedCount;

  if (Math.abs(imbalance) >= POSITION_IMBALANCE_THRESHOLD) {
    const underrepresented: TarotPosition = imbalance > 0 ? '逆位' : '正位';
    return getRandomInt(100) < POSITION_REBALANCE_PERCENT ? underrepresented : randomPosition;
  }

  return randomPosition;
};

export const drawTarotPositions = (count: number, recentPositions: TarotPosition[] = []) => {
  const positions: TarotPosition[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push(drawTarotPosition([...recentPositions, ...positions]));
  }
  return positions;
};

export const drawTarotCardIndices = (cardCount: number, count = 1, recentCardIndices: number[] = []) => {
  const normalizedCardCount = normalizeCardCount(cardCount);
  if (normalizedCardCount === 0) return [];

  const drawCount = Math.max(0, Math.min(Math.floor(count), normalizedCardCount));
  const drawn: number[] = [];
  let queue = readCardQueue(normalizedCardCount);

  for (let index = 0; index < drawCount; index += 1) {
    if (queue.length === 0) queue = createCardQueue(normalizedCardCount, [...recentCardIndices, ...drawn]);

    const blocked = getRecentCardBlockSet([...recentCardIndices, ...drawn], normalizedCardCount);
    const preferredIndex = queue.findIndex((cardIndex) => !blocked.has(cardIndex));
    const drawIndex = preferredIndex >= 0 ? preferredIndex : 0;
    const [cardIndex] = queue.splice(drawIndex, 1);
    drawn.push(cardIndex);
  }

  writeCardQueue(normalizedCardCount, queue);
  return drawn;
};

export const resetTarotPositionQueueForAudit = () => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(LEGACY_POSITION_QUEUE_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures in diagnostics.
  }
};

export const resetTarotCardQueueForAudit = () => {
  memoryCardQueues.clear();
  const storage = getStorage();
  if (!storage) return;
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(CARD_QUEUE_STORAGE_KEY_PREFIX)) storage.removeItem(key);
    }
  } catch {
    // Ignore storage cleanup failures in diagnostics.
  }
};

export const resetTarotRandomQueuesForAudit = () => {
  resetTarotPositionQueueForAudit();
  resetTarotCardQueueForAudit();
};
