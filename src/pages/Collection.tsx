import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CollectionCard from '../components/CollectionCard';
import { CARD_RARITIES, COLLECTION_CARDS, COLLECTION_DROP_RATE, getOwnedCollectionCards, RARITY_DETAILS, type CardRarity } from '../lib/collectionCards';
import { TAROT_CARDS } from '../lib/tarotDeck';
import PageHeader from '../components/ui/PageHeader';
import { useAppContext, FRAGMENTS_POOL } from '../store';
import { X, Sparkles, Image as ImageIcon, LockKeyhole, ArrowRight, ChevronDown } from 'lucide-react';

export default function Collection() {
  const { collectionDrops } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rarity, setRarity] = useState<CardRarity | 'all'>('all');
  const [onlyOwned, setOnlyOwned] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const ownedCards: ReturnType<typeof getOwnedCollectionCards> = useMemo(() => getOwnedCollectionCards(collectionDrops), [collectionDrops]);
  const ownedById = new Map(ownedCards.map((item) => [item.card.id, item]));
  const selectedCard = COLLECTION_CARDS.find((card) => card.id === searchParams.get('card'));
  const latest = [...ownedCards].sort((a, b) => Date.parse(b.lastObtainedAt) - Date.parse(a.lastObtainedAt))[0];
  const visibleCards = [...COLLECTION_CARDS]
    .filter((card) => (rarity === 'all' || card.rarity === rarity) && (!onlyOwned || ownedById.has(card.id)))
    .sort((a, b) => {
      const ownedA = ownedById.get(a.id);
      const ownedB = ownedById.get(b.id);
      if (ownedA && ownedB) return Date.parse(ownedB.lastObtainedAt) - Date.parse(ownedA.lastObtainedAt);
      return Number(Boolean(ownedB)) - Number(Boolean(ownedA));
    });
  const selectedOwned = selectedCard ? ownedById.get(selectedCard.id) : undefined;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (selectedCard && dialog && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!selectedCard && dialog?.open) {
      dialog.close();
      returnFocusRef.current?.focus({ preventScroll: true });
    }
  }, [selectedCard]);

  const openCard = (id: string) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('card', id); return next; });
  const closeCard = () => setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('card'); return next; }, { replace: true });

  return <div className="rail-page collection-page">
    <div className="rail-page-content">
      <PageHeader eyebrow="对话里的小惊喜" title="收藏图鉴" description="每次完成对话，都有机会获得一张卡。" backTo="/app/explore" />
      <section className="rail-panel collection-intro" aria-label="我的收藏进度">
        <div className="collection-intro-copy">
          <p className="rail-eyebrow">我的收藏</p>
          <p className="collection-progress-number">{ownedCards.length}<span> / {COLLECTION_CARDS.length}</span><small>张已发现</small></p>
          <p className="rail-muted">{latest ? `最近获得：${latest.card.name} · ${latest.card.rarity}` : '第一张卡，从一次对话开始。'}</p>
        </div>
        <Link to="/app" className="rail-button collection-chat-button">去聊聊<ArrowRight size={17} aria-hidden="true" /></Link>
      </section>

      <div className="collection-toolbar">
        <div className="collection-view-tabs" role="group" aria-label="收藏显示范围">
          <button type="button" aria-pressed={!onlyOwned} onClick={() => setOnlyOwned(false)}>全部卡片</button>
          <button type="button" aria-pressed={onlyOwned} onClick={() => setOnlyOwned(true)}>已收藏 {ownedCards.length}</button>
        </div>
        <label className="collection-rarity-filter"><span className="sr-only">按卡片等级筛选</span><select value={rarity} onChange={(event) => setRarity(event.target.value as CardRarity | 'all')}><option value="all">所有等级</option>{CARD_RARITIES.map((item) => <option key={item} value={item}>{item} · {RARITY_DETAILS[item].finish}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></label>
      </div>

      {visibleCards.length ? <div className="collection-grid" aria-label="收藏卡册">{visibleCards.map((card) => <CollectionCard key={card.id} card={card} owned={ownedById.has(card.id)} count={ownedById.get(card.id)?.count ?? 0} onOpen={() => openCard(card.id)} />)}</div> : <div className="collection-empty"><Sparkles size={24} aria-hidden="true" /><h2>还没有{rarity === 'all' ? '' : ` ${rarity} `}卡片</h2><p>完成一次对话，开启你的第一份收藏。</p><Link to="/app" className="rail-button-secondary">开始对话<ArrowRight size={16} aria-hidden="true" /></Link></div>}

      <p className="collection-preview-hint">未获得的卡片可预览工艺；卡面沿用你提供的机械塔罗原画。</p>

      <details className="collection-rules">
        <summary>如何获得卡片<ChevronDown size={17} aria-hidden="true" /></summary>
        <div className="collection-rules-body">
          <p>塔罗、每日运势深度解读、守护灵和八字对话中，每完成一次新的有效回复就有一次获得机会。首次有效对话必得一张 N 卡，之后每次掉卡概率为 {COLLECTION_DROP_RATE * 100}%。</p>
          <p>掉落卡片中，N 占 60%、R 占 27%、SR 占 10%、SSR 占 3%。这些是本应用自己的收藏规则。没有额外付费抽卡。</p>
          <p>每个等级都有不同工艺：N 哑光、R 银边、SR 浮雕、SSR 全息闪膜。卡片永久收藏，重复获得会累计张数。重新生成、失败回复和回看历史不重复掉卡。</p>
        </div>
      </details>

      <details className="collection-rules collection-legacy-disclosure"><summary>旧版记忆碎片<ChevronDown size={17} aria-hidden="true" /></summary><LegacyFragments /></details>
      <Link to="/app/deck" className="collection-deck-link">查看完整的 22 张塔罗牌面<ArrowRight size={15} aria-hidden="true" /></Link>

      <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); closeCard(); }} onClick={(event) => { if (event.target === event.currentTarget) closeCard(); }} aria-labelledby="collection-card-title" className="collection-card-dialog">
        {selectedCard && <>
          <button type="button" onClick={closeCard} aria-label="关闭卡片详情" className="collection-icon-button collection-dialog-close" autoFocus><X size={21} aria-hidden="true" /></button>
          <div className="collection-detail-art"><CollectionCard key={selectedCard.id} card={selectedCard} enlarged owned={Boolean(selectedOwned)} count={selectedOwned?.count ?? 0} /></div>
          <div className="collection-detail-copy">
            <p className="collection-detail-grade">{selectedCard.rarity} · {RARITY_DETAILS[selectedCard.rarity].label} · {RARITY_DETAILS[selectedCard.rarity].finish}</p>
            <h2 id="collection-card-title">{selectedCard.name}</h2>
            <p>{selectedCard.description}</p>
            <span className="collection-detail-status">{selectedOwned ? `已永久收藏 · 共 ${selectedOwned.count} 张` : '工艺预览 · 尚未获得这张卡片'}</span>
            <p className="collection-tilt-hint">移动指针或轻触卡面，看看不同角度的光泽。</p>
            {!selectedOwned && <Link to="/app" className="rail-button collection-chat-button" onClick={closeCard}>去聊聊<ArrowRight size={16} aria-hidden="true" /></Link>}
          </div>
        </>}
      </dialog>
    </div>
  </div>;
}

