import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Github, Globe, Shield, Sparkles } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

export default function About() {
  return (
    <div className="rail-page">
      <div className="rail-page-content">
        <PageHeader eyebrow="关于我们" title="关于塔罗少女" description="让每一次提问，都有一处温柔的落点。" backTo="/app/profile" />
        <section className="rail-panel mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
          <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl border border-apple-gold/25 bg-apple-gold/10 text-apple-gold"><Sparkles size={32} aria-hidden="true" /></div>
          <div>
            <h2 className="font-serif text-3xl font-medium leading-relaxed text-apple-text">塔罗少女</h2>
            <p className="rail-muted mt-1 mb-6 tabular-nums">Version 1.0.0</p>
            <div className="space-y-4 text-[16px] leading-[1.9] text-apple-text-muted max-w-[64ch]">
              <p>“塔罗少女”是一款结合塔罗、日记与 AI 对话的中文陪伴应用。</p>
              <p>在这里，你可以与温柔、细腻的塔罗少女对话，倾诉烦恼，抽取塔罗牌，把心事慢慢整理成下一步。</p>
              <p className="font-serif text-xl text-apple-text">愿塔罗少女的指引，能为你照亮前行的道路。</p>
            </div>
          </div>
        </section>
        <section aria-label="了解更多" className="rail-surface overflow-hidden divide-y divide-apple-border">
          <Link to="/" className="flex items-center justify-between gap-4 px-5 py-5 hover:bg-apple-surface-hover"><span className="flex items-center gap-3"><Globe size={18} className="text-apple-gold" />官方网站</span><ArrowUpRight size={17} className="text-apple-text-muted" /></Link>
          <a href="https://github.com/andromedaa1985-collab/star-tarot-girl" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-4 px-5 py-5 hover:bg-apple-surface-hover"><span className="flex items-center gap-3"><Github size={18} className="text-apple-gold" />开源社区</span><ArrowUpRight size={17} className="text-apple-text-muted" /></a>
          <Link to="/app/settings/privacy" className="flex items-center justify-between gap-4 px-5 py-5 hover:bg-apple-surface-hover"><span className="flex items-center gap-3"><Shield size={18} className="text-apple-gold" />隐私与存档</span><ArrowUpRight size={17} className="text-apple-text-muted" /></Link>
        </section>
        <p className="rail-muted mt-8 text-center">© 2026 Tarot Girl. All rights reserved.</p>
      </div>
    </div>
  );
}
