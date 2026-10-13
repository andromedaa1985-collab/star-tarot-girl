import React from 'react';
import { Check, LockKeyhole, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../store';
import { hasFeatureAccess, type PremiumFeature } from '../lib/membership';

const FEATURE_COPY: Record<PremiumFeature, { title: string; eyebrow: string; desc: string; cta: string; planId: string; gains: string[] }> = {
  bazi: {
    title: '八字完整档案',
    eyebrow: '把出生信息变成长期底稿',
    desc: '免费版可以先体验塔罗与日记。解锁后会保存一份命理底稿，并在问近期运势时结合当前时间、流年流月流日来推断。',
    cta: '解锁八字档案',
    planId: 'bazi_full_archive',
    gains: ['长期命理档案', '近期运势参考', '适合生日、考试、求职节点'],
  },
  simulator: {
    title: '选择沙盘',
    eyebrow: '不用每次从头讲背景',
    desc: '沙盘会把你的问题、牌迹、日记和性格档案接在一起推演，适合那些一句话说不清的选择题。',
    cta: '开通 Plus',
    planId: 'plus_monthly',
    gains: ['长期记忆', '多轮推演', '把分散记录串成一条线'],
  },
  guardian: {
    title: '星轨守护',
    eyebrow: '更像有人一直记得你',
    desc: '守护会持续读取你的日记、牌迹与命理档案，把零散情绪整理成更温柔的长期陪伴。',
    cta: '开通 Plus',
    planId: 'plus_monthly',
    gains: ['长期陪伴信件', '日记复盘', '更贴近你的说话方式'],
  },
  tarot_deep_report: {
    title: '深度牌阵报告',
    eyebrow: '这次问题值得讲完整',
    desc: '单张塔罗可以免费体验；解锁深度报告后，会用五张牌把现状、阻碍、选择和建议拆开讲清楚。',
    cta: '解锁深度报告',
    planId: 'tarot_deep_report',
    gains: ['五张牌阵', '连续追问', '报告沉淀，方便复盘'],
  },
  relationship_report: {
    title: '双人关系合盘',
    eyebrow: '已并入完整档案包',
    desc: '先免费看看默契分；完整档案包会同时打开八字底稿、关系合盘和 7 日陪伴，不再把关系拆成零散小付费。',
    cta: '解锁完整档案包',
    planId: 'bazi_full_archive',
    gains: ['双人吸引力分析', '冲突雷区提醒', '7 日关系陪伴'],
  },
  relationship_weekly: {
    title: '7 日关系陪伴',
    eyebrow: '和关系合盘一起解锁',
    desc: '7 日陪伴现在作为完整档案包的一部分：先建立命盘和关系底稿，再慢慢观察这段关系怎么落到日常里。',
    cta: '解锁完整档案包',
    planId: 'bazi_full_archive',
    gains: ['每日相处任务', '关系时间线', '一周后复盘建议'],
  },
};

export function FeatureGate({
  feature,
  children,
}: {
  feature: PremiumFeature;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { membership, tarotReadings, diaryEntries, profiles, simulationHistory } = useAppContext();
  if (hasFeatureAccess(membership, feature)) return <>{children}</>;

  const copy = FEATURE_COPY[feature];
  const paidCopy =
    feature === 'guardian'
      ? {
          ...copy,
          title: '守护回访',
          eyebrow: '不是泛泛寄语，而是回应最近的你',
          desc: 'Plus 会让守护每日读取最近牌迹、日记和选择，写成一封短回访，并给一个低压力小动作。',
          gains: ['回应近期线索', '每日低压力行动', '接入长期记忆和 7 日复盘'],
        }
      : feature === 'simulator'
        ? {
            ...copy,
            desc: 'Plus 会把选择沙盘接入你的牌迹、日记和档案，让推演更像围绕你的长期处境展开。',
            gains: ['结合长期记忆', '记录每次选择', '复盘反复出现的岔路'],
          }
        : copy;
  const memoryCount = tarotReadings.length + diaryEntries.length + profiles.length + simulationHistory.length;
  const memoryHint =
    memoryCount > 0
      ? `你已经留下 ${memoryCount} 份线索。解锁后，星轨会把它们接成更完整的上下文。`
      : '先解锁一块长期底稿，之后每一次追问都不用重新铺垫。';

  return (
    <section className="rail-page bg-apple-bg" aria-labelledby="feature-gate-title">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center">
        <div className="rail-panel sm:p-8">
        <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-apple-border bg-apple-bg text-apple-accent">
          <LockKeyhole size={25} aria-hidden="true" />
        </div>
        <p className="rail-eyebrow text-pretty">{paidCopy.eyebrow}</p>
        <h1 id="feature-gate-title" className="text-balance font-serif text-3xl font-medium leading-relaxed">{paidCopy.title}</h1>
        <p className="rail-body mt-4 text-pretty text-apple-text-muted">{paidCopy.desc}</p>
        <div className="mt-7 border-y border-apple-border py-6">
          <h3 className="rail-section-title">解锁后，你可以</h3>
          <ul className="mt-4 space-y-3">
            {paidCopy.gains.map((gain) => (
              <li key={gain} className="flex items-start gap-3 text-base leading-7 text-apple-text">
                <Check size={18} className="mt-1 shrink-0 text-apple-accent" aria-hidden="true" /><span>{gain}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-5 rounded-xl bg-apple-bg p-4">
          <p className="text-sm font-medium text-apple-text">接着你的故事，慢慢往下看</p>
          <p className="rail-muted mt-2 text-pretty">{memoryHint}</p>
        </div>
        <div className="mt-7 grid gap-3">
          <button
            type="button"
            onClick={() => navigate(`/app/profile?plus=1&plan=${paidCopy.planId}`)}
            className="rail-button w-full"
          >
            <WalletCards size={18} aria-hidden="true" />
            {paidCopy.cta}
          </button>
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="rail-button-secondary w-full"
          >
            返回今日塔罗
          </button>
        </div>
        </div>
      </div>
    </section>
  );
}
