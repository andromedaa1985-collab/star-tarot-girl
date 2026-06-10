export type TarotPosition = '正位' | '逆位';

const POSITION_QUEUE_STORAGE_KEY = 'astrorail:tarot-position-queue:v1';
const POSITION_QUEUE_SIZE = 12;
const MAX_POSITION_STREAK = 3;
const VALID_POSITIONS: TarotPosition[] = ['正位', '逆位'];

let memoryPositionQueue: TarotPosition[] = [];

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

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readPositionQueue = () => {
  const storage = getStorage();
  if (!storage) return memoryPositionQueue;

  try {
    const parsed = JSON.parse(storage.getItem(POSITION_QUEUE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isTarotPosition) : [];
  } catch {
    return [];
  }
};

const writePositionQueue = (queue: TarotPosition[]) => {
  const normalized = queue.filter(isTarotPosition);
  const storage = getStorage();
  if (!storage) {
    memoryPositionQueue = normalized;
    return;
  }

  try {
    storage.setItem(POSITION_QUEUE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    memoryPositionQueue = normalized;
  }
};

const getTailStreak = (positions: TarotPosition[], position: TarotPosition) => {
  let streak = 0;
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    if (positions[index] !== position) break;
    streak += 1;
  }
  return streak;
};

const hasLongInternalStreak = (positions: TarotPosition[]) => {
  let streak = 1;
  for (let index = 1; index < positions.length; index += 1) {
    streak = positions[index] === positions[index - 1] ? streak + 1 : 1;
    if (streak > MAX_POSITION_STREAK) return true;
  }
  return false;
};

export const createBalancedPositionQueue = () => {
  const half = POSITION_QUEUE_SIZE / 2;
  const base = [
    ...Array<TarotPosition>(half).fill('正位'),
    ...Array<TarotPosition>(half).fill('逆位'),
  ];

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const shuffled = shuffleWithRandom(base);
    if (!hasLongInternalStreak(shuffled)) return shuffled;
  }

  const [first, second] = shuffleWithRandom(VALID_POSITIONS);
  return [
    ...Array<TarotPosition>(MAX_POSITION_STREAK).fill(first),
    ...Array<TarotPosition>(MAX_POSITION_STREAK).fill(second),
    ...Array<TarotPosition>(MAX_POSITION_STREAK).fill(first),
    ...Array<TarotPosition>(MAX_POSITION_STREAK).fill(second),
  ];
};

export const drawTarotPosition = (recentPositions: TarotPosition[] = []) => {
  let queue = readPositionQueue();
  if (queue.length === 0) queue = createBalancedPositionQueue();

  const first = queue[0];
  const wouldExtendLongStreak = getTailStreak(recentPositions, first) >= MAX_POSITION_STREAK;
  const preferredIndex = wouldExtendLongStreak
    ? queue.findIndex((position) => position !== first)
    : 0;
  const drawIndex = preferredIndex >= 0 ? preferredIndex : 0;
  const [position] = queue.splice(drawIndex, 1);

  writePositionQueue(queue);
  return position;
};

export const drawTarotPositions = (count: number, recentPositions: TarotPosition[] = []) => {
  const positions: TarotPosition[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push(drawTarotPosition([...recentPositions, ...positions]));
  }
  return positions;
};

export const resetTarotPositionQueueForAudit = () => {
  memoryPositionQueue = [];
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(POSITION_QUEUE_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures in diagnostics.
  }
};
