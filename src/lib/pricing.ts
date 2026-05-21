export type ProductPlanId =
  | 'tarot_deep_report'
  | 'plus_monthly'
  | 'relationship_report'
  | 'relationship_weekly'
  | 'couple_plus_monthly'
  | 'bazi_full_archive';

export interface ProductPlan {
  id: ProductPlanId;
  label: string;
  paymentName: string;
  price: string;
  amount: string;
  badge: string;
  title: string;
  desc: string;
  bullets: string[];
  description: string;
  entitlement: Record<string, unknown>;
  limits: Record<string, unknown>;
  features: string[];
  experiment: {
    tier: 'entry' | 'subscription' | 'relationship' | 'archive';
    variant: string;
    hypothesis: string;
  };
}

export type PaymentPlan = Pick<
  ProductPlan,
  'id' | 'amount' | 'description' | 'entitlement' | 'limits' | 'features'
> & {
  name: string;
};

export const SHOP_PLANS: ProductPlan[] = [
  {
    id: 'tarot_deep_report',
    label: '深度牌阵报告',
    paymentName: '星轨深度牌阵报告',
    price: '3.9',
    amount: '3.90',
    badge: '轻量入门',
    title: '把这一次问题讲完整',
    desc: '单次报告适合一个已经很清楚的问题；如果你会连续回访同一主题，Plus 更划算。',
    bullets: ['五张牌拆开现状、阻碍和建议', '把模糊情绪变成可复盘文字', '赠送 6 点能量，买完马上继续问'],
    description: '一次五张牌阵、温柔解读、可追问与报告沉淀',
    entitlement: { type: 'report', report: 'tarot', energyBonus: 6 },
    limits: { tarotReadings: 1, followups: 5 },
    features: ['五张牌阵深度解读', '本次牌面可连续追问', '沉淀为一张可复盘报告'],
    experiment: {
      tier: 'entry',
      variant: 'single-report-3-9',
      hypothesis: '低价单次报告降低首次付费阻力，但不抢 Plus 的长期价值。',
    },
  },
  {
    id: 'plus_monthly',
    label: '星轨 Plus',
    paymentName: '星轨 Plus 月卡',
    price: '9.9',
    amount: '9.90',
    badge: '长期记忆',
    title: '让星轨真正记得你',
    desc: '适合会反复问同一段关系、工作或选择的人。Plus 会把牌迹、日记和守护回访接成长期档案。',
    bullets: ['7 日复盘整理反复主题和行动建议', '更多牌迹长期保存，适合连续追问', '守护回访会回应最近真实线索'],
    description: '长期记忆、每周复盘、无限追问当前牌面与陪伴成长',
    entitlement: { type: 'membership', plan: 'plus', days: 31, energyFloor: 20 },
    limits: { tarotReadings: 200, dailyCheckInEnergy: 2, dailyMissionEnergy: 6 },
    features: ['每周情绪与牌面复盘', '200 条牌迹长期保存', 'Plus 期间抽牌不扣能量', '专属牌面与陪伴细节'],
    experiment: {
      tier: 'subscription',
      variant: 'memory-plus-9-9',
      hypothesis: '9.9 元月卡主卖长期记忆，比单卖次数更容易让高意向用户接受。',
    },
  },
  {
    id: 'relationship_report',
    label: '双人关系合盘',
    paymentName: '双人关系合盘报告',
    price: '6.9',
    amount: '6.90',
    badge: '适合情侣',
    title: '把“我们合不合”讲明白',
    desc: '适合两个人一起看。解锁吸引点、冲突雷区、沟通方式和关系时间线。',
    bullets: ['看见彼此最容易靠近的地方', '提前知道容易吵的雷区', '沉淀一条关系时间线'],
    description: '吸引点、冲突雷区、沟通方式与 7 日相处任务',
    entitlement: { type: 'report', report: 'relationship', energyBonus: 8 },
    limits: { profiles: 2, followups: 6 },
    features: ['双人关系合盘', '冲突雷区与沟通建议', '关系时间线'],
    experiment: {
      tier: 'relationship',
      variant: 'pair-report-6-9',
      hypothesis: '关系场景有天然付费意愿，适合作为 Plus 前的中间价位。',
    },
  },
  {
    id: 'relationship_weekly',
    label: '7 日关系陪伴',
    paymentName: '7 日关系陪伴包',
    price: '12.9',
    amount: '12.90',
    badge: '更适合暧昧期',
    title: '别只看合不合，看接下来怎么相处',
    desc: '完整合盘加 7 天观察任务，每天给一个低压力行动，适合还没确定、正在磨合或想复盘的关系。',
    bullets: ['包含完整关系合盘', '7 天相处任务和进度记录', '一周后更容易看清这段关系的稳定度'],
    description: '完整合盘、每日观察任务与一周复盘',
    entitlement: { type: 'report', report: 'relationship_weekly', energyBonus: 10 },
    limits: { profiles: 2, days: 7, followups: 8 },
    features: ['完整关系合盘', '7 日相处任务', '一周后关系复盘'],
    experiment: {
      tier: 'relationship',
      variant: 'relationship-weekly-12-9',
      hypothesis: '把关系报告延长为 7 天陪伴，比一次性报告更接近订阅感。',
    },
  },
  {
    id: 'couple_plus_monthly',
    label: '双人 Plus',
    paymentName: '双人 Plus 月卡',
    price: '16.9',
    amount: '16.90',
    badge: '关系长期用',
    title: '把这段关系留成长期档案',
    desc: '适合反复问同一个人的用户。包含 Plus 长期记忆、完整关系合盘和 7 日关系陪伴。',
    bullets: ['Plus 月卡权益', '解锁完整关系合盘和 7 日陪伴', '更适合情侣、暧昧和复合观察'],
    description: '长期记忆、关系陪伴、完整合盘与 Plus 权益',
    entitlement: { type: 'membership', plan: 'plus', days: 31, energyFloor: 30 },
    limits: { tarotReadings: 260, relationshipReports: 6, dailyMissionEnergy: 8 },
    features: ['Plus 月卡权益', '完整关系合盘', '7 日关系陪伴', '更多关系复盘次数'],
    experiment: {
      tier: 'relationship',
      variant: 'couple-plus-16-9',
      hypothesis: '双人场景提高客单价，同时不破坏单人 Plus 的 9.9 心理锚点。',
    },
  },
  {
    id: 'bazi_full_archive',
    label: '八字命理档案',
    paymentName: '八字完整命理档案',
    price: '19.9',
    amount: '19.90',
    badge: '完整档案',
    title: '把底层命盘先定下来',
    desc: '适合想建立长期自我叙事的人。保存完整命理底稿后，后面的塔罗、日记和近期运势追问都会更有底色。',
    bullets: ['八字、用神、流年提示', '近期运势可结合当前时间推断', '给长期陪伴一个稳定底盘'],
    description: '八字排盘、用神、近期运势参考与长期档案',
    entitlement: { type: 'report', report: 'bazi', energyBonus: 12 },
    limits: { profiles: 1, followups: 10 },
    features: ['完整命理档案', '近期运势参考', '适合长期复盘和提问'],
    experiment: {
      tier: 'archive',
      variant: 'bazi-archive-19-9',
      hypothesis: '19.9 元不卖单次占卜，卖可长期参与塔罗和日记复盘的底层档案。',
    },
  },
];

export const PAYMENT_PLANS: PaymentPlan[] = SHOP_PLANS.map((plan) => ({
  id: plan.id,
  name: plan.paymentName,
  amount: plan.amount,
  description: plan.description,
  entitlement: plan.entitlement,
  limits: plan.limits,
  features: plan.features,
}));
