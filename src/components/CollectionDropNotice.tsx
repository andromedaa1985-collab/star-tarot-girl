import React from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAppContext } from '../store';
import { COLLECTION_CARDS, getCollectionCardArtwork, RARITY_DETAILS } from '../lib/collectionCards';

/** An earned card never interrupts the conversation with a modal. */
export default function CollectionDropNotice() {
  const { latestCardDrop, dismissCardDrop } = useAppContext();
  const card = COLLECTION_CARDS.find((item) => item.id === latestCardDrop?.cardId);
  if (!card) return null;

  return <aside className="collection-drop-notice" aria-label="新卡片通知">
    <img src={getCollectionCardArtwork(card, 320)} alt="" width={40} height={60} decoding="async" />
    <div className="collection-drop-copy">
      <p role="status" aria-live="polite">获得 {card.rarity} · {card.name}</p>
      <span>{RARITY_DETAILS[card.rarity].finish}卡已放入收藏册</span>
    </div>
    <Link to={`/app/collection?card=${encodeURIComponent(card.id)}`} onClick={dismissCardDrop} className="collection-drop-link">查看卡片</Link>
    <button type="button" onClick={dismissCardDrop} aria-label="关闭新卡片通知" className="collection-icon-button"><X size={18} aria-hidden="true" /></button>
  </aside>;
}
