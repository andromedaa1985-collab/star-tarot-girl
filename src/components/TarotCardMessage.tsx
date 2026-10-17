import { clsx } from 'clsx';
import type { Message, TarotReading } from '../store';
import { getTarotArtworkSrcSet, resolveTarotArtwork } from '../lib/tarotDeck';
import { getCardPositions, tarotImageRotation } from '../lib/tarotPresentation';

/** A separate image message keeps the artwork clear without shrinking the reading. */
export default function TarotCardMessage({ message, reading }: { message: Message; reading?: TarotReading }) {
  const positions = getCardPositions(message);
  const legacyPositions = getCardPositions(reading);
  const names = [...(reading?.cards || '').matchAll(/([^，,]+)[（(]\s*(?:正位|逆位)\s*[）)]/g)].map(match => match[1].trim());
  const cards = (message.cardImages?.length ? message.cardImages : message.cardImage ? [message.cardImage] : [])
    .map((image, index) => ({ image, name: names[index], position: positions[index] || legacyPositions[index] }))
    .filter(card => card.image.startsWith('/tarot/'))
    .slice(0, 5);
  if (!cards.length) return null;

  return <div aria-label="塔罗牌图片消息" className={clsx(
    'rail-card-message grid w-full self-start gap-3 rounded-[20px] border border-apple-border bg-apple-surface p-3',
    cards.length === 1 ? 'max-w-[240px] grid-cols-1' : cards.length === 2 ? 'max-w-[480px] grid-cols-2' : 'max-w-[640px] grid-cols-2 sm:grid-cols-3',
  )}>
    {cards.map((card, index) => <figure key={`${card.image}-${index}`} className="min-w-0">
      <img src={resolveTarotArtwork(card.image, 640)} srcSet={getTarotArtworkSrcSet(card.image)} sizes={cards.length === 1 ? '216px' : '(max-width: 640px) 42vw, 220px'}
        loading="lazy" decoding="async" width={640} height={960} alt={`${card.name || `塔罗牌 ${index + 1}`}${card.position ? ` · ${card.position}` : ''}`}
        style={{ transform: `rotate(${tarotImageRotation(card.position)}deg)` }}
        className="aspect-[2/3] w-full rounded-[12px] object-cover shadow-[0_8px_20px_rgba(0,0,0,0.18)]" />
      <figcaption className="mt-2 text-center text-[13px] leading-6 text-apple-text-muted">{card.name || `塔罗牌 ${index + 1}`}{card.position && ` · ${card.position}`}</figcaption>
    </figure>)}
  </div>;
}
