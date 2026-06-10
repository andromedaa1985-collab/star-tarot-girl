import {
  drawTarotPositions,
  resetTarotPositionQueueForAudit,
  shuffleWithRandom,
  type TarotPosition,
} from '../src/lib/tarotRandom';

const CARD_COUNT = 22;
const DRAWS = 120_000;
const SPREAD_AUDIT_DRAWS = 20_000;
const SPREAD_SIZE = 5;
const RECENT_WINDOW = 12;

resetTarotPositionQueueForAudit();

const cardHits = Array(CARD_COUNT).fill(0);
const positionHits: Record<TarotPosition, number> = { 正位: 0, 逆位: 0 };
const recentPositions: TarotPosition[] = [];
let maxPositionStreak = 0;
let currentStreak = 0;
let previousPosition: TarotPosition | null = null;
let spreadDuplicateFailures = 0;

for (let draw = 0; draw < DRAWS; draw += 1) {
  const deck = shuffleWithRandom([...Array(CARD_COUNT).keys()]);
  cardHits[deck[0]] += 1;

  const [position] = drawTarotPositions(1, recentPositions);
  positionHits[position] += 1;

  currentStreak = position === previousPosition ? currentStreak + 1 : 1;
  previousPosition = position;
  maxPositionStreak = Math.max(maxPositionStreak, currentStreak);

  recentPositions.push(position);
  if (recentPositions.length > RECENT_WINDOW) recentPositions.shift();
}

for (let draw = 0; draw < SPREAD_AUDIT_DRAWS; draw += 1) {
  const deck = shuffleWithRandom([...Array(CARD_COUNT).keys()]);
  const spread = deck.slice(0, SPREAD_SIZE);
  if (new Set(spread).size !== spread.length) spreadDuplicateFailures += 1;
}

const expectedCardHits = DRAWS / CARD_COUNT;
const maxCardDeviation = Math.max(...cardHits.map((hits) => Math.abs(hits - expectedCardHits)));
const maxCardDeviationRate = maxCardDeviation / expectedCardHits;
const reversedRate = positionHits.逆位 / DRAWS;

console.log(JSON.stringify({
  draws: DRAWS,
  positions: positionHits,
  reversedRate,
  maxPositionStreak,
  expectedCardHits,
  maxCardDeviation,
  maxCardDeviationRate,
  spreadAudit: {
    draws: SPREAD_AUDIT_DRAWS,
    spreadSize: SPREAD_SIZE,
    duplicateFailures: spreadDuplicateFailures,
  },
}, null, 2));

if (positionHits.正位 !== positionHits.逆位) {
  throw new Error('正逆位公平袋失衡');
}

if (maxPositionStreak > 3) {
  throw new Error(`正逆位连续次数过高：${maxPositionStreak}`);
}

if (maxCardDeviationRate > 0.08) {
  throw new Error(`牌面分布偏差过高：${maxCardDeviationRate}`);
}

if (spreadDuplicateFailures > 0) {
  throw new Error(`牌阵重复抽牌次数异常：${spreadDuplicateFailures}`);
}
