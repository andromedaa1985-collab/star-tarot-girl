import React, { useEffect, useRef } from 'react';
import { LockKeyhole } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { getCollectionCardArtwork, RARITY_DETAILS, type CollectionCardDefinition } from '../lib/collectionCards';
import { getTarotArtworkSrcSet, TAROT_CARD_BACK } from '../lib/tarotDeck';

type CollectionCardProps = {
  key?: string;
  card: CollectionCardDefinition;
  owned?: boolean;
  count?: number;
  onOpen?: () => void;
  enlarged?: boolean;
};

/** Foil layers are static textures. Only their transform and opacity respond to a pointer. */
export default function CollectionCard({ card, owned = false, count = 0, onOpen, enlarged = false }: CollectionCardProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const foilRef = useRef<HTMLSpanElement>(null);
  const shineRef = useRef<HTMLSpanElement>(null);
  const boundsRef = useRef<DOMRect | null>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const reducedMotion = useReducedMotion();
  const image = enlarged || owned ? getCollectionCardArtwork(card, enlarged ? 1024 : 320) : TAROT_CARD_BACK;
  const detail = RARITY_DETAILS[card.rarity];

  const reset = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    boundsRef.current = null;
    if (surfaceRef.current) surfaceRef.current.style.transform = '';
    if (foilRef.current) foilRef.current.style.transform = '';
    if (shineRef.current) shineRef.current.style.transform = '';
  };

  useEffect(() => () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); }, []);

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reducedMotion || card.rarity === 'N') return;
    const bounds = boundsRef.current;
    if (!bounds) return;
    pointerRef.current = {
      x: Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2)),
      y: Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2)),
    };
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      const { x, y } = pointerRef.current;
      if (surfaceRef.current) surfaceRef.current.style.transform = `perspective(900px) rotateX(${-y * 5}deg) rotateY(${x * 7}deg)`;
      if (foilRef.current) foilRef.current.style.transform = `translate3d(${x * 9}%, ${y * 9}%, 0) rotate(-18deg)`;
      if (shineRef.current) shineRef.current.style.transform = `translate3d(${x * 22}%, ${y * 12}%, 0) rotate(-24deg)`;
      frameRef.current = null;
    });
  };

  const content = <>
    <div className="collection-card-stage" onPointerEnter={(event) => { if (!reducedMotion) boundsRef.current = event.currentTarget.getBoundingClientRect(); }} onPointerDown={(event) => { if (!reducedMotion) boundsRef.current = event.currentTarget.getBoundingClientRect(); }} onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset} onPointerUp={(event) => { if (event.pointerType !== 'mouse') reset(); }}>
      <div ref={surfaceRef} className={`collection-card-surface collection-card-${card.rarity.toLowerCase()}`}>
        <img src={image} srcSet={getTarotArtworkSrcSet(image)} sizes={enlarged ? '(max-width: 640px) 76vw, 360px' : '(max-width: 640px) 44vw, 240px'} alt={enlarged || owned ? `${card.name}机械塔罗原画` : '未获得卡片的统一牌背'} loading={enlarged ? 'eager' : 'lazy'} decoding="async" width={640} height={960} className="collection-card-art" />
        <span className="collection-card-engraving" aria-hidden="true" />
        <span ref={foilRef} className="collection-card-foil" aria-hidden="true" />
        <span className="collection-card-prism" aria-hidden="true" />
        <span ref={shineRef} className="collection-card-shine" aria-hidden="true" />
        <span className="collection-card-shine-secondary" aria-hidden="true" />
        <span className="collection-card-stars" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <span key={index}>✦</span>)}</span>
        {!owned && <span className="collection-card-preview"><LockKeyhole size={12} aria-hidden="true" />{enlarged ? '工艺预览 · 未获得' : '未获得'}</span>}
      </div>
    </div>
    {!enlarged && <span className="collection-card-caption"><span className="collection-card-name">{card.name}</span><span className="collection-card-subtitle">{card.rarity}{owned && count > 1 ? ` · ×${count}` : ''}</span></span>}
  </>;

  return onOpen
    ? <button type="button" className={`collection-card ${owned ? 'is-owned' : 'is-unowned'}`} onClick={onOpen} aria-label={`${card.name}，${card.rarity}，${detail.finish}，${owned ? `已获得 ${count} 张，查看卡片` : '未获得，预览卡片工艺'}`}>{content}</button>
    : <div tabIndex={0} className="collection-card collection-card-enlarged" aria-label={`${card.rarity} ${detail.finish}卡片，移动指针或轻触可查看光泽`}>{content}</div>;
}
