import React from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

const FAQS = [
  { q: '如何获得占卜能量？', a: '能量会随着时间自然恢复，每小时恢复1点。您也可以通过提升与星轨少女的羁绊等级来获得额外的能量上限和一次性恢复。' },
  { q: '羁绊等级有什么用？', a: '羁绊等级代表您与星轨少女的连接深度。等级提升可以解锁新的陪伴形象、专属塔罗牌背以及特殊的占卜仪式。' },
  { q: '图鉴里的碎片怎么收集？', a: '每次进行深度占卜（消耗能量的占卜）时，都有概率掉落记忆碎片。集齐特定组合的碎片可以解锁星轨少女的隐藏剧情。' },
  { q: '占卜结果准确吗？', a: '塔罗牌是一种反映潜意识和能量流动的工具。星轨少女会根据牌面为您提供指引，但最终的决定权始终在您自己手中。' },
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
