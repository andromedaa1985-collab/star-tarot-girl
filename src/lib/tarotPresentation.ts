import type { TarotReading } from '../store';
import type { TarotPosition } from './tarotRandom';
import { getAppDateKey, getTrustedNow } from './trustedTime';

const DAILY_FORTUNE_KEYWORDS = ['今日运势', '每日运势', '今天运势', '今天的运势', '今日牌', '每日牌', '今日指引', '每日指引', '今天怎么样', '今天如何'];
export function isDailyFortuneQuestion(question: string) {
  const normalized = question.trim();
  return normalized === '运势' || DAILY_FORTUNE_KEYWORDS.some(keyword => normalized.includes(keyword));
}

export function extractTarotPositions(cardsText = ''): TarotPosition[] {
  return [...cardsText.matchAll(/[（(]\s*(正位|逆位)\s*[）)]/g)].map(match => match[1] as TarotPosition);
}

export function getCardPositions(record?: { cards?: string; cardPositions?: TarotPosition[] }) {
  return record?.cardPositions?.length ? record.cardPositions : extractTarotPositions(record?.cards);
}

export function tarotImageRotation(position?: TarotPosition) { return position === '逆位' ? 180 : 0; }

/** A saved draw is the source of truth, including after navigation or a reload. */
export function getTodaysDailyReading(readings: readonly TarotReading[], now = getTrustedNow()) {
  const today = getAppDateKey(now);
  return readings.filter(reading => {
    const timestamp = Date.parse(reading.date);
    return Number.isFinite(timestamp) && getAppDateKey(new Date(timestamp)) === today && isDailyFortuneQuestion(reading.question);
  }).sort((first, second) => Date.parse(second.date) - Date.parse(first.date))[0] || null;
}

export function drawWithTarotOrientation(ctx: CanvasRenderingContext2D, position: TarotPosition | undefined, x: number, y: number, width: number, height: number, draw: () => void) {
  ctx.save();
  try {
    if (position === '逆位') {
      ctx.translate(x * 2 + width, y * 2 + height);
      ctx.rotate(Math.PI);
    }
    draw();
  } finally {
    ctx.restore();
  }
}
