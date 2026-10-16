import React from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

const FAQS = [
  { q: '如何获得占卜能量？', a: '首页会显示当前可用能量，部分购买方案会赠送能量，具体数量可以在“我的”中查看。当前没有按小时自动恢复的机制。' },
  { q: '羁绊等级有什么用？', a: '羁绊等级记录你与塔罗少女相伴的积累。当前等级和成长进度可以在“我的”中查看，具体可用形象与功能以页面显示为准。' },
  { q: '收藏图鉴里的卡片怎么收集？', a: '完成有效对话后，有机会获得收藏卡。不同稀有度有不同卡面质感，SSR 带有全息闪卡效果；重复获得的卡片会累计数量。具体获得规则和概率可以在收藏图鉴中查看，已有收藏会继续保留。' },
  { q: '如何看待塔罗解读？', a: '塔罗解读可以作为整理想法和情绪的参考，不能保证预测未来。你可以把建议与自己的实际处境对照，再决定下一步。' },
];

export default function Help() {
  return (
    <div className="rail-page">
      <div className="rail-page-content">
        <PageHeader eyebrow="支持与帮助" title="帮助中心" description="关于能量、羁绊和塔罗解读，先从这些常见问题开始。" backTo="/app/settings" />
        <section aria-labelledby="faq-heading" className="mb-8">
          <h2 id="faq-heading" className="rail-section-title mb-4">常见问题</h2>
          <div className="rail-surface overflow-hidden divide-y divide-apple-border">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-base font-medium hover:bg-apple-surface-hover [&::-webkit-details-marker]:hidden">
                  <span>{faq.q}</span>
                  <ChevronDown size={18} aria-hidden="true" className="text-apple-text-muted transition-transform duration-150 group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-6 text-[15px] leading-[1.85] text-apple-text-muted max-w-[68ch]">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="rail-panel flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="rail-section-title">还有其他问题？</h2>
            <p className="rail-muted mt-2">遇到使用问题或有新的建议，可以在项目社区提交反馈。</p>
          </div>
          <a className="rail-button-secondary shrink-0" href="https://github.com/andromedaa1985-collab/star-tarot-girl/issues" target="_blank" rel="noopener noreferrer"><MessageCircle size={17} />提交反馈</a>
        </section>
      </div>
    </div>
  );
}
