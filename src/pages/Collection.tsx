import React, { useState } from 'react';
import { useAppContext, FRAGMENTS_POOL } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Image as ImageIcon } from 'lucide-react';

export default function Collection() {
  const { fragments, setFragments, setEnergy, setBondExp } = useAppContext();
  const [selectedFragment, setSelectedFragment] = useState<any>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [useMessage, setUseMessage] = useState<string | null>(null);

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
    <div className="relative h-full w-full overflow-y-auto overscroll-contain px-6 pt-4 pb-40 text-apple-text no-scrollbar">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-[#6B8AFF]/5 to-transparent pointer-events-none"></div>
      <div className="absolute top-10 right-10 w-32 h-32 border border-[#6B8AFF]/10 rounded-full flex items-center justify-center pointer-events-none">
        <div className="w-24 h-24 border border-[#6B8AFF]/10 rounded-full rotate-45"></div>
      </div>
      <div className="absolute top-20 left-10 w-16 h-16 border border-[#6B8AFF]/10 rotate-45 pointer-events-none"></div>

      <div className="flex flex-col items-center mb-10 relative z-10">
        <h1 className="font-sans text-3xl font-bold tracking-widest text-[#6B8AFF] mb-2">
          记忆图鉴
        </h1>
        <p className="text-apple-text-muted text-sm tracking-widest">收集命运的碎片，拼凑完整的星轨</p>
        
        <div className="mt-6 px-4 py-2 glass-pill text-sm text-apple-text flex items-center gap-4">
          <span>收集进度: <span className="text-[#6B8AFF] font-bold">{fragments.length}</span> / {FRAGMENTS_POOL.length}</span>
          {isComplete && (
            <button 
              onClick={() => setShowGallery(true)}
              className="flex items-center gap-1 text-[#6B8AFF] hover:text-[#4F46E5] transition-colors"
            >
              <Sparkles size={14} /> 唤醒画廊
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {rarities.map(rarity => {
          const items = grouped[rarity];
          if (!items) return null;
          
          return (
            <div key={rarity} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10"></div>
                <span className={`font-sans text-lg font-bold tracking-widest rarity-${rarity}`}>{rarity}</span>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10"></div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
                {items.map(f => {
                  const hasIt = fragments.find(p => p.id === f.id);
                  const count = hasIt ? (hasIt.count !== undefined ? hasIt.count : 1) : 0;
                  return (
                    <motion.div 
                      key={f.id} 
                      layoutId={`fragment-card-${f.id}`}
                      whileTap={hasIt ? { scale: 0.95 } : {}}
                      onClick={() => hasIt && setSelectedFragment(f)}
                      className={`group relative aspect-[2/3] rounded-2xl flex flex-col items-center justify-center p-4 transition-all duration-500 overflow-hidden ${
                        !hasIt ? 'bg-apple-surface-hover border border-apple-border shadow-inner' : 
                        rarity === 'SSR' ? 'cursor-pointer bg-gradient-to-br from-[#2A2410] to-[#1A1608] border border-[#FFD700]/30 shadow-[0_8px_20px_rgba(255,215,0,0.1)] hover:shadow-[0_12px_30px_rgba(255,215,0,0.2)] hover:-translate-y-2' :
                        rarity === 'SR' ? 'cursor-pointer bg-gradient-to-br from-[#241030] to-[#160820] border border-[#9D00FF]/30 shadow-[0_8px_20px_rgba(157,0,255,0.1)] hover:shadow-[0_12px_30px_rgba(157,0,255,0.2)] hover:-translate-y-2' :
                        rarity === 'R' ? 'cursor-pointer bg-gradient-to-br from-[#101A30] to-[#081020] border border-[#007AFF]/30 shadow-[0_4px_15px_rgba(0,122,255,0.1)] hover:shadow-[0_12px_25px_rgba(0,122,255,0.2)] hover:-translate-y-2' :
                        'cursor-pointer bg-apple-surface border border-apple-border shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:border-[#6B8AFF]/30 hover:-translate-y-2'
                      }`}
                    >
                      {/* Inner decorative border for unlocked cards */}
                      {hasIt && (
                        <div className={`absolute inset-1.5 border border-dashed rounded-xl pointer-events-none opacity-40 transition-opacity group-hover:opacity-70 ${
                          rarity === 'SSR' ? 'border-[#FFD700]' :
                          rarity === 'SR' ? 'border-[#9D00FF]' :
                          rarity === 'R' ? 'border-[#6B8AFF]' :
                          'border-gray-500'
                        }`}></div>
                      )}

                      {/* Count Badge */}
                      {hasIt && count !== 1 && (
                        <div className={`absolute top-2 right-2 text-apple-text text-xs font-bold px-2 py-1 rounded-full z-10 ${count === 0 ? 'bg-gray-700/80' : 'bg-black/80'}`}>
                          x{count}
                        </div>
                      )}

                      {/* Locked State Card Back Pattern */}
                      {!hasIt && (
                        <div className="absolute inset-1.5 border border-apple-border rounded-xl pointer-events-none flex items-center justify-center opacity-50">
                          <div className="w-full h-full border border-apple-border m-1 rounded-lg flex items-center justify-center">
                            <div className="w-8 h-8 border border-apple-border rotate-45"></div>
                          </div>
                        </div>
                      )}

                      {/* Existing effects for SSR/SR */}
                      {hasIt && rarity === 'SSR' && (
                        <>
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,215,0,0.15),transparent_60%)] animate-gold-shine pointer-events-none"></div>
                          <Sparkles className="absolute top-3 right-3 text-[#FFD700] animate-ping opacity-70 pointer-events-none" size={14} />
                          <Sparkles className="absolute bottom-3 left-3 text-[#FFD700] animate-pulse opacity-70 pointer-events-none" size={18} />
                        </>
                      )}
                      {hasIt && rarity === 'SR' && (
                        <>
                          <div className="absolute inset-0 w-[200%] h-full bg-gradient-to-r from-transparent via-[#9D00FF]/10 to-transparent animate-shimmer pointer-events-none"></div>
                        </>
                      )}

                      {/* Content */}
                      <div className="flex-1 flex items-center justify-center relative z-10 w-full">
                        {hasIt ? (
                          <motion.div layoutId={`fragment-icon-${f.id}`} className="text-5xl sm:text-6xl drop-shadow-md group-hover:scale-110 transition-transform duration-500">
                            {f.icon}
                          </motion.div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-apple-surface flex items-center justify-center text-apple-text-muted/20 shadow-inner">
                            <Sparkles size={20} />
                          </div>
                        )}
                      </div>

                      <div className="w-full mt-auto pt-3 border-t border-apple-border relative z-10 bg-black/20 backdrop-blur-sm -mx-4 px-4 -mb-4 pb-4">
                        <motion.div layoutId={`fragment-name-${f.id}`} className={`text-xs font-bold text-center tracking-widest ${
                          hasIt ? 
                            rarity === 'SSR' ? 'text-[#FFD700]' :
                            rarity === 'SR' ? 'text-[#DDA0DD]' :
                            rarity === 'R' ? 'text-[#87CEFA]' :
                            'text-apple-text'
                          : 'text-apple-text-muted'
                        }`}>
                          {hasIt ? f.name : '未知记忆'}
                        </motion.div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedFragment && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xl flex items-center justify-center p-6"
            onClick={() => { setSelectedFragment(null); setUseMessage(null); }}
          >
            <motion.div 
              layoutId={`fragment-card-${selectedFragment.id}`}
              className={`w-full max-w-sm bg-apple-surface backdrop-blur-xl p-8 flex flex-col items-center text-center relative shadow-2xl overflow-hidden rounded-3xl ${
                selectedFragment.rarity === 'SSR' ? 'border border-[#FFD700]/50 shadow-[0_10px_40px_rgba(255,215,0,0.2)]' :
                selectedFragment.rarity === 'SR' ? 'border border-[#9D00FF]/40 shadow-[0_10px_30px_rgba(157,0,255,0.15)]' :
                'border border-apple-border'
              }`}
              onClick={e => e.stopPropagation()}
            >
              {selectedFragment.rarity === 'SSR' && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-b from-[#FFD700]/10 to-transparent pointer-events-none"></div>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,215,0,0.15),transparent_50%)] animate-gold-shine pointer-events-none"></div>
                  <Sparkles className="absolute top-4 right-12 text-[#FFD700] animate-ping opacity-70 pointer-events-none" size={16} />
                  <Sparkles className="absolute bottom-12 left-6 text-[#FFD700] animate-pulse opacity-70 pointer-events-none" size={24} />
                </>
              )}
              {selectedFragment.rarity === 'SR' && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-b from-[#9D00FF]/5 to-transparent pointer-events-none"></div>
                  <div className="absolute inset-0 w-[200%] h-full bg-gradient-to-r from-transparent via-[#9D00FF]/10 to-transparent animate-shimmer pointer-events-none"></div>
                </>
              )}
              
              <button onClick={() => { setSelectedFragment(null); setUseMessage(null); }} className="absolute top-4 right-4 text-apple-text-muted hover:text-apple-text z-10"><X size={20}/></button>
              
              <motion.div layoutId={`fragment-icon-${selectedFragment.id}`} className="text-7xl mb-6 drop-shadow-md relative z-10">{selectedFragment.icon}</motion.div>
              
              <div className="flex items-center gap-2 mb-2 relative z-10">
                <span className={`text-sm font-bold px-2 py-0.5 rounded border rarity-${selectedFragment.rarity} border-current`}>
                  {selectedFragment.rarity}
                </span>
                <motion.h3 layoutId={`fragment-name-${selectedFragment.id}`} className="font-sans font-bold text-2xl text-apple-text">{selectedFragment.name}</motion.h3>
              </div>
              
              <div className="w-12 h-px bg-gradient-to-r from-transparent via-[#6B8AFF]/50 to-transparent my-4 relative z-10"></div>
              
              <p className="text-apple-text-muted text-sm leading-relaxed tracking-wide mb-6 relative z-10">
                {selectedFragment.desc}
              </p>

              <div className="relative z-10 w-full">
                {useMessage ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`font-medium text-sm px-4 py-3 rounded-xl ${
                      selectedFragment.rarity === 'SSR' ? 'bg-[#FFD700]/20 text-[#FFD700]' :
                      selectedFragment.rarity === 'SR' ? 'bg-[#9D00FF]/20 text-[#DDA0DD]' :
                      'bg-[#6B8AFF]/20 text-[#87CEFA]'
                    }`}
                  >
                    {useMessage}
                  </motion.div>
                ) : (
                  <button 
                    onClick={() => handleUseFragment(selectedFragment)}
                    disabled={fragments.find(f => f.id === selectedFragment.id)?.count === 0}
                    className={`w-full py-3 rounded-xl text-apple-text font-medium shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-colors active:scale-95 ${
                      fragments.find(f => f.id === selectedFragment.id)?.count === 0 ? 'bg-gray-700 cursor-not-allowed opacity-50' :
                      selectedFragment.rarity === 'SSR' ? 'bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#E6C200] hover:to-[#E69500] shadow-[0_4px_15px_rgba(255,215,0,0.4)] text-black' :
                      selectedFragment.rarity === 'SR' ? 'bg-gradient-to-r from-[#9D00FF] to-[#C71585] hover:from-[#8A00E6] hover:to-[#B31277] shadow-[0_4px_15px_rgba(157,0,255,0.3)]' :
                      'bg-[#6B8AFF] hover:bg-[#4F46E5]'
                    }`}
                  >
                    {fragments.find(f => f.id === selectedFragment.id)?.count === 0 ? '已耗尽' : getButtonText(selectedFragment.rarity)}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {showGallery && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-2xl flex flex-col items-center justify-center p-6"
          >
            <button onClick={() => setShowGallery(false)} className="absolute top-6 right-6 text-apple-text-muted hover:text-apple-text z-50"><X size={24}/></button>
            <h2 className="font-sans font-bold text-2xl text-[#6B8AFF] mb-8 tracking-widest">星轨画廊</h2>
            <div className="w-full max-w-md aspect-[3/4] rounded-2xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-apple-border relative">
              <img 
                src="https://image.pollinations.ai/prompt/anime-girl-white-hair-tarot-card-goddess?width=800&height=1200&nologo=true" 
                alt="Gallery" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80&w=800";
                }}
              />
              <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-[#141419] via-[#141419]/80 to-transparent">
                <h3 className="font-sans font-bold text-xl text-apple-text mb-2">命运的终点</h3>
                <p className="text-apple-text-muted text-sm leading-relaxed">
                  你已经收集了所有的记忆碎片。星轨的引路人为你揭示了最终的画面。
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
