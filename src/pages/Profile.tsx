import PageHeader from '../components/ui/PageHeader';
import React, { useEffect, useState, useRef } from 'react';
import { useAppContext, LEVEL_THRESHOLDS, LEVEL_TITLES } from '../store';
import { User, Sparkles, Settings, ChevronRight, Moon, Vibrate, Edit2, X, Check, Upload, Compass, Crown, CalendarCheck, Gift, ShieldCheck, WalletCards, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  canStartPlusTrial,
  getMembershipLabel,
  getPlusDaysLeft,
  isPlusActive,
  isTesterActive,
} from '../lib/membership';
import { getUserSegment } from '../lib/engagement';
import { normalizeUserAddress } from '../lib/aiPrompting';
import { VISIBLE_SHOP_PLANS } from '../lib/pricing';
import { apiFetch } from '../lib/apiClient';
import { authHeaders, getStoredAccountSession } from '../lib/accountClient';
import {
  applyEntitlementSnapshot,
  applyPaidOrderEntitlement,
  fetchCurrentEntitlements,
  redeemEntitlementCode,
  startPlusTrialOnServer,
} from '../lib/entitlementClient';

const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mimi&backgroundColor=d1d4f9',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Leo&backgroundColor=ffd5dc',
];

const PAY_METHODS = [
  { id: 'alipay', label: '支付宝', desc: '支持支付宝余额、银行卡等常用方式' },
  { id: 'wechat', label: '微信支付', desc: '支持微信扫码或手机支付' },
] as const;

const SPIRITUAL_ANCHORS = [
  { title: '被记住', desc: '你的牌迹、日记和档案会持续沉淀，不用每次重新解释自己。' },
  { title: '被理解', desc: '星轨会从反复出现的问题里整理出你的情绪模式和选择惯性。' },
  { title: '被陪着走完', desc: '每周复盘和守护信件把一次占卜变成一段可回看的陪伴。' },
];

const PLUS_VALUE_PILLARS = [
  {
    title: '长期记忆',
    desc: '牌迹、日记、档案、沙盘会沉淀成一个持续可追问的个人上下文。',
  },
  {
    title: '7 日复盘',
    desc: '把反复主题、情绪底色和行动建议整理出来，不只是单次占卜。',
  },
  {
    title: '守护回访',
    desc: '每日来信会回应最近真实线索，而不是泛泛安慰。',
  },
];

type PayMethodId = (typeof PAY_METHODS)[number]['id'];
type PaymentStatus = 'idle' | 'creating' | 'opened' | 'checking' | 'waiting' | 'paid' | 'failed';
const PLAN_REDIRECTS: Record<string, string> = {
  relationship_report: 'bazi_full_archive',
  relationship_weekly: 'bazi_full_archive',
};

