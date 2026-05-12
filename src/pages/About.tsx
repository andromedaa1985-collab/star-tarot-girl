import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Sparkles, Github, Twitter, Globe } from 'lucide-react';
import { motion } from 'motion/react';

export default function About() {
  const navigate = useNavigate();

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-y-auto overscroll-contain px-6 pt-4 pb-40 text-apple-text no-scrollbar">
      <div className="w-full flex items-center mb-12">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-apple-surface-hover transition-colors text-apple-text"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-sans text-2xl font-bold tracking-widest text-[#6B8AFF] ml-2">关于星轨</h1>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center mb-12"
      >
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-[#6B8AFF] to-[#4F46E5] shadow-[0_4px_20px_rgba(107,138,255,0.4)] flex items-center justify-center mb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-apple-surface-hover backdrop-blur-sm"></div>
          <Sparkles size={40} className="text-apple-text z-10 drop-shadow-md" />
        </div>
        <h2 className="font-sans text-3xl font-bold tracking-widest text-apple-text mb-2">星轨塔罗</h2>
        <span className="text-sm font-mono text-apple-text-muted tracking-widest">Version 1.0.0</span>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="w-full glass-panel rounded-3xl p-6 border-apple-border shadow-[0_4px_20px_rgba(0,0,0,0.3)] mb-8 text-center"
      >
        <p className="text-sm text-apple-text-muted leading-relaxed tracking-wide">
          “星轨塔罗”是一款结合了神秘学与现代 AI 技术的占卜应用。
          <br /><br />
          在这里，你可以与温柔、细腻的塔罗牌少女“星轨的引路人”对话，倾诉烦恼，抽取塔罗牌，并获得充满情感共鸣的解读。
          <br /><br />
          愿星轨的指引，能为你照亮前行的道路。
        </p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="w-full flex flex-col gap-4"
      >
        <div className="glass-panel rounded-2xl overflow-hidden border-apple-border shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <LinkRow icon={<Globe size={18} />} title="官方网站" />
          <LinkRow icon={<Twitter size={18} />} title="关注我们" />
          <LinkRow icon={<Github size={18} />} title="开源社区" hasBorder={false} />
        </div>
        
        <div className="flex justify-center gap-6 mt-8 text-xs text-apple-text-muted">
          <span className="hover:text-[#6B8AFF] cursor-pointer transition-colors">服务条款</span>
          <span>|</span>
          <span className="hover:text-[#6B8AFF] cursor-pointer transition-colors">隐私政策</span>
        </div>
        
        <div className="text-center text-[10px] text-apple-text-muted/30 mt-4 font-mono">
          © 2026 Star Track Tarot. All rights reserved.
        </div>
      </motion.div>
    </div>
  );
}

function LinkRow({ icon, title, hasBorder = true }: { icon: React.ReactNode, title: string, hasBorder?: boolean }) {
  return (
    <div className={`flex items-center justify-between p-4 hover:bg-apple-surface transition-colors cursor-pointer ${hasBorder ? 'border-b border-apple-border' : ''}`}>
      <div className="flex items-center gap-3 text-apple-text">
        {icon}
        <span className="font-medium tracking-wide text-sm">{title}</span>
      </div>
      <ChevronLeft size={16} className="text-apple-text-muted rotate-180" />
    </div>
  );
}
