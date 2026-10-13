import type { ProductPlan } from './pricing';

export function getProfilePurchaseReturnPath(planId: ProductPlan['id'], trial = false) {
  const params = new URLSearchParams({ plus: '1', plan: planId });
  if (trial) params.set('trial', '1');
  return `/app/profile?${params.toString()}`;
}

export function getProfilePurchaseAuthPath(planId: ProductPlan['id'], trial = false) {
  return `/auth?${new URLSearchParams({ next: getProfilePurchaseReturnPath(planId, trial) }).toString()}`;
}

export function getPlanPeriodLabel(plan: Pick<ProductPlan, 'entitlement'>) {
  const days = Number(plan.entitlement.days);
  return plan.entitlement.type === 'membership' && Number.isFinite(days) && days > 0
    ? `${Math.floor(days)} 天权益`
    : '一次性购买';
}

export function getPlanTerms(plan: Pick<ProductPlan, 'entitlement' | 'id'>) {
  const period = getPlanPeriodLabel(plan);
  if (plan.entitlement.type !== 'membership') return '一次性购买，不自动续费。解锁内容以当前方案说明为准。';
  return plan.id === 'couple_plus_monthly'
    ? `${period}，包含 Plus、关系合盘与关系陪伴功能；7 日指陪伴任务长度。不自动续费，到期后保留已有记录。`
    : `${period}，不自动续费；到期后会员功能暂停，已有记录保留。续购会延长有效期。`;
}