export default function Profile() {
  const { bondExp, bondLevel, energy, setEnergy, fragments, messages, diaryEntries, tarotReadings, simulationHistory, guardianMessages, settings, setSettings, userName, setUserName, preferredAddress, setPreferredAddress, setPreferredAddressPromptDismissed, userAvatar, setUserAvatar, profiles, setProfiles, activeProfileId, setActiveProfileId, checkInStreak, lastCheckInDate, membership, setMembership, engagement, appEvents } = useAppContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [isEditing, setIsEditing] = useState(false);
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('daily_fortune_deep');
  const [selectedPayMethod, setSelectedPayMethod] = useState<PayMethodId>('alipay');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState('');
  const [editName, setEditName] = useState(userName);
  const [editPreferredAddress, setEditPreferredAddress] = useState(preferredAddress);
  const [editAvatar, setEditAvatar] = useState(userAvatar);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const nextLevelExp = LEVEL_THRESHOLDS[bondLevel] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const progressPercent = Math.min(100, (bondExp / nextLevelExp) * 100);
  const userQuestionCount = messages.filter(msg => msg.role === 'user').length;
  const valueScore = Math.min(100, bondLevel * 10 + fragments.length * 5 + diaryEntries.length * 6 + tarotReadings.length * 3 + simulationHistory.length * 4 + checkInStreak * 4);
  const lastCheckInLabel = lastCheckInDate ? lastCheckInDate.replace(/-/g, '.') : '还没开始';
  const plusActive = isPlusActive(membership);
  const testerActive = isTesterActive(membership);
  const trialAvailable = canStartPlusTrial(membership);
  const membershipLabel = getMembershipLabel(membership);
  const plusDaysLeft = getPlusDaysLeft(membership);
  const paymentOrderId = searchParams.get('order') || '';
  const paymentReturnType = searchParams.get('payment') || '';
  const plusParam = searchParams.get('plus') || '';
  const planParam = searchParams.get('plan') || '';
  const shopPlans = VISIBLE_SHOP_PLANS;
  const userSegment = getUserSegment({
    plusActive,
    activeDays: engagement.activeDays,
    tarotReadings: tarotReadings.length,
    diaryEntries: diaryEntries.length,
    simulationHistory: simulationHistory.length,
    guardianMessages: guardianMessages.filter((message) => message.role === 'user').length,
  });
  const normalizedPlanParam = PLAN_REDIRECTS[planParam] || planParam;
  const hasPlanParam = shopPlans.some((plan) => plan.id === normalizedPlanParam);
  const recommendedPlanId = hasPlanParam
    ? normalizedPlanParam
    : tarotReadings.length >= 3 || diaryEntries.length >= 2 || simulationHistory.length >= 1
      ? 'plus_monthly'
      : 'daily_fortune_deep';
  const memorySeedCount = tarotReadings.length + diaryEntries.length + simulationHistory.length + profiles.length;
  const purchaseContextLine =
    memorySeedCount > 0
      ? `你已经留下 ${memorySeedCount} 份线索。开通后，这些记录会变成可继续追问的上下文。`
      : '先从一份报告或档案开始，后面每次追问都不用重新铺垫背景。';
  const selectedPlan = shopPlans.find((plan) => plan.id === selectedPlanId) || shopPlans[0];
  const selectedPayMethodMeta = PAY_METHODS.find((method) => method.id === selectedPayMethod) || PAY_METHODS[0];

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveProfile = () => {
    if (editName.trim()) {
      setUserName(editName.trim());
    }
    setPreferredAddress(normalizeUserAddress(editPreferredAddress));
    setPreferredAddressPromptDismissed(true);
    setUserAvatar(editAvatar);
    setIsEditing(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const applyServerEntitlements = (snapshot: Parameters<typeof applyEntitlementSnapshot>[0]) => {
    applyEntitlementSnapshot(snapshot, { setMembership, setEnergy });
  };

  const handleRedeemTesterCode = async () => {
    const normalizedCode = redeemCode.trim().toUpperCase();
    if (!normalizedCode) {
      setPaymentStatus('idle');
      setPaymentMessage('请输入兑换码。');
      return;
    }

    setPaymentStatus('checking');
    try {
      const snapshot = await redeemEntitlementCode(normalizedCode);
      applyServerEntitlements(snapshot);
      setRedeemCode('');
      setPaymentStatus('paid');
      setPaymentMessage(snapshot.message || '兑换成功：权益已由后端入账。');
    } catch (error: any) {
      setPaymentStatus('failed');
      setPaymentMessage(error.message || '兑换失败，请稍后再试。');
    }
  };

  const checkPaymentOrder = async (orderId: string) => {
    if (!orderId) return;

    setPendingOrderId(orderId);
    setPaymentStatus('checking');
    setPaymentMessage('正在向后端确认订单权益...');
    try {
      const result = await applyPaidOrderEntitlement(orderId);
      if (result.status === 'paid' && result.entitlement) {
        applyServerEntitlements(result.entitlement);
        setPaymentStatus('paid');
        setPaymentMessage(result.message || result.entitlement.message || '权益已经由后端确认入账。');
        return;
      }

      setPaymentStatus('waiting');
      setPaymentMessage('还没收到支付成功通知。完成付款后点“刷新到账状态”。');
    } catch (error: any) {
      setPaymentStatus('failed');
      setPaymentMessage(error.message || '订单权益校验失败。');
    }
  };

  const handleStartTrial = async () => {
    if (!trialAvailable) return;
    setPaymentStatus('checking');
    try {
      const snapshot = await startPlusTrialOnServer();
      applyServerEntitlements(snapshot);
      setPaymentStatus('paid');
      setPaymentMessage(snapshot.message || '已开通 24 小时 Plus 试用。');
    } catch (error: any) {
      setPaymentStatus('failed');
      setPaymentMessage(error.message || '试用开通失败，请稍后再试。');
    }
  };

  useEffect(() => {
    if (!getStoredAccountSession()) return;
    fetchCurrentEntitlements()
      .then(applyServerEntitlements)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!paymentReturnType || !paymentOrderId) return;
    checkPaymentOrder(paymentOrderId);
  }, [paymentReturnType, paymentOrderId]);

  useEffect(() => {
    if (hasPlanParam) setSelectedPlanId(normalizedPlanParam);
    if (plusParam === '1') setShowMembershipModal(true);
  }, [hasPlanParam, normalizedPlanParam, plusParam]);

  const handleCreatePaymentOrder = async () => {
    setPaymentMessage(null);
    setPaymentStatus('idle');
    const accountSession = getStoredAccountSession();
    if (!accountSession) {
      setPaymentStatus('failed');
      setPaymentMessage('请先登录星轨账户，再开通会员或购买权益。');
      navigate('/auth?next=/app/profile?plus=1');
      return;
    }
    if (!guardianConsent) {
      setPaymentMessage('请先确认价格规则；未成年人需要监护人同意。');
      return;
    }

    setIsCreatingPayment(true);
    setPaymentStatus('creating');
    const paymentWindow = window.open('', '_blank');
    if (!paymentWindow) {
      setPaymentStatus('failed');
      setPaymentMessage('浏览器拦截了支付窗口，请允许弹窗后再试一次。');
      setIsCreatingPayment(false);
      return;
    }
    paymentWindow.document.write('<!doctype html><title>正在打开支付</title><body style="font-family:system-ui;padding:24px;">正在打开支付收银台...</body>');

    try {
      let orderData: any = null;
      let lastGatewayError = '';
      for (const gateway of ['xorpay', 'xunhupay']) {
        try {
          const response = await apiFetch(`/api/payments/${gateway}/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(accountSession.token),
            },
            body: JSON.stringify({
              planId: selectedPlanId,
              channel: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'wap' : 'page',
              payType: selectedPayMethod,
            }),
          });
          const data = await response.json();
          if (response.ok && (data.payUrl || data.formHtml)) {
            orderData = data;
            break;
          }
          lastGatewayError = data?.error?.message || 'payment gateway failed';
        } catch (gatewayError: any) {
          lastGatewayError = gatewayError?.message || 'payment gateway failed';
        }
      }

      if (!orderData) {
        console.warn('Payment gateway unavailable:', lastGatewayError);
        paymentWindow.close();
        throw new Error('支付暂未开通或收银台暂时不可用，请稍后再试。');
      }

      if (orderData.formHtml) {
        paymentWindow.document.open();
        paymentWindow.document.write(orderData.formHtml);
        paymentWindow.document.close();
      } else {
        paymentWindow.location.href = orderData.payUrl;
      }
      setPendingOrderId(orderData.orderId);
      setPaymentStatus('opened');
      setPaymentMessage(`已打开${selectedPayMethodMeta.label}收银台，订单号：${orderData.orderId}`);
    } catch (error: any) {
      setPaymentStatus('failed');
      setPaymentMessage(error.message || '支付创建失败，请稍后再试。');
    } finally {
      setIsCreatingPayment(false);
    }
  };

  return (
    <div className="rail-page">
      <div className="rail-page-content">
      <PageHeader eyebrow="你的星轨" title="我的" description="在这里查看你的成长、记录与陪伴权益。" action={<button type="button" onClick={() => navigate('/app/settings')} className="rail-button-secondary"><Settings size={17} />设置</button>} />

      <section className="rail-panel mb-6 flex flex-wrap items-center gap-5">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-apple-border bg-apple-surface-hover">
          {userAvatar ? <img src={userAvatar} alt="我的头像" className="size-full object-cover" onError={handleAvatarError} /> : <User size={28} className="text-apple-gold" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold text-apple-text break-words">{userName}</h2>
          <p className="rail-muted mt-1">{preferredAddress ? `她会叫你：${preferredAddress}` : '可以设置一个专属称呼'}</p>
          <p className="rail-muted mt-1 break-all">{getStoredAccountSession()?.user.email || '本机账户 · 登录后可同步云端存档'}</p>
        </div>
        <button type="button" onClick={() => { setEditName(userName); setEditPreferredAddress(preferredAddress); setEditAvatar(userAvatar); setIsEditing(true); }} className="rail-button-secondary w-full sm:w-auto"><Edit2 size={16} />编辑资料</button>
      </section>

      {/* Edit Profile Modal */}
      <ProfileDialog open={isEditing} title="编辑个人资料" onClose={() => setIsEditing(false)}>
          <div className="relative p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-sans font-semibold text-lg text-apple-text">编辑个人资料</h3>
                <button aria-label="关闭编辑资料" onClick={() => setIsEditing(false)} className="flex size-10 items-center justify-center rounded-xl hover:bg-apple-surface-hover text-apple-text-muted">
                  <X size={20} />
                </button>
              </div>

              <div className="mb-6">
                <label htmlFor="profile-name" className="block text-[13px] font-medium text-apple-text-muted mb-2">昵称</label>
                <input 
                  type="text" 
                  id="profile-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-apple-surface border border-apple-border rounded-xl px-4 py-3 text-[15px] text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-accent/35 transition-colors duration-150"
                  placeholder="输入你的昵称"
                  maxLength={12}
                />
              </div>

              <div className="mb-6">
                <label htmlFor="profile-address" className="block text-[13px] font-medium text-apple-text-muted mb-2">想被怎么称呼</label>
                <input
                  type="text"
                  id="profile-address"
                  value={editPreferredAddress}
                  onChange={(e) => setEditPreferredAddress(e.target.value)}
                  className="w-full bg-apple-surface border border-apple-border rounded-xl px-4 py-3 text-[15px] text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-accent/35 transition-colors duration-150"
                  placeholder="比如：宝子、小鱼、姐姐"
                  maxLength={16}
                />
                <p className="mt-2 text-[13px] leading-[1.8] text-apple-text-muted">
                  留空则按昵称称呼。首次弹窗选择后，也可以回到这里重新调整。
                </p>
              </div>

              <div className="mb-8">
                <label className="block text-[13px] font-medium text-apple-text-muted mb-3">选择头像</label>
                <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar items-center">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="上传自定义头像"
                    className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 border-2 border-dashed border-apple-border bg-apple-surface hover:bg-apple-surface-hover transition-colors duration-150"
                  >
                    <Upload size={20} className="text-apple-text-muted" />
                  </button>
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleImageUpload} 
                  />
                  <button 
                    onClick={() => setEditAvatar(null)}
                    aria-label="使用默认头像"
                    className={clsx(
                      "w-14 h-14 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors duration-150",
                      editAvatar === null ? "border-apple-accent  scale-110 " : "border-transparent bg-apple-surface"
                    )}
                  >
                    <User size={24} className="text-apple-text-muted" />
                  </button>
                  {AVATARS.map((avatar, idx) => (
                    <button 
                      key={idx}
                      onClick={() => setEditAvatar(avatar)}
                      aria-label={`选择头像 ${idx + 1}`}
                      className={clsx(
                        "w-14 h-14 rounded-full overflow-hidden shrink-0 border-2 transition-colors duration-150",
                        editAvatar === avatar ? "border-apple-accent  scale-110 " : "border-transparent bg-apple-surface"
                      )}
                    >
                      <img src={avatar} alt="" width="56" height="56" className="w-full h-full object-cover" onError={handleAvatarError} />
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleSaveProfile}
                className="rail-button w-full"
              >
                <Check size={18} />
                保存修改
              </button>
          </div>
      </ProfileDialog>

      <ProfileDialog open={showMembershipModal} title="会员权益详情" onClose={() => setShowMembershipModal(false)}>
          <div className="relative p-6">
              <button aria-label="关闭会员详情" onClick={() => setShowMembershipModal(false)} className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-xl text-apple-text-muted hover:bg-apple-surface-hover hover:text-apple-text dark:hover:bg-white/[0.06]">
                <X size={18} />
              </button>
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-apple-gold/15 text-apple-gold">
                <Crown size={24} />
              </div>
              <h3 className="text-2xl font-semibold text-apple-text">{testerActive ? '完整功能已解锁' : plusActive ? '权益已生效' : '让星轨继续记得你'}</h3>
              <p className="mt-2 text-[15px] leading-[1.8] text-apple-text-muted">
                当前状态：{membershipLabel}。支付成功后权益会立即到账，可以回到刚刚的页面继续使用。
              </p>
              <div className="mt-5 border-t border-apple-border pt-4">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-apple-gold">
                  <Sparkles size={14} />
                  不用从头再讲一遍
                </div>
                <p className="mt-2 text-[15px] leading-[1.8] text-apple-text">{purchaseContextLine}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[13px] text-apple-text-muted">
                  <div className="rounded-2xl border border-apple-border/70 bg-apple-surface px-2 py-2 dark:border-apple-border">
                    <div className="font-semibold text-apple-text">{tarotReadings.length}</div>
                    <div>牌迹</div>
                  </div>
                  <div className="rounded-2xl border border-apple-border/70 bg-apple-surface px-2 py-2 dark:border-apple-border">
                    <div className="font-semibold text-apple-text">{diaryEntries.length}</div>
                    <div>日记</div>
                  </div>
                  <div className="rounded-2xl border border-apple-border/70 bg-apple-surface px-2 py-2 dark:border-apple-border">
                    <div className="font-semibold text-apple-text">{profiles.length}</div>
                    <div>档案</div>
                  </div>
                </div>
              </div>
              <div className="mt-5">
                {PLUS_VALUE_PILLARS.map((item) => (
                  <div key={item.title} className="border-b border-apple-border py-3 last:border-b-0">
                    <div className="text-[15px] font-semibold text-apple-text">{item.title}</div>
                    <div className="mt-1 text-[13px] leading-[1.8] text-apple-text-muted">{item.desc}</div>
                  </div>
                ))}
              </div>
              {trialAvailable && (
                <button
                  onClick={handleStartTrial}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-apple-gold/28 bg-apple-gold/12 py-3 text-[15px] font-semibold text-apple-gold"
                >
                  <Sparkles size={16} />
                  先试用 24 小时 Plus
                </button>
              )}
              <div className="mt-5 border-t border-apple-border pt-4">
                <div className="mb-2 text-[13px] font-semibold text-apple-text-muted">兑换码</div>
                <div className="flex gap-2">
                  <input
                    aria-label="兑换码"
                    value={redeemCode}
                    onChange={(event) => setRedeemCode(event.target.value)}
                    placeholder="输入兑换码"
                    className="rail-field min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleRedeemTesterCode}
                    className="shrink-0 rounded-2xl border border-apple-gold/24 bg-apple-gold/12 px-4 py-2 text-[15px] font-semibold text-apple-gold transition-colors hover:bg-apple-gold/18 dark:border-apple-border bg-apple-surface dark:text-apple-text dark:hover:bg-white/[0.12]"
                  >
                    兑换
                  </button>
                </div>
              </div>
              <div className="mt-5 border-t border-apple-border pt-4">
                <div className="text-[13px] font-semibold uppercase text-apple-gold">开通后马上发生</div>
                <div className="mt-2 text-[15px] leading-[1.8] text-apple-text">
                  选择今日深解，会把今天这张牌讲得更细；选择 Plus，每天都可以看完整日运、长期牌迹和周报。
                </div>
                <div className="mt-3 grid gap-2">
                  {SPIRITUAL_ANCHORS.map((item) => (
                    <div key={item.title} className="py-1">
                      <div className="text-[15px] font-semibold text-apple-text">{item.title}</div>
                      <div className="mt-1 text-[13px] leading-[1.8] text-apple-text-muted">{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {shopPlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={clsx(
                      'w-full rounded-[24px] border p-4 text-left transition-colors duration-150',
                      selectedPlanId === plan.id
                        ? 'border-apple-gold/55 bg-apple-gold/12 text-apple-text  '
                        : 'border-apple-border bg-apple-surface text-apple-text-muted hover:border-apple-gold/26 dark:border-apple-border bg-apple-surface dark:hover:border-white/18',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-apple-text">{plan.label}</span>
                          {plan.id === recommendedPlanId && (
                            <span className="rounded-full bg-apple-gold px-2 py-0.5 text-[13px] font-semibold text-[#11131a]">
                              更适合现在
                            </span>
                          )}
                          <span className="rounded-full border border-apple-gold/24 bg-apple-gold/10 px-2 py-0.5 text-[13px] font-semibold text-apple-gold">
                            {plan.badge}
                          </span>
                        </div>
                        <div className="mt-1 text-[15px] font-semibold text-apple-text">{plan.title}</div>
                        <p className="mt-1 text-[13px] leading-[1.8] text-apple-text-muted">{plan.desc}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[13px] text-apple-text-muted">¥</div>
                        <div className="text-3xl font-semibold text-apple-gold">{plan.price}</div>
                      </div>
                    </div>
                    {selectedPlanId === plan.id && (
                      <div className="mt-3 grid gap-1.5 text-[13px] leading-[1.8] text-apple-text-muted">
                        {plan.bullets.map((item) => (
                          <div key={item} className="flex items-center gap-2">
                            <Check size={13} className="text-apple-gold" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-5">
                <div className="mb-2 text-[13px] font-semibold text-apple-text-muted">支付方式</div>
                <div className="grid grid-cols-2 gap-2">
                  {PAY_METHODS.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedPayMethod(method.id)}
                      className={clsx(
                        'rounded-2xl border p-3 text-left transition-colors duration-150',
                        selectedPayMethod === method.id
                          ? 'border-apple-gold/50 bg-apple-gold/12 text-apple-text'
                          : 'border-apple-border bg-apple-surface text-apple-text-muted dark:border-apple-border bg-apple-surface',
                      )}
                    >
                      <div className="text-[15px] font-semibold">{method.label}</div>
                      <div className="mt-1 text-[13px] leading-[1.8] text-apple-text-muted">{method.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-apple-border bg-apple-surface p-3 text-[13px] leading-[1.8] text-apple-text-muted dark:border-apple-border">
                <input
                  type="checkbox"
                  checked={guardianConsent}
                  onChange={(e) => setGuardianConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>我已确认价格和权益；如果我是未成年人，已获得监护人同意。</span>
              </label>
              {paymentStatus !== 'idle' || pendingOrderId ? (
                <PaymentStatusPanel
                  status={paymentStatus}
                  message={paymentMessage}
                  orderId={pendingOrderId}
                  planLabel={selectedPlan.label}
                  methodLabel={selectedPayMethodMeta.label}
                  onRefresh={() => pendingOrderId && checkPaymentOrder(pendingOrderId)}
                />
              ) : paymentMessage && (
                <div className="mt-3 rounded-2xl border border-apple-gold/20 bg-apple-gold/10 p-3 text-[13px] leading-[1.8] text-apple-gold">
                  {paymentMessage}
                </div>
              )}
              <button
                onClick={handleCreatePaymentOrder}
                disabled={isCreatingPayment || !guardianConsent}
                className="rail-button mt-5 w-full"
              >
                {isCreatingPayment ? <Loader2 size={18} className="animate-spin" /> : <WalletCards size={18} />}
                解锁 {selectedPlan.label} · ¥{selectedPlan.price}
              </button>
              <button
                onClick={() => setShowMembershipModal(false)}
                className="rail-button-secondary mt-3 w-full"
              >
                暂时不用
              </button>
              <p className="mt-3 text-center text-[13px] leading-[1.8] text-apple-text-muted">
                正式支付前会清楚展示价格与规则。未成年人付费必须先征得监护人同意。
              </p>
          </div>
      </ProfileDialog>

      <section className="grid grid-cols-2 gap-4 mb-8" aria-label="能量与收藏">
        <div className="rail-panel">
          <p className="rail-muted flex items-center gap-2"><Sparkles size={16} className="text-apple-gold" />剩余能量</p>
          <p className="mt-3 text-3xl font-medium tabular-nums">{testerActive ? '∞' : energy}</p>
        </div>
        <button type="button" onClick={() => navigate('/app/collection')} className="rail-panel text-left hover:bg-apple-surface-hover">
          <p className="rail-muted flex items-center gap-2"><LibraryIcon width={16} height={16} className="text-apple-gold" />收集进度</p>
          <p className="mt-3 text-3xl font-medium tabular-nums">{fragments.length}<span className="ml-2 text-base text-apple-text-muted">/ 8</span></p>
        </button>
      </section>

      <section className="rail-panel mb-8" aria-labelledby="membership-heading">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 max-w-[56ch]">
            <p className="rail-muted mb-2 flex items-center gap-2"><Crown size={17} className="text-apple-gold" />陪伴权益</p>
            <h2 id="membership-heading" className="rail-section-title">{testerActive ? '完整功能已解锁' : plusActive ? `Plus 会员 · 还剩约 ${plusDaysLeft} 天` : '星轨 Plus'}</h2>
            <p className="mt-2 text-[15px] leading-[1.8] text-apple-text-muted">{membershipLabel}。你留下的牌迹、日记和档案越多，星轨越能接住你的上下文；开通后不用每次重新解释自己。</p>
          </div>
          <button type="button" onClick={() => setShowMembershipModal(true)} className="rail-button-secondary shrink-0">{testerActive ? '查看权益' : plusActive ? '管理权益' : '查看付费方案'}<ChevronRight size={16} /></button>
        </div>
        <p className="rail-muted mt-5 border-t border-apple-border pt-4">未成年人开通任何付费项前，应获得监护人同意。</p>
      </section>

      <section className="mb-8" aria-labelledby="growth-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="growth-heading" className="rail-section-title">陪伴与成长</h2>
          <span className="rail-muted">{userSegment}</span>
        </div>
        <div className="rail-panel">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="rail-muted mb-1">羁绊等级 · LV.{bondLevel}</p>
              <p className="font-serif text-2xl text-apple-text">{LEVEL_TITLES[bondLevel - 1]}</p>
            </div>
            <span className="rail-muted tabular-nums">{bondExp} / {nextLevelExp} EXP</span>
          </div>
          <div className="mt-5 mb-6 h-2 overflow-hidden rounded-full bg-apple-surface-hover" role="progressbar" aria-label="羁绊成长进度" aria-valuenow={Math.round(progressPercent)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-apple-gold" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <GrowthMetric icon={<CalendarCheck size={16} />} label="连续陪伴" value={`${checkInStreak} 天`} />
            <GrowthMetric icon={<Sparkles size={16} />} label="提问记录" value={`${userQuestionCount} 次`} />
            <GrowthMetric icon={<Gift size={16} />} label="牌迹沉淀" value={`${tarotReadings.length} 次`} />
            <GrowthMetric icon={<ShieldCheck size={16} />} label="沙盘推演" value={`${simulationHistory.length} 次`} />
          </div>
          <div className="mt-6 border-t border-apple-border pt-4">
            <div className="rail-muted mb-2 flex items-center justify-between gap-3"><span>成长解锁度</span><span className="tabular-nums">{valueScore} / 100</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-apple-surface-hover" role="progressbar" aria-label="成长解锁度" aria-valuenow={valueScore} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-apple-gold rounded-full" style={{ width: `${valueScore}%` }} /></div>
            <p className="rail-muted mt-3">已陪伴 {engagement.activeDays} 天 · 已沉淀 {memorySeedCount} 份线索 · 上次签到 {lastCheckInLabel}</p>
          </div>
        </div>
      </section>

      <section className="mb-8" aria-labelledby="archive-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="archive-heading" className="rail-section-title">命理档案</h2>
          <button type="button" onClick={() => navigate('/app/bazi')} className="rail-button-secondary">+ 新建档案</button>
        </div>
        {profiles.length === 0 ? (
          <div className="rail-empty"><Compass size={28} className="mx-auto mb-3 text-apple-gold" /><p>还没有添加任何命理档案</p><button type="button" onClick={() => navigate('/app/bazi')} className="rail-button-secondary mt-5">添加第一份档案</button></div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <div key={profile.id} className={clsx('rail-surface p-5 relative', activeProfileId === profile.id && '!border-apple-gold')}>
                <button type="button" onClick={() => setActiveProfileId(profile.id)} aria-pressed={activeProfileId === profile.id} className="w-full text-left">
                  <span className="mb-4 flex items-center justify-between gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-apple-surface-hover text-xl">{profile.gender === 'male' ? '👨' : '👩'}</span>{activeProfileId === profile.id && <span className="rail-muted !text-apple-gold">当前档案</span>}</span>
                  <span className="block text-base font-medium truncate">{profile.name}</span>
                  <span className="rail-muted mt-1 block tabular-nums">{profile.birthDate}</span>
                </button>
                <button type="button" aria-label={`删除 ${profile.name} 的档案`} onClick={() => { if (window.confirm(`确定要删除 ${profile.name} 的档案吗？`)) { setProfiles(prev => prev.filter(p => p.id !== profile.id)); if (activeProfileId === profile.id) setActiveProfileId(null); } }} className="absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-lg text-apple-text-muted hover:bg-red-500/10 hover:text-red-600"><X size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="preferences-heading">
        <h2 id="preferences-heading" className="rail-section-title mb-4">使用偏好</h2>
        <div className="rail-surface overflow-hidden">
          <SettingToggle icon={<Moon size={18} />} title="背景音乐" checked={settings.bgmEnabled} onChange={() => toggleSetting('bgmEnabled')} />
          <SettingToggle icon={<Vibrate size={18} />} title="触觉反馈" checked={settings.hapticsEnabled} onChange={() => toggleSetting('hapticsEnabled')} />
          <SettingItem title="关于星轨" hasBorder={false} onClick={() => navigate('/app/about')} />
        </div>
      </section>
      </div>
    </div>
  );
}

function GrowthMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="py-1">
      <div className="mb-2 flex items-center gap-2 text-apple-gold">
        {icon}
        <span className="text-[13px] text-apple-text-muted">{label}</span>
      </div>
      <div className="text-xl font-medium tabular-nums text-apple-text">{value}</div>
    </div>
  );
}

function PaymentStatusPanel({
  status,
  message,
  orderId,
  planLabel,
  methodLabel,
  onRefresh,
}: {
  status: PaymentStatus;
  message: string | null;
  orderId: string | null;
  planLabel: string;
  methodLabel: string;
  onRefresh: () => void;
}) {
  const steps = [
    { id: 'creating', label: '创建订单' },
    { id: 'opened', label: `打开${methodLabel}` },
    { id: 'paid', label: '权益到账' },
  ];
  const statusIndex =
    status === 'paid'
      ? 2
      : status === 'opened' || status === 'checking' || status === 'waiting'
        ? 1
        : status === 'creating'
          ? 0
          : -1;
  const title =
    status === 'paid'
      ? '权益已到账'
      : status === 'failed'
        ? '支付暂未完成'
        : status === 'waiting'
          ? '等待支付确认'
          : status === 'checking'
            ? '正在确认支付'
            : status === 'opened'
              ? '收银台已打开'
              : '正在创建订单';

  return (
    <div className="mt-3 rounded-[24px] border border-apple-gold/22 bg-apple-gold/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold text-apple-text">{title}</div>
          <div className="mt-1 text-[13px] leading-[1.8] text-apple-text-muted">
            {message || `正在处理 ${planLabel}。`}
          </div>
        </div>
        {status === 'checking' || status === 'creating' ? (
          <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-apple-gold" />
        ) : status === 'paid' ? (
          <Check size={18} className="mt-0.5 shrink-0 text-apple-gold" />
        ) : (
          <WalletCards size={18} className="mt-0.5 shrink-0 text-apple-gold" />
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={clsx(
              'rounded-2xl border px-2 py-2 text-center text-[13px] font-semibold',
              index <= statusIndex
                ? 'border-apple-gold/30 bg-apple-gold/14 text-apple-gold'
                : 'border-apple-border bg-apple-surface text-apple-text-muted dark:border-apple-border bg-apple-surface',
            )}
          >
            {step.label}
          </div>
        ))}
      </div>
      {orderId && status !== 'paid' && (
        <button
          type="button"
          onClick={onRefresh}
          className="mt-3 w-full rounded-full border border-apple-gold/24 bg-apple-surface py-2.5 text-[13px] font-semibold text-apple-text"
        >
          刷新到账状态
        </button>
      )}
    </div>
  );
}

function LibraryIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 6 4 14" />
      <path d="M12 6v14" />
      <path d="M8 8v12" />
      <path d="M4 4v16" />
    </svg>
  );
}

function SettingToggle({ icon, title, checked, onChange }: { icon: React.ReactNode; title: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 p-5 border-b border-apple-border hover:bg-apple-surface-hover">
      <span className="flex items-center gap-3"><span className="text-apple-gold">{icon}</span><span className="text-[15px] font-medium">{title}</span></span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" checked={checked} onChange={onChange} className="peer sr-only" />
        <span className={clsx('h-7 w-12 rounded-full border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-apple-gold', checked ? 'bg-apple-gold border-apple-gold' : 'bg-apple-surface-hover border-apple-border')}><span className={clsx('absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform duration-150', checked && 'translate-x-5')} /></span>
      </span>
    </label>
  );
}

function SettingItem({ title, hasBorder = true, onClick }: { title: string; hasBorder?: boolean; onClick?: () => void }) {
  return <button type="button" onClick={onClick} className={clsx('flex w-full items-center justify-between gap-3 p-5 text-left text-[15px] font-medium hover:bg-apple-surface-hover', hasBorder && 'border-b border-apple-border')}><span>{title}</span><ChevronRight size={18} className="text-apple-text-muted" /></button>;
}

function ProfileDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return createPortal(<dialog ref={dialogRef} aria-label={title} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="m-auto w-[calc(100%_-_32px)] max-w-lg max-h-[calc(100dvh_-_32px)] overflow-y-auto overscroll-contain rounded-2xl border border-apple-border bg-apple-surface p-0 text-apple-text backdrop:bg-black/55">{open && children}</dialog>, document.body);
}

function handleAvatarError(event: React.SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (!image.src.endsWith('/avatar.png')) image.src = '/avatar.png';
}
