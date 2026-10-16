import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import PageHeader from '../components/ui/PageHeader';
import { TAROT_CARDS, getTarotArtworkSrcSet, resolveTarotArtwork } from '../lib/tarotDeck';
import { useDialogFocus } from '../lib/useDialogFocus';
import { MOTION_DURATION, MOTION_EASE } from '../lib/uiMotion';

export default function Deck() {
  const [selected, setSelected] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  useDialogFocus(dialogRef, selected !== null, () => setSelected(null));
  const card = selected === null ? null : TAROT_CARDS[selected];

  return <div className="rail-page"><div className="rail-page-content">
    <PageHeader title="塔罗牌册" description="22 张大阿尔卡那 · 未来暗黑系列" action={<Link to="/app/explore" className="rail-button-secondary">返回探索</Link>} />
    <div className="rail-deck-grid">
      {TAROT_CARDS.map(item => <button key={item.index} type="button" className="rail-deck-card" onClick={() => setSelected(item.index)} aria-label={`查看${item.name}牌面`}>
        <img src={resolveTarotArtwork(item.image, 320)} srcSet={getTarotArtworkSrcSet(item.image)} sizes="(min-width: 1200px) 220px, (min-width: 1024px) calc((100vw - 296px) / 3), (min-width: 640px) calc((100vw - 88px) / 3), calc((100vw - 64px) / 2)" alt="" width="1024" height="1536" loading="lazy" decoding="async" />
        <span className="rail-deck-caption"><span className="font-serif">{item.name}</span><span className="tabular-nums text-xs text-apple-text-muted">{String(item.index).padStart(2, '0')}</span></span>
      </button>)}
    </div>
    {createPortal(<AnimatePresence>{card && <motion.div className="rail-deck-overlay" initial={reduceMotion ? false : {opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} transition={{duration: reduceMotion ? 0 : MOTION_DURATION.exit}} onClick={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="deck-card-title" tabIndex={-1} className="rail-deck-detail" initial={reduceMotion ? false : {y: 16}} animate={{y: 0}} transition={{duration: reduceMotion ? 0 : MOTION_DURATION.standard, ease: MOTION_EASE}}>
        <div className="rail-deck-toolbar"><h2 id="deck-card-title" className="font-serif text-xl" aria-live="polite" aria-atomic="true">{card.name}<span className="sr-only">，第 {card.index + 1} 张，共 22 张</span></h2><button type="button" className="rail-button-secondary" onClick={() => setSelected(null)}>关闭</button></div>
        <img key={card.index} src={resolveTarotArtwork(card.image, 640)} srcSet={getTarotArtworkSrcSet(card.image)} sizes="(max-width: 430px) calc(100vw - 72px), 398px" alt={`${card.name}：未来科技暗黑风格塔罗牌`} width="1024" height="1536" decoding="async" className="rail-deck-detail-image" />
        <p className="py-3 text-center text-sm text-apple-text-muted">{card.keywords}</p>
        <div className="flex items-center justify-between gap-3"><button type="button" className="rail-button-secondary" onClick={() => setSelected((card.index + 21) % 22)}>上一张</button><span className="text-sm tabular-nums text-apple-text-muted">{card.index + 1} / 22</span><button type="button" className="rail-button-secondary" onClick={() => setSelected((card.index + 1) % 22)}>下一张</button></div>
      </motion.div>
    </motion.div>}</AnimatePresence>, document.body)}
  </div></div>;
}