function LegacyFragments() {
  const { fragments, setFragments, setEnergy, setBondExp } = useAppContext();
  const [selectedFragment, setSelectedFragment] = useState<any>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [useMessage, setUseMessage] = useState<string | null>(null);
  const fragmentDialogRef = useRef<HTMLDialogElement>(null);
  const galleryDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = fragmentDialogRef.current;
    if (selectedFragment && dialog && !dialog.open) dialog.showModal();
    if (!selectedFragment && dialog?.open) dialog.close();
  }, [selectedFragment]);

  useEffect(() => {
    const dialog = galleryDialogRef.current;
    if (showGallery && dialog && !dialog.open) dialog.showModal();
    if (!showGallery && dialog?.open) dialog.close();
  }, [showGallery]);

  const closeFragment = () => { setSelectedFragment(null); setUseMessage(null); };

  const handleUseFragment = (fragment: any) => {
    const existing = fragments.find(f => f.id === fragment.id);
    if (existing && (existing.count === undefined || existing.count > 0)) {
      const newFragments = fragments.map(f => f.id === fragment.id ? { ...f, count: (f.count || 1) - 1 } : f);
      setFragments(newFragments);
      
      let effectMsg = '';
      if (fragment.rarity === 'N') {
        setEnergy(prev => prev + 1);
        effectMsg = `已消耗【${fragment.name}】，能量 +1`;
      } else if (fragment.rarity === 'R') {
        setEnergy(prev => prev + 3);
        setBondExp(prev => prev + 10);
        effectMsg = `已消耗【${fragment.name}】，能量 +3，羁绊 +10`;
      } else if (fragment.rarity === 'SR') {
        setEnergy(prev => prev + 10);
        setBondExp(prev => prev + 50);
        effectMsg = `已消耗【${fragment.name}】，能量 +10，羁绊 +50`;
      } else if (fragment.rarity === 'SSR') {
        setEnergy(prev => prev + 50);
        setBondExp(prev => prev + 200);
        effectMsg = `已消耗【${fragment.name}】！星光共鸣！能量 +50，羁绊 +200！`;
      }

      setUseMessage(effectMsg);
      setTimeout(() => {
        setUseMessage(null);
        setSelectedFragment(null);
      }, 2000);
    }
  };

  const getButtonText = (rarity: string) => {
    switch (rarity) {
      case 'N': return '使用碎片 (恢复 1 点能量)';
      case 'R': return '使用碎片 (恢复 3 能量, +10 羁绊)';
      case 'SR': return '使用碎片 (恢复 10 能量, +50 羁绊)';
      case 'SSR': return '唤醒神器 (恢复 50 能量, +200 羁绊)';
      default: return '使用碎片';
    }
  };

  // Group fragments by rarity
  const grouped = FRAGMENTS_POOL.reduce((acc, f) => {
    if (!acc[f.rarity]) acc[f.rarity] = [];
    acc[f.rarity].push(f);
    return acc;
  }, {} as Record<string, typeof FRAGMENTS_POOL>);

  const rarities = ['SSR', 'SR', 'R', 'N'];
  const isComplete = fragments.length === FRAGMENTS_POOL.length;

  return (
    <div className="collection-legacy">
      <div>
        <p className="rail-muted mb-5">旧版碎片继续保留，仍可查看和兑换能量。新版卡片永久收藏，不会被兑换消耗。</p>
        <section className="rail-panel mb-8 flex flex-wrap items-center justify-between gap-4" aria-label="收集进度">
          <div>
            <p className="rail-muted mb-2">已经发现的记忆</p>
            <p className="text-3xl font-medium tabular-nums">{fragments.length}<span className="ml-2 text-base text-apple-text-muted">/ {FRAGMENTS_POOL.length}</span></p>
          </div>
          {isComplete ? <button type="button" onClick={() => setShowGallery(true)} className="rail-button-secondary"><ImageIcon size={17} />唤醒画廊</button> : <p className="rail-muted max-w-[30ch]">已有碎片继续保留，集齐后可查看画廊。</p>}
        </section>

        <div className="space-y-8">
          {rarities.map((rarity) => {
            const items = grouped[rarity];
            if (!items) return null;
            return (
              <section key={rarity} aria-label={`${rarity} 记忆`}>
                <div className="mb-4 flex items-center gap-3"><h2 className={`text-lg font-semibold ${rarityText(rarity)}`}>{rarity}</h2><span className="rail-muted">{rarityLabel(rarity)}</span><span className="h-px flex-1 bg-apple-border" /></div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
                  {items.map((fragment) => {
                    const owned = fragments.find((item) => item.id === fragment.id);
                    const count = owned ? (owned.count !== undefined ? owned.count : 1) : 0;
                    return (
                      <button key={fragment.id} type="button" disabled={!owned} onClick={() => setSelectedFragment(fragment)} aria-label={owned ? `${fragment.name}，${rarity}，剩余 ${count} 份` : `${rarity}，未知记忆，尚未收集`} className={`relative flex aspect-[4/5] flex-col items-center justify-center overflow-hidden rounded-2xl border px-4 py-5 text-center ${owned ? `bg-apple-surface hover:bg-apple-surface-hover ${rarityBorder(rarity)}` : 'border-apple-border bg-apple-surface-hover'}`}>
                        {owned && <span className="rail-muted absolute top-3 right-3 rounded-full border border-apple-border bg-apple-surface px-2 py-0.5 tabular-nums">×{count}</span>}
                        <span className="flex flex-1 items-center justify-center py-5">{owned ? <span className="text-5xl" aria-hidden="true">{fragment.icon}</span> : <LockKeyhole size={28} aria-hidden="true" className="text-apple-text-muted/50" />}</span>
                        <span className="w-full border-t border-apple-border pt-3 text-[15px] font-medium text-apple-text">{owned ? fragment.name : '未知记忆'}</span>
                        <span className="rail-muted mt-1">{owned ? count === 0 ? '已耗尽 · 仍可回看' : '查看与使用' : '等待发现'}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <dialog ref={fragmentDialogRef} onCancel={closeFragment} onClick={(event) => { if (event.target === event.currentTarget) closeFragment(); }} aria-labelledby="fragment-name" className="m-auto w-[calc(100%_-_32px)] max-w-md max-h-[calc(100dvh_-_48px)] overflow-y-auto rounded-2xl border border-apple-border bg-apple-surface p-6 text-apple-text backdrop:bg-black/55">
          {selectedFragment && <>
            <button type="button" onClick={closeFragment} aria-label="关闭记忆详情" className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-xl text-apple-text-muted hover:bg-apple-surface-hover"><X size={20} /></button>
            <div className="pt-5 text-center">
              <span className="mb-5 block text-7xl" aria-hidden="true">{selectedFragment.icon}</span>
              <p className={`mb-2 text-[13px] font-medium ${rarityText(selectedFragment.rarity)}`}>{selectedFragment.rarity} · {rarityLabel(selectedFragment.rarity)}</p>
              <h2 id="fragment-name" className="text-2xl font-semibold">{selectedFragment.name}</h2>
              <p className="mt-5 mb-6 text-[16px] leading-[1.85] text-apple-text-muted">{selectedFragment.desc}</p>
              {useMessage ? <p role="status" className="rounded-xl border border-apple-gold/25 bg-apple-gold/10 px-4 py-4 text-[15px] leading-[1.8] text-apple-text">{useMessage}</p> : <button type="button" onClick={() => handleUseFragment(selectedFragment)} disabled={fragments.find((fragment) => fragment.id === selectedFragment.id)?.count === 0} className="rail-button w-full">{fragments.find((fragment) => fragment.id === selectedFragment.id)?.count === 0 ? '已耗尽' : getButtonText(selectedFragment.rarity)}</button>}
            </div>
          </>}
        </dialog>

        <dialog ref={galleryDialogRef} onCancel={() => setShowGallery(false)} onClick={(event) => { if (event.target === event.currentTarget) setShowGallery(false); }} aria-labelledby="gallery-title" className="m-auto w-[calc(100%_-_32px)] max-w-lg max-h-[calc(100dvh_-_48px)] overflow-y-auto rounded-2xl border border-apple-border bg-apple-surface p-6 text-apple-text backdrop:bg-black/70">
          <div className="mb-5 flex items-center justify-between gap-4"><h2 id="gallery-title" className="rail-section-title flex items-center gap-2"><Sparkles size={18} className="text-apple-gold" />少女画廊</h2><button type="button" onClick={() => setShowGallery(false)} aria-label="关闭少女画廊" className="flex size-10 items-center justify-center rounded-xl hover:bg-apple-surface-hover"><X size={20} /></button></div>
          {showGallery && <img src={TAROT_CARDS[21].image} alt="集齐记忆碎片后解锁的塔罗少女画作" className="w-full aspect-[3/4] object-cover rounded-xl" />}
          <h3 className="mt-5 font-serif text-2xl">命运的终点</h3>
          <p className="mt-2 text-[15px] leading-[1.85] text-apple-text-muted">你已经收集了所有的记忆碎片。塔罗少女为你揭示了最终的画面。</p>
        </dialog>
      </div>
    </div>
  );
}

function rarityLabel(rarity: string) { return ({ SSR: '星光共鸣', SR: '珍贵记忆', R: '闪光记忆', N: '日常记忆' } as Record<string, string>)[rarity] || '记忆碎片'; }
function rarityText(rarity: string) { return ({ SSR: 'text-amber-700 dark:text-amber-300', SR: 'text-violet-700 dark:text-violet-300', R: 'text-sky-700 dark:text-sky-300', N: 'text-apple-text-muted' } as Record<string, string>)[rarity] || 'text-apple-text-muted'; }
function rarityBorder(rarity: string) { return ({ SSR: 'border-amber-600/40 dark:border-amber-300/40', SR: 'border-violet-500/35', R: 'border-sky-500/35', N: 'border-apple-border' } as Record<string, string>)[rarity] || 'border-apple-border'; }
