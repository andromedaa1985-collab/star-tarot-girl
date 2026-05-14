import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const FAQS = [
  { q: "如何获得占卜能量？", a: "能量会随着时间自然恢复，每小时恢复1点。您也可以通过提升与星轨少女的羁绊等级来获得额外的能量上限和一次性恢复。" },
  { q: "羁绊等级有什么用？", a: "羁绊等级代表您与星轨少女的连接深度。等级提升可以解锁新的陪伴形象、专属塔罗牌背以及特殊的占卜仪式。" },
  { q: "图鉴里的碎片怎么收集？", a: "每次进行深度占卜（消耗能量的占卜）时，都有概率掉落记忆碎片。集齐特定组合的碎片可以解锁星轨少女的隐藏剧情。" },
  { q: "占卜结果准确吗？", a: "塔罗牌是一种反映潜意识和能量流动的工具。星轨少女会根据牌面为您提供指引，但最终的决定权始终在您自己手中。" }
];

export default function Help() {
  const navigate = useNavigate();

  return (
    <div className="relative h-full w-full overflow-y-auto overscroll-contain px-6 pt-4 pb-40 text-apple-text no-scrollbar">
      <div className="flex items-center mb-8">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-apple-surface-hover transition-colors text-apple-text">
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-sans text-2xl font-bold tracking-widest text-[#6B8AFF] ml-2">帮助中心</h1>
      </div>
      
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-apple-text-muted tracking-widest ml-2 mb-2">常见问题 (FAQ)</h2>
        {FAQS.map((faq, i) => (
          <FAQItem key={i} question={faq.q} answer={faq.a} />
        ))}

        <div className="mt-8 glass-panel rounded-3xl p-6 text-center border-apple-border shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <h3 className="font-sans font-bold text-apple-text mb-2">需要更多帮助？</h3>
          <p className="text-xs text-apple-text-muted mb-4">如果您遇到了其他问题，或者有任何建议，欢迎随时联系我们。</p>
          <button className="px-6 py-2 bg-[#6B8AFF] text-white rounded-full text-sm font-medium hover:bg-[#4F46E5] transition-colors shadow-[0_4px_15px_rgba(107,138,255,0.3)]">
            联系客服
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const FAQItem: React.FC<{ question: string, answer: string }> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="glass-panel rounded-2xl overflow-hidden border-apple-border shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-apple-surface transition-colors"
      >
        <span className="font-medium text-apple-text text-sm">{question}</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={18} className="text-apple-text-muted" />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-apple-surface"
          >
            <div className="p-5 pt-0 text-sm text-apple-text-muted leading-relaxed border-t border-apple-border mt-2 pt-4">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
