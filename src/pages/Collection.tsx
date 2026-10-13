import React, { useEffect, useRef, useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import { useAppContext, FRAGMENTS_POOL } from '../store';
import { X, Sparkles, Image as ImageIcon, LockKeyhole } from 'lucide-react';

export default function Collection() {
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
        effectMsg = `已消耗【${fragment.name}】！星轨共鸣！能量 +50，羁绊 +200！`;
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
    <div className="rail-page">
      <div className="rail-page-content">
        <PageHeader eyebrow="命运收藏" title="记忆图鉴" description="收集命运的碎片，拼凑完整的星轨。每一份记忆，都可以成为下一次出发的能量。" backTo="/app/profile" />
        <section className="rail-panel mb-8 flex flex-wrap items-center justify-between gap-4" aria-label="收集进度">
          <div>
            <p className="rail-muted mb-2">已经发现的记忆</p>
            <p className="text-3xl font-medium tabular-nums">{fragments.length}<span className="ml-2 text-base text-apple-text-muted">/ {FRAGMENTS_POOL.length}</span></p>
          </div>
          {isComplete ? <button type="button" onClick={() => setShowGallery(true)} className="rail-button-secondary"><ImageIcon size={17} />唤醒画廊</button> : <p className="rail-muted max-w-[30ch]">新碎片掉落尚未开放。已有收藏继续保留，集齐后可查看星轨画廊。</p>}
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
          <div className="mb-5 flex items-center justify-between gap-4"><h2 id="gallery-title" className="rail-section-title flex items-center gap-2"><Sparkles size={18} className="text-apple-gold" />星轨画廊</h2><button type="button" onClick={() => setShowGallery(false)} aria-label="关闭星轨画廊" className="flex size-10 items-center justify-center rounded-xl hover:bg-apple-surface-hover"><X size={20} /></button></div>
          {showGallery && <img src="https://image.pollinations.ai/prompt/anime-girl-white-hair-tarot-card-goddess?width=800&height=1200&nologo=true" alt="集齐记忆碎片后解锁的星轨少女画作" className="w-full aspect-[3/4] object-cover rounded-xl" onError={(event) => { if (!event.currentTarget.src.includes('images.unsplash.com')) event.currentTarget.src = 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80&w=800'; }} />}
          <h3 className="mt-5 font-serif text-2xl">命运的终点</h3>
          <p className="mt-2 text-[15px] leading-[1.85] text-apple-text-muted">你已经收集了所有的记忆碎片。星轨的引路人为你揭示了最终的画面。</p>
        </dialog>
      </div>
    </div>
  );
}

function rarityLabel(rarity: string) { return ({ SSR: '星轨共鸣', SR: '珍贵记忆', R: '闪光记忆', N: '日常记忆' } as Record<string, string>)[rarity] || '记忆碎片'; }
function rarityText(rarity: string) { return ({ SSR: 'text-amber-700 dark:text-amber-300', SR: 'text-violet-700 dark:text-violet-300', R: 'text-sky-700 dark:text-sky-300', N: 'text-apple-text-muted' } as Record<string, string>)[rarity] || 'text-apple-text-muted'; }
function rarityBorder(rarity: string) { return ({ SSR: 'border-amber-600/40 dark:border-amber-300/40', SR: 'border-violet-500/35', R: 'border-sky-500/35', N: 'border-apple-border' } as Record<string, string>)[rarity] || 'border-apple-border'; }
