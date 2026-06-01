import React, { useEffect, useState, useRef } from 'react';
import { useAppContext, LEVEL_THRESHOLDS, LEVEL_TITLES } from '../store';
import { User, Sparkles, Heart, Settings, ChevronRight, Moon, Vibrate, Edit2, X, Check, Upload, Compass, Crown, CalendarCheck, Gift, ShieldCheck, WalletCards, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  activateTesterAccess,
  activatePlusDays,
  addDailyFortuneDeepCredits,
  addFeatureUnlock,
  canStartPlusTrial,
  getMembershipLabel,
  getPlusDaysLeft,
  isPlusActive,
  isTesterActive,
  startPlusTrial,
} from '../lib/membership';
import { getUserSegment } from '../lib/engagement';
import { normalizeUserAddress } from '../lib/aiPrompting';
import { VISIBLE_SHOP_PLANS } from '../lib/pricing';
import { apiFetch } from '../lib/apiClient';

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
const TESTER_REDEEM_CODE = 'ASTRORAIL-TEST-2026';
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

  const hasGrantedOrder = (orderId: string) => {
    try {
      const granted = JSON.parse(localStorage.getItem('grantedPaymentOrders') || '[]') as string[];
      return granted.includes(orderId);
    } catch {
      return false;
    }
  };

  const markOrderGranted = (orderId: string) => {
    try {
      const granted = JSON.parse(localStorage.getItem('grantedPaymentOrders') || '[]') as string[];
      if (!granted.includes(orderId)) {
        localStorage.setItem('grantedPaymentOrders', JSON.stringify([...granted, orderId]));
      }
    } catch {
      localStorage.setItem('grantedPaymentOrders', JSON.stringify([orderId]));
    }
  };

  const grantPaidPlan = (planId: string, orderId: string) => {
    if (hasGrantedOrder(orderId)) {
      setPaymentStatus('paid');
      setPaymentMessage('这笔订单已经到账过了，不会重复加权益。');
      return;
    }

    if (planId === 'daily_fortune_deep') {
      setMembership((current) => addDailyFortuneDeepCredits(current, 1));
      setEnergy((value) => value + 2);
      setPaymentMessage('今日深解已到账：已赠送 2 点能量，可以回到塔罗页展开今天这张牌。');
    } else if (planId === 'tarot_deep_report') {
      setMembership((current) => addFeatureUnlock(current, 'tarot_deep_report'));
      setEnergy((value) => value + 6);
      setPaymentMessage('深度牌阵报告已解锁：已赠送 6 点能量，可以回到塔罗页开始一次深度解读。');
    } else if (planId === 'relationship_report') {
      setMembership((current) => addFeatureUnlock(current, 'relationship_report'));
      setEnergy((value) => value + 8);
      setPaymentMessage('双人关系合盘已解锁：已赠送 8 点能量，可以回到八字页查看完整关系报告。');
    } else if (planId === 'relationship_weekly') {
      setMembership((current) => addFeatureUnlock(addFeatureUnlock(current, 'relationship_report'), 'relationship_weekly'));
      setEnergy((value) => value + 10);
      setPaymentMessage('7 日关系陪伴已解锁：完整合盘和一周相处任务都已开启。');
    } else if (planId === 'couple_plus_monthly') {
      setMembership((current) => addFeatureUnlock(addFeatureUnlock(activatePlusDays(current), 'relationship_report'), 'relationship_weekly'));
      setEnergy((value) => Math.max(value, 30));
      setPaymentMessage('双人 Plus 已到账：Plus、完整合盘和 7 日关系陪伴都已开启。');
    } else if (planId === 'bazi_full_archive') {
      setMembership((current) => addFeatureUnlock(addFeatureUnlock(addFeatureUnlock(current, 'bazi'), 'relationship_report'), 'relationship_weekly'));
      setEnergy((value) => value + 16);
      setPaymentMessage('完整档案包已解锁：八字档案、双人关系合盘和 7 日关系陪伴都已开启，并赠送 16 点能量。');
    } else if (planId === 'energy_pack_30') {
      setEnergy((value) => value + 30);
      setPaymentMessage('能量包已到账：+30 点星光能量。');
    } else {
      setMembership((current) => activatePlusDays(current));
      setEnergy((value) => Math.max(value, 20));
      setPaymentMessage('Plus 已到账：月卡已生效，能量补到至少 20 点。');
    }
    markOrderGranted(orderId);
    setPaymentStatus('paid');
  };

  const handleRedeemTesterCode = () => {
    const normalizedCode = redeemCode.trim().toUpperCase();
    if (!normalizedCode) {
      setPaymentMessage('请输入兑换码。');
      return;
    }
    if (normalizedCode !== TESTER_REDEEM_CODE) {
      setPaymentMessage('兑换码无效，请检查后再试。');
      return;
    }

    setMembership(activateTesterAccess());
    setEnergy(999999);
    setRedeemCode('');
    setPaymentMessage('兑换成功：无限能量和全部完整功能已解锁。');
  };

  const checkPaymentOrder = async (orderId: string) => {
    if (!orderId) return;

    setPendingOrderId(orderId);
    setPaymentStatus('checking');
    setPaymentMessage('正在确认订单状态...');
    try {
      const response = await apiFetch(`/api/payments/orders/${encodeURIComponent(orderId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || '订单状态查询失败');

      if (data.order?.status === 'paid') {
        grantPaidPlan(data.order.planId, orderId);
        return;
      }

      setPaymentStatus('waiting');
      setPaymentMessage('还没收到支付成功通知。完成付款后点“刷新到账状态”。');
    } catch (error: any) {
      setPaymentStatus('failed');
      setPaymentMessage(error.message || '订单状态查询失败');
    }
  };

  const handleStartTrial = () => {
    if (!trialAvailable) return;
    setMembership((current) => startPlusTrial(current));
    setEnergy((value) => Math.max(value, 12));
    setPaymentMessage('已开启 24 小时 Plus 试用，能量补到至少 12 点。');
  };

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
            headers: { 'Content-Type': 'application/json' },
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
    <div className="relative h-full w-full overflow-y-auto overscroll-contain px-6 pt-4 pb-40 text-apple-text no-scrollbar">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-sans text-3xl font-bold tracking-widest text-apple-accent">我的</h1>
        <button 
          onClick={() => navigate('/app/settings')}
          className="p-2 rounded-full glass-panel hover:bg-apple-surface-hover transition-colors border-apple-border"
        >
          <Settings size={20} className="text-apple-accent" />
        </button>
      </div>

      {/* User Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-apple-surface backdrop-blur-xl rounded-3xl p-6 mb-8 flex items-center gap-6 relative overflow-hidden border border-apple-border shadow-[0_14px_40px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
      >
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay pointer-events-none"></div>
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-apple-accent/14 to-transparent rounded-bl-full pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-apple-gold/12 blur-3xl rounded-full pointer-events-none"></div>
        
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-apple-gold to-[#dcb66f] p-[2px] shadow-[0_14px_28px_rgba(185,123,40,0.18)] shrink-0 relative z-10 dark:from-[#6B8AFF] dark:to-[#4F46E5] dark:shadow-[0_0_20px_rgba(107,138,255,0.4)]">
          <div className="w-full h-full rounded-full bg-apple-surface flex items-center justify-center overflow-hidden border-2 border-[#e1d1bc] dark:border-[#141419]">
            {userAvatar ? (
              <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User size={32} className="text-apple-accent" />
            )}
          </div>
        </div>
        <div className="flex-1 z-10">
          <h2 className="font-sans text-2xl font-bold mb-1 tracking-wider text-apple-text drop-shadow-md">{userName}</h2>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-apple-accent animate-pulse shadow-[0_0_8px_rgba(185,123,40,0.35)] dark:shadow-[0_0_8px_rgba(107,138,255,0.8)]"></span>
            <p className="text-xs text-apple-accent font-mono tracking-widest">
              {preferredAddress ? `她会叫你：${preferredAddress}` : 'ID: 88481234'}
            </p>
          </div>
        </div>
        <button 
          onClick={() => {
            setEditName(userName);
            setEditPreferredAddress(preferredAddress);
            setEditAvatar(userAvatar);
            setIsEditing(true);
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-apple-surface hover:bg-apple-surface-hover border border-apple-border transition-colors text-apple-text-muted hover:text-apple-text z-10 shadow-sm"
        >
          <Edit2 size={14} />
        </button>
      </motion.div>

      {/* Edit Profile Modal */}
      {createPortal(
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-4" style={{ zIndex: 80 }}>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsEditing(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-apple-surface backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-apple-border relative z-10"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-sans font-bold text-lg text-apple-text">编辑个人资料</h3>
                <button onClick={() => setIsEditing(false)} className="p-1 rounded-full hover:bg-apple-surface-hover text-apple-text-muted">
                  <X size={20} />
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-xs font-medium text-apple-text-muted mb-2">昵称</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-apple-surface border border-apple-border rounded-xl px-4 py-3 text-sm text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-accent/35 transition-all"
                  placeholder="输入你的昵称"
                  maxLength={12}
                />
              </div>

              <div className="mb-6">
                <label className="block text-xs font-medium text-apple-text-muted mb-2">想被怎么称呼</label>
                <input
                  type="text"
                  value={editPreferredAddress}
                  onChange={(e) => setEditPreferredAddress(e.target.value)}
                  className="w-full bg-apple-surface border border-apple-border rounded-xl px-4 py-3 text-sm text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-accent/35 transition-all"
                  placeholder="比如：宝子、小鱼、姐姐"
                  maxLength={16}
                />
                <p className="mt-2 text-[11px] leading-relaxed text-apple-text-muted">
                  留空则按昵称称呼。首次弹窗选择后，也可以回到这里重新调整。
                </p>
              </div>

              <div className="mb-8">
                <label className="block text-xs font-medium text-apple-text-muted mb-3">选择头像</label>
                <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar items-center">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 border-2 border-dashed border-apple-border bg-apple-surface hover:bg-apple-surface-hover transition-all"
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
                    className={clsx(
                      "w-14 h-14 rounded-full flex items-center justify-center shrink-0 border-2 transition-all",
                      editAvatar === null ? "border-apple-accent shadow-[0_8px_20px_rgba(185,123,40,0.16)] scale-110 dark:shadow-[0_4px_15px_rgba(107,138,255,0.3)]" : "border-transparent bg-apple-surface"
                    )}
                  >
                    <User size={24} className="text-apple-text-muted" />
                  </button>
                  {AVATARS.map((avatar, idx) => (
                    <button 
                      key={idx}
                      onClick={() => setEditAvatar(avatar)}
                      className={clsx(
                        "w-14 h-14 rounded-full overflow-hidden shrink-0 border-2 transition-all",
                        editAvatar === avatar ? "border-apple-accent shadow-[0_8px_20px_rgba(185,123,40,0.16)] scale-110 dark:shadow-[0_4px_15px_rgba(107,138,255,0.3)]" : "border-transparent bg-apple-surface"
                      )}
                    >
                      <img src={avatar} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleSaveProfile}
                className="w-full py-3 bg-apple-gold text-[#17130f] rounded-xl font-bold shadow-[0_14px_28px_rgba(185,123,40,0.20)] flex items-center justify-center gap-2 hover:bg-[#c88a34] transition-colors dark:bg-[#6B8AFF] dark:text-white dark:shadow-[0_4px_20px_rgba(107,138,255,0.3)] dark:hover:bg-[#4F46E5]"
              >
                <Check size={18} />
                保存修改
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body,
      )}

      {createPortal(
      <AnimatePresence>
        {showMembershipModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-4" style={{ zIndex: 80 }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#3b2a1d]/42 backdrop-blur-xl dark:bg-black/70"
              onClick={() => setShowMembershipModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 18 }}
              className="relative z-10 max-h-[calc(100svh-32px)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-3xl border border-apple-border bg-apple-surface p-6 shadow-2xl no-scrollbar dark:border-[#F4CF83]/25 dark:bg-[#111722]"
            >
              <button onClick={() => setShowMembershipModal(false)} className="absolute right-4 top-4 rounded-full p-2 text-apple-text-muted hover:bg-apple-surface-hover hover:text-apple-text dark:hover:bg-white/[0.06]">
                <X size={18} />
              </button>
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-apple-gold/15 text-apple-gold">
                <Crown size={24} />
              </div>
              <h3 className="text-2xl font-bold text-apple-text">{testerActive ? '完整功能已解锁' : plusActive ? '权益已生效' : '让星轨继续记得你'}</h3>
              <p className="mt-2 text-sm leading-relaxed text-apple-text-muted">
                当前状态：{membershipLabel}。支付成功后权益会立即到账，可以回到刚刚的页面继续使用。
              </p>
              <div className="mt-4 rounded-[24px] border border-apple-gold/25 bg-[linear-gradient(145deg,rgba(185,123,40,0.12),rgba(124,156,255,0.08))] p-4 dark:bg-[linear-gradient(145deg,rgba(244,207,131,0.14),rgba(124,156,255,0.08))]">
                <div className="flex items-center gap-2 text-xs font-black text-apple-gold">
                  <Sparkles size={14} />
                  不用从头再讲一遍
                </div>
                <p className="mt-2 text-sm leading-relaxed text-apple-text">{purchaseContextLine}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-apple-text-muted">
                  <div className="rounded-2xl border border-apple-border/70 bg-[#fff8ed]/70 px-2 py-2 dark:border-white/10 dark:bg-black/20">
                    <div className="font-black text-apple-text">{tarotReadings.length}</div>
                    <div>牌迹</div>
                  </div>
                  <div className="rounded-2xl border border-apple-border/70 bg-[#fff8ed]/70 px-2 py-2 dark:border-white/10 dark:bg-black/20">
                    <div className="font-black text-apple-text">{diaryEntries.length}</div>
                    <div>日记</div>
                  </div>
                  <div className="rounded-2xl border border-apple-border/70 bg-[#fff8ed]/70 px-2 py-2 dark:border-white/10 dark:bg-black/20">
                    <div className="font-black text-apple-text">{profiles.length}</div>
                    <div>档案</div>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {PLUS_VALUE_PILLARS.map((item) => (
                  <div key={item.title} className="rounded-[20px] border border-apple-border bg-apple-surface-hover/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="text-sm font-black text-apple-text">{item.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-apple-text-muted">{item.desc}</div>
                  </div>
                ))}
              </div>
              {trialAvailable && (
                <button
                  onClick={handleStartTrial}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-apple-gold/28 bg-apple-gold/12 py-3 text-sm font-bold text-apple-gold"
                >
                  <Sparkles size={16} />
                  先试用 24 小时 Plus
                </button>
              )}
              <div className="mt-4 rounded-[24px] border border-apple-border bg-apple-surface-hover/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="mb-2 text-xs font-bold text-apple-text-muted">兑换码</div>
                <div className="flex gap-2">
                  <input
                    value={redeemCode}
                    onChange={(event) => setRedeemCode(event.target.value)}
                    placeholder="输入兑换码"
                    className="min-w-0 flex-1 rounded-2xl border border-apple-border bg-apple-surface px-3 py-2 text-sm font-semibold text-apple-text outline-none placeholder:text-apple-text-muted/60 focus:border-apple-gold/50 dark:border-white/10 dark:bg-black/20"
                  />
                  <button
                    type="button"
                    onClick={handleRedeemTesterCode}
                    className="shrink-0 rounded-2xl border border-apple-gold/24 bg-apple-gold/12 px-4 py-2 text-sm font-bold text-apple-gold transition-colors hover:bg-apple-gold/18 dark:border-white/10 dark:bg-white/[0.08] dark:text-apple-text dark:hover:bg-white/[0.12]"
                  >
                    兑换
                  </button>
                </div>
              </div>
              <div className="mt-5 rounded-[24px] border border-apple-gold/20 bg-apple-gold/10 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-apple-gold">开通后马上发生</div>
                <div className="mt-2 text-sm leading-relaxed text-apple-text">
                  选择今日深解，会把今天这张牌讲得更细；选择 Plus，每天都可以看完整日运、长期牌迹和周报。
                </div>
                <div className="mt-3 grid gap-2">
                  {SPIRITUAL_ANCHORS.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-apple-border bg-[#fff8ed]/70 p-3 dark:border-white/10 dark:bg-black/20">
                      <div className="text-sm font-black text-apple-text">{item.title}</div>
                      <div className="mt-1 text-xs leading-relaxed text-apple-text-muted">{item.desc}</div>
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
                      'w-full rounded-[24px] border p-4 text-left transition-all',
                      selectedPlanId === plan.id
                        ? 'border-apple-gold/55 bg-apple-gold/12 text-apple-text shadow-[0_14px_34px_rgba(185,123,40,0.12)] dark:shadow-[0_14px_34px_rgba(244,207,131,0.10)]'
                        : 'border-apple-border bg-apple-surface/70 text-apple-text-muted hover:border-apple-gold/26 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/18',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-black text-apple-text">{plan.label}</span>
                          {plan.id === recommendedPlanId && (
                            <span className="rounded-full bg-apple-gold px-2 py-0.5 text-[10px] font-black text-[#11131a]">
                              更适合现在
                            </span>
                          )}
                          <span className="rounded-full border border-apple-gold/24 bg-apple-gold/10 px-2 py-0.5 text-[10px] font-bold text-apple-gold">
                            {plan.badge}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-bold text-apple-text">{plan.title}</div>
                        <p className="mt-1 text-xs leading-relaxed text-apple-text-muted">{plan.desc}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs text-apple-text-muted">¥</div>
                        <div className="text-3xl font-black text-apple-gold">{plan.price}</div>
                      </div>
                    </div>
                    {selectedPlanId === plan.id && (
                      <div className="mt-3 grid gap-1.5 text-xs leading-relaxed text-apple-text-muted">
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
                <div className="mb-2 text-xs font-bold text-apple-text-muted">支付方式</div>
                <div className="grid grid-cols-2 gap-2">
                  {PAY_METHODS.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedPayMethod(method.id)}
                      className={clsx(
                        'rounded-2xl border p-3 text-left transition-all',
                        selectedPayMethod === method.id
                          ? 'border-apple-gold/50 bg-apple-gold/12 text-apple-text'
                          : 'border-apple-border bg-apple-surface/70 text-apple-text-muted dark:border-white/10 dark:bg-white/[0.04]',
                      )}
                    >
                      <div className="text-sm font-bold">{method.label}</div>
                      <div className="mt-1 text-[11px] leading-relaxed text-apple-text-muted">{method.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-apple-border bg-apple-surface/70 p-3 text-xs leading-relaxed text-apple-text-muted dark:border-white/10 dark:bg-white/[0.04]">
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
                <div className="mt-3 rounded-2xl border border-apple-gold/20 bg-apple-gold/10 p-3 text-xs leading-relaxed text-apple-gold">
                  {paymentMessage}
                </div>
              )}
              <button
                onClick={handleCreatePaymentOrder}
                disabled={isCreatingPayment || !guardianConsent}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-apple-gold to-[#dcb66f] py-3 font-bold text-[#080a11] disabled:opacity-50 dark:to-[#7C9CFF]"
              >
                {isCreatingPayment ? <Loader2 size={18} className="animate-spin" /> : <WalletCards size={18} />}
                解锁 {selectedPlan.label} · ¥{selectedPlan.price}
              </button>
              <button
                onClick={() => setShowMembershipModal(false)}
                className="mt-3 w-full rounded-full border border-apple-border bg-apple-surface/70 py-3 font-bold text-apple-text-muted dark:border-white/10 dark:bg-white/[0.04]"
              >
                暂时不用
              </button>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-apple-text-muted">
                正式支付前会清楚展示价格与规则。未成年人付费必须先征得监护人同意。
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body,
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="bg-apple-surface backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-3 border border-apple-border shadow-[0_12px_30px_rgba(117,82,42,0.11)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.3)] relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-apple-accent/10 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center gap-2 text-apple-text-muted relative z-10">
            <div className="p-1.5 rounded-lg bg-apple-accent/10 border border-apple-accent/20">
              <Sparkles size={14} className="text-apple-accent" />
            </div>
            <span className="text-xs font-medium tracking-widest">剩余能量</span>
          </div>
          <div className="text-3xl font-sans font-bold text-apple-text relative z-10 drop-shadow-md">{testerActive ? '∞' : energy}</div>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, x: 20 }} 
          animate={{ opacity: 1, x: 0 }} 
          transition={{ delay: 0.2 }} 
          onClick={() => navigate('/app/collection')}
          className="bg-apple-surface backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-3 border border-apple-border shadow-[0_12px_30px_rgba(117,82,42,0.11)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.3)] relative overflow-hidden cursor-pointer hover:border-apple-gold/50 transition-colors group"
        >
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-apple-gold/10 rounded-full blur-xl pointer-events-none group-hover:bg-apple-gold/20 transition-colors"></div>
          <div className="flex items-center gap-2 text-apple-text-muted relative z-10">
            <div className="p-1.5 rounded-lg bg-apple-gold/10 border border-apple-gold/20 group-hover:bg-apple-gold/20 transition-colors">
              <LibraryIcon size={14} className="text-apple-gold" />
            </div>
            <span className="text-xs font-medium tracking-widest">收集进度</span>
          </div>
          <div className="text-3xl font-sans font-bold text-apple-text relative z-10 drop-shadow-md">{fragments.length} <span className="text-lg text-apple-text-muted/50">/ 8</span></div>
        </motion.div>
      </div>

      {/* Retention & Plus Preview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="mb-8 rounded-3xl border border-[#D8B26B]/35 bg-[linear-gradient(145deg,rgba(255,252,246,0.96),rgba(244,235,221,0.88))] p-5 shadow-[0_18px_52px_rgba(117,82,42,0.14)] relative overflow-hidden dark:border-[#F4CF83]/25 dark:bg-[linear-gradient(145deg,rgb(27,32,48),rgb(18,23,34),rgb(11,14,21))] dark:shadow-[0_18px_60px_rgba(0,0,0,0.36)]"
      >
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-apple-gold/12 blur-3xl" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-apple-gold">
              <Crown size={18} />
              <span className="text-sm font-bold tracking-wide">{testerActive ? '完整权限' : plusActive ? 'Plus 已开通' : '星轨 Plus'}</span>
            </div>
            <h3 className="mt-2 text-2xl font-bold text-apple-text">{testerActive ? '完整功能已解锁' : plusActive ? `还剩约 ${plusDaysLeft} 天权益` : '把零散问题变成长期档案'}</h3>
            <p className="mt-2 text-sm leading-relaxed text-apple-text-muted">
              {membershipLabel}。你留下的牌迹、日记和档案越多，星轨越能接住你的上下文；开通后不用每次重新解释自己。
            </p>
          </div>
          <button
            onClick={() => setShowMembershipModal(true)}
            className="shrink-0 rounded-full bg-apple-gold px-4 py-2 text-xs font-bold text-[#080a11] shadow-[0_10px_28px_rgba(185,123,40,0.22)] dark:shadow-[0_10px_28px_rgba(244,207,131,0.25)]"
          >
            {testerActive ? '查看权益' : plusActive ? '管理权益' : '查看付费方案'}
          </button>
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-2 gap-3">
          <GrowthMetric icon={<CalendarCheck size={15} />} label="连续陪伴" value={`${checkInStreak} 天`} />
          <GrowthMetric icon={<Sparkles size={15} />} label="提问记录" value={`${userQuestionCount} 次`} />
          <GrowthMetric icon={<Gift size={15} />} label="牌迹沉淀" value={`${tarotReadings.length} 次`} />
          <GrowthMetric icon={<ShieldCheck size={15} />} label="沙盘推演" value={`${simulationHistory.length} 次`} />
        </div>
        <div className="relative z-10 mt-3 rounded-2xl border border-apple-border bg-apple-surface/70 p-3 text-xs leading-relaxed text-apple-text-muted dark:border-white/10 dark:bg-white/[0.045]">
          当前状态：<span className="font-bold text-apple-text">{userSegment}</span> · 已陪伴 {engagement.activeDays} 天 · 已沉淀 {memorySeedCount} 份线索
          <div className="mt-1 text-[11px]">每一次记录都会让星轨更接近你的语言，而不只是给你一次性的答案。</div>
        </div>

        <div className="relative z-10 mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-apple-text-muted">
            <span>成长解锁度</span>
            <span>{valueScore}/100</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-apple-gold to-[#dcb66f] dark:to-[#7C9CFF]"
              initial={{ width: 0 }}
              animate={{ width: `${valueScore}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
          <p className="mt-2 text-[11px] text-apple-text-muted">
            上次签到：{lastCheckInLabel}。未成年人开通任何付费项前，应获得监护人同意。
          </p>
        </div>
      </motion.div>

      {/* Profiles Section */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-sans font-bold text-lg text-apple-text flex items-center gap-2">
            <Compass size={18} className="text-apple-gold" />
            命理档案
          </h3>
          <button 
            onClick={() => navigate('/app/bazi')}
            className="text-xs font-medium text-apple-gold bg-apple-gold/10 px-3 py-1.5 rounded-full hover:bg-apple-gold/20 transition-colors border border-apple-gold/30"
          >
            + 新建档案
          </button>
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
          {profiles.length === 0 ? (
            <div className="w-full bg-apple-surface backdrop-blur-xl rounded-2xl p-6 flex flex-col items-center justify-center text-center border border-apple-border border-dashed shadow-inner">
              <Compass size={32} className="text-apple-text-muted/20 mb-3" />
              <p className="text-sm text-apple-text-muted mb-4">还没有添加任何命理档案</p>
              <button 
                onClick={() => navigate('/app/bazi')}
                className="text-sm font-medium text-black bg-gradient-to-r from-apple-gold to-[#B8860B] px-5 py-2.5 rounded-xl shadow-[0_4px_15px_rgba(212,175,55,0.3)] hover:shadow-[0_4px_20px_rgba(212,175,55,0.5)] transition-all"
              >
                去添加
              </button>
            </div>
          ) : (
            profiles.map(profile => (
              <div 
                key={profile.id}
                onClick={() => setActiveProfileId(profile.id)}
                className={clsx(
                  "min-w-[160px] bg-apple-surface backdrop-blur-xl rounded-2xl p-5 border transition-all cursor-pointer relative overflow-hidden group",
                  activeProfileId === profile.id 
                    ? "border-apple-gold shadow-[0_4px_20px_rgba(212,175,55,0.2)]" 
                    : "border-apple-border hover:border-apple-border shadow-md"
                )}
              >
                {activeProfileId === profile.id && (
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-apple-gold/20 to-transparent rounded-bl-full pointer-events-none"></div>
                )}
                <div className="flex justify-between items-start mb-3 relative z-10">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#fff7ea] to-[#ead8bd] flex items-center justify-center text-lg shadow-inner border border-apple-border group-hover:border-apple-border transition-colors dark:from-[#2A2A35] dark:to-[#141419]">
                    {profile.gender === 'male' ? '👨' : '👩'}
                  </div>
                  {activeProfileId === profile.id && (
                    <div className="bg-apple-gold text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">当前</div>
                  )}
                </div>
                <h4 className="font-bold text-apple-text mb-1 truncate relative z-10">{profile.name}</h4>
                <p className="text-xs text-apple-text-muted font-mono relative z-10">{profile.birthDate}</p>
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`确定要删除 ${profile.name} 的档案吗？`)) {
                      setProfiles(prev => prev.filter(p => p.id !== profile.id));
                      if (activeProfileId === profile.id) {
                        setActiveProfileId(null);
                      }
                    }
                  }}
                  className="absolute bottom-4 right-4 p-1.5 rounded-full bg-apple-surface text-apple-text-muted hover:bg-red-500/20 hover:text-red-400 border border-transparent hover:border-red-500/30 transition-all z-20 opacity-0 group-hover:opacity-100"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Bond Level Section */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-apple-surface backdrop-blur-xl rounded-3xl p-6 mb-8 border border-apple-border shadow-[0_14px_40px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-apple-accent/8 to-transparent pointer-events-none"></div>
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-apple-accent/12 blur-3xl rounded-full pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-apple-accent/10 border border-apple-accent/20">
                <Heart size={16} className="text-apple-accent" />
              </div>
              <span className="font-sans font-semibold text-lg tracking-widest text-apple-text">羁绊等级</span>
            </div>
            <span className="text-apple-accent font-bold font-mono bg-apple-accent/10 px-3 py-1 rounded-full border border-apple-accent/20 shadow-[0_8px_18px_rgba(185,123,40,0.12)] dark:shadow-[0_0_10px_rgba(107,138,255,0.2)]">LV.{bondLevel}</span>
          </div>
          
          <div className="text-center mb-6">
            <span className="text-2xl font-sans font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-apple-accent to-apple-gold drop-shadow-sm dark:from-[#6B8AFF] dark:to-[#4F46E5]">
              {LEVEL_TITLES[bondLevel - 1]}
            </span>
          </div>

          <div className="w-full h-2.5 bg-apple-surface rounded-full overflow-hidden mb-3 border border-apple-border shadow-inner">
            <motion.div 
              className="h-full bg-gradient-to-r from-apple-gold to-apple-accent shadow-[0_0_10px_rgba(185,123,40,0.28)] dark:from-[#6B8AFF]/80 dark:to-[#6B8AFF] dark:shadow-[0_0_10px_rgba(107,138,255,0.8)]"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-apple-text-muted font-mono">
            <span>{bondExp} EXP</span>
            <span>{nextLevelExp} EXP</span>
          </div>
        </div>
      </motion.div>

      {/* Settings List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-apple-surface backdrop-blur-xl rounded-3xl overflow-hidden border border-apple-border shadow-[0_14px_40px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
        <SettingToggle 
          icon={<Moon size={18} />} 
          title="背景音乐" 
          checked={settings.bgmEnabled} 
          onChange={() => toggleSetting('bgmEnabled')} 
        />
        <SettingToggle 
          icon={<Vibrate size={18} />} 
          title="触觉反馈" 
          checked={settings.hapticsEnabled} 
          onChange={() => toggleSetting('hapticsEnabled')} 
        />
        <SettingItem title="关于星轨" hasBorder={false} onClick={() => navigate('/app/about')} />
      </motion.div>
    </div>
  );
}

function GrowthMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-apple-border bg-apple-surface/70 p-3 dark:border-white/10 dark:bg-white/[0.045]">
      <div className="mb-2 flex items-center gap-2 text-apple-gold">
        {icon}
        <span className="text-[11px] text-apple-text-muted">{label}</span>
      </div>
      <div className="text-lg font-bold text-apple-text">{value}</div>
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
          <div className="text-sm font-black text-apple-text">{title}</div>
          <div className="mt-1 text-xs leading-relaxed text-apple-text-muted">
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
              'rounded-2xl border px-2 py-2 text-center text-[10px] font-black',
              index <= statusIndex
                ? 'border-apple-gold/30 bg-apple-gold/14 text-apple-gold'
                : 'border-apple-border bg-apple-surface/70 text-apple-text-muted dark:border-white/10 dark:bg-white/[0.04]',
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
          className="mt-3 w-full rounded-full border border-apple-gold/24 bg-apple-surface/70 py-2.5 text-xs font-black text-apple-text dark:bg-white/[0.04]"
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

function SettingToggle({ icon, title, checked, onChange }: { icon: React.ReactNode, title: string, checked: boolean, onChange: () => void }) {
  return (
    <div className="flex items-center justify-between p-5 bg-apple-surface hover:bg-apple-surface-hover transition-colors border-b border-apple-border">
      <div className="flex items-center gap-3 text-apple-text">
        {icon}
        <span className="font-medium tracking-wide text-sm">{title}</span>
      </div>
      <button 
        onClick={onChange}
        className={clsx(
          "w-12 h-6 rounded-full transition-colors relative",
          checked ? "bg-apple-accent" : "bg-apple-surface-hover"
        )}
      >
        <motion.div 
          className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm"
          animate={{ left: checked ? "calc(100% - 22px)" : "2px" }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
}

function SettingItem({ title, hasBorder = true, onClick }: { title: string, hasBorder?: boolean, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center justify-between p-5 bg-apple-surface hover:bg-apple-surface-hover transition-colors cursor-pointer ${hasBorder ? 'border-b border-apple-border' : ''}`}
    >
      <span className="font-medium tracking-wide text-sm text-apple-text">{title}</span>
      <ChevronRight size={18} className="text-apple-text-muted" />
    </div>
  );
}
