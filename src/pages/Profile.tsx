import React, { useEffect, useState, useRef } from 'react';
import { useAppContext, LEVEL_THRESHOLDS, LEVEL_TITLES } from '../store';
import { User, Sparkles, Heart, Settings, ChevronRight, Volume2, Moon, Vibrate, Edit2, X, Check, Upload, Compass, Crown, CalendarCheck, Gift, ShieldCheck, WalletCards, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  activatePlusDays,
  getMembershipLabel,
  getPlusDaysLeft,
  isPlusActive,
  startPlusTrial,
} from '../lib/membership';
import { getUserSegment } from '../lib/engagement';

const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mimi&backgroundColor=d1d4f9',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Leo&backgroundColor=ffd5dc',
];

export default function Profile() {
  const { bondExp, bondLevel, energy, setEnergy, fragments, messages, diaryEntries, tarotReadings, simulationHistory, guardianMessages, settings, setSettings, userName, setUserName, userAvatar, setUserAvatar, profiles, setProfiles, activeProfileId, setActiveProfileId, checkInStreak, lastCheckInDate, membership, setMembership, engagement, appEvents } = useAppContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [isEditing, setIsEditing] = useState(false);
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('plus_monthly');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [editName, setEditName] = useState(userName);
  const [editAvatar, setEditAvatar] = useState(userAvatar);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const nextLevelExp = LEVEL_THRESHOLDS[bondLevel] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const progressPercent = Math.min(100, (bondExp / nextLevelExp) * 100);
  const userQuestionCount = messages.filter(msg => msg.role === 'user').length;
  const valueScore = Math.min(100, bondLevel * 10 + fragments.length * 5 + diaryEntries.length * 6 + tarotReadings.length * 3 + simulationHistory.length * 4 + checkInStreak * 4);
  const lastCheckInLabel = lastCheckInDate ? lastCheckInDate.replace(/-/g, '.') : '还没开始';
  const plusActive = isPlusActive(membership);
  const membershipLabel = getMembershipLabel(membership);
  const plusDaysLeft = getPlusDaysLeft(membership);
  const paymentOrderId = searchParams.get('order') || '';
  const paymentReturnType = searchParams.get('payment') || '';
  const plusParam = searchParams.get('plus') || '';
  const userSegment = getUserSegment({
    plusActive,
    activeDays: engagement.activeDays,
    tarotReadings: tarotReadings.length,
    diaryEntries: diaryEntries.length,
    simulationHistory: simulationHistory.length,
    guardianMessages: guardianMessages.filter((message) => message.role === 'user').length,
  });
  const upgradePromptCount = appEvents.filter((event) => event.type === 'upgrade_prompt').length;

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveProfile = () => {
    if (editName.trim()) {
      setUserName(editName.trim());
    }
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
      setPaymentMessage('这笔订单已经到账过了，不会重复加权益。');
      return;
    }

    if (planId === 'energy_pack_30') {
      setEnergy((value) => value + 30);
      setPaymentMessage('能量包已到账：+30 点星光能量。');
    } else {
      setMembership((current) => activatePlusDays(current));
      setEnergy((value) => Math.max(value, 20));
      setPaymentMessage('Plus 已到账：月卡已生效，能量补到至少 20 点。');
    }
    markOrderGranted(orderId);
  };

  const checkAlipayOrder = async (orderId: string) => {
    if (!orderId) return;

    setPendingOrderId(orderId);
    setPaymentMessage('正在确认支付宝订单状态...');
    try {
      const response = await fetch(`/api/payments/alipay/orders/${encodeURIComponent(orderId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || '订单状态查询失败');

      if (data.order?.status === 'paid') {
        grantPaidPlan(data.order.planId, orderId);
        return;
      }

      setPaymentMessage('订单已创建，但还没收到支付宝支付成功通知。完成付款后点“刷新权益”。');
    } catch (error: any) {
      setPaymentMessage(error.message || '订单状态查询失败');
    }
  };

  const handleStartTrial = () => {
    if (membership.trialUsed || plusActive) return;
    setMembership((current) => startPlusTrial(current));
    setEnergy((value) => Math.max(value, 12));
    setPaymentMessage('已开启 24 小时 Plus 试用，能量补到至少 12 点。');
  };

  useEffect(() => {
    if (paymentReturnType !== 'alipay' || !paymentOrderId) return;
    checkAlipayOrder(paymentOrderId);
  }, [paymentReturnType, paymentOrderId]);

  useEffect(() => {
    if (plusParam === '1') setShowMembershipModal(true);
  }, [plusParam]);

  const handleCreateAlipayOrder = async () => {
    setPaymentMessage(null);
    if (!guardianConsent) {
      setPaymentMessage('请先确认价格规则；未成年人需要监护人同意。');
      return;
    }

    setIsCreatingPayment(true);
    try {
      const response = await fetch('/api/payments/alipay/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlanId,
          channel: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'wap' : 'page',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || '支付宝订单创建失败');

      const paymentWindow = window.open('', '_blank');
      if (!paymentWindow) {
        setPaymentMessage('浏览器拦截了新窗口，请允许弹窗后再试一次。');
        return;
      }
      paymentWindow.document.open();
      paymentWindow.document.write(data.formHtml);
      paymentWindow.document.close();
      setPendingOrderId(data.orderId);
      setPaymentMessage(`已打开支付宝收银台，订单号：${data.orderId}`);
    } catch (error: any) {
      setPaymentMessage(error.message || '支付宝订单创建失败');
    } finally {
      setIsCreatingPayment(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-y-auto overscroll-contain px-6 pt-4 pb-40 text-apple-text no-scrollbar">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-sans text-3xl font-bold tracking-widest text-[#6B8AFF]">我的</h1>
        <button 
          onClick={() => navigate('/app/settings')}
          className="p-2 rounded-full glass-panel hover:bg-apple-surface-hover transition-colors border-apple-border"
        >
          <Settings size={20} className="text-[#6B8AFF]" />
        </button>
      </div>

      {/* User Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-apple-surface backdrop-blur-xl rounded-3xl p-6 mb-8 flex items-center gap-6 relative overflow-hidden border border-apple-border shadow-[0_14px_40px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
      >
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay pointer-events-none"></div>
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-[#6B8AFF]/20 to-transparent rounded-bl-full pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-[#4F46E5]/20 blur-3xl rounded-full pointer-events-none"></div>
        
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#6B8AFF] to-[#4F46E5] p-[2px] shadow-[0_0_20px_rgba(107,138,255,0.4)] shrink-0 relative z-10">
          <div className="w-full h-full rounded-full bg-apple-surface flex items-center justify-center overflow-hidden border-2 border-[#141419]">
            {userAvatar ? (
              <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User size={32} className="text-[#6B8AFF]" />
            )}
          </div>
        </div>
        <div className="flex-1 z-10">
          <h2 className="font-sans text-2xl font-bold mb-1 tracking-wider text-apple-text drop-shadow-md">{userName}</h2>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#6B8AFF] animate-pulse shadow-[0_0_8px_rgba(107,138,255,0.8)]"></span>
            <p className="text-xs text-[#6B8AFF] font-mono tracking-widest">ID: 88481234</p>
          </div>
        </div>
        <button 
          onClick={() => {
            setEditName(userName);
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
                  className="w-full bg-apple-surface border border-apple-border rounded-xl px-4 py-3 text-sm text-apple-text focus:outline-none focus:ring-2 focus:ring-[#6B8AFF]/50 transition-all"
                  placeholder="输入你的昵称"
                  maxLength={12}
                />
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
                      editAvatar === null ? "border-[#6B8AFF] shadow-[0_4px_15px_rgba(107,138,255,0.3)] scale-110" : "border-transparent bg-apple-surface"
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
                        editAvatar === avatar ? "border-[#6B8AFF] shadow-[0_4px_15px_rgba(107,138,255,0.3)] scale-110" : "border-transparent bg-apple-surface"
                      )}
                    >
                      <img src={avatar} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleSaveProfile}
                className="w-full py-3 bg-[#6B8AFF] text-white rounded-xl font-medium shadow-[0_4px_20px_rgba(107,138,255,0.3)] flex items-center justify-center gap-2 hover:bg-[#4F46E5] transition-colors"
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
              className="absolute inset-0 bg-black/70 backdrop-blur-xl"
              onClick={() => setShowMembershipModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 18 }}
              className="relative z-10 max-h-[calc(100svh-32px)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-3xl border border-apple-border bg-apple-surface p-6 shadow-2xl no-scrollbar dark:border-[#F4CF83]/25 dark:bg-[#111722]"
            >
              <button onClick={() => setShowMembershipModal(false)} className="absolute right-4 top-4 rounded-full p-2 text-apple-text-muted hover:bg-white/[0.06] hover:text-apple-text">
                <X size={18} />
              </button>
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F4CF83]/15 text-[#F4CF83]">
                <Crown size={24} />
              </div>
              <h3 className="text-2xl font-bold text-apple-text">{plusActive ? 'Plus 已生效' : 'Plus 权益预览'}</h3>
              <p className="mt-2 text-sm leading-relaxed text-apple-text-muted">
                当前状态：{membershipLabel}。开通后，星轨会把你的提问、日记和陪伴记录整理成更清楚的成长线。
              </p>
              {!plusActive && !membership.trialUsed && (
                <button
                  onClick={handleStartTrial}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-[#F4CF83]/28 bg-[#F4CF83]/12 py-3 text-sm font-bold text-[#B97B28] dark:text-[#F4CF83]"
                >
                  <Sparkles size={16} />
                  先试用 24 小时
                </button>
              )}
              <div className="mt-5 space-y-3">
                <PlusBenefit title="每周成长报告" desc="自动整理一周提问、日记和情绪趋势。" />
                <PlusBenefit title="专属牌面与语音" desc="解锁更有氛围感的牌面、声音和陪伴细节。" />
                <PlusBenefit title="更多每日能量" desc="减少卡顿感，但保留免费路径，不做强迫付费。" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedPlanId('plus_monthly')}
                  className={clsx(
                    "rounded-2xl border p-4 text-left transition-all",
                    selectedPlanId === 'plus_monthly'
                      ? "border-[#F4CF83]/55 bg-[#F4CF83]/12 text-apple-text"
                      : "border-white/10 bg-white/[0.04] text-apple-text-muted"
                  )}
                >
                  <div className="text-xs">Plus 月卡</div>
                  <div className="mt-1 text-2xl font-bold">¥9.9</div>
                </button>
                <button
                  onClick={() => setSelectedPlanId('energy_pack_30')}
                  className={clsx(
                    "rounded-2xl border p-4 text-left transition-all",
                    selectedPlanId === 'energy_pack_30'
                      ? "border-[#F4CF83]/55 bg-[#F4CF83]/12 text-apple-text"
                      : "border-white/10 bg-white/[0.04] text-apple-text-muted"
                  )}
                >
                  <div className="text-xs">能量包</div>
                  <div className="mt-1 text-2xl font-bold">¥6</div>
                </button>
              </div>
              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-relaxed text-apple-text-muted">
                <input
                  type="checkbox"
                  checked={guardianConsent}
                  onChange={(e) => setGuardianConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>我已确认价格和权益；如果我是未成年人，已获得监护人同意。</span>
              </label>
              {paymentMessage && (
                <div className="mt-3 rounded-2xl border border-[#F4CF83]/20 bg-[#F4CF83]/10 p-3 text-xs leading-relaxed text-[#F4CF83]">
                  {paymentMessage}
                </div>
              )}
              {pendingOrderId && (
                <button
                  onClick={() => checkAlipayOrder(pendingOrderId)}
                  className="mt-3 w-full rounded-full border border-[#F4CF83]/24 bg-white/[0.04] py-3 text-sm font-bold text-apple-text"
                >
                  刷新权益
                </button>
              )}
              <button
                onClick={handleCreateAlipayOrder}
                disabled={isCreatingPayment || !guardianConsent}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#F4CF83] to-[#7C9CFF] py-3 font-bold text-[#080a11] disabled:opacity-50"
              >
                {isCreatingPayment ? <Loader2 size={18} className="animate-spin" /> : <WalletCards size={18} />}
                用支付宝付款
              </button>
              <button
                onClick={() => setShowMembershipModal(false)}
                className="mt-3 w-full rounded-full border border-white/10 bg-white/[0.04] py-3 font-bold text-apple-text-muted"
              >
                先了解这些权益
              </button>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-apple-text-muted">
                这是权益预览页。正式支付前会清楚展示价格与规则，未成年人付费必须先征得监护人同意。
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
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-[#6B8AFF]/10 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center gap-2 text-apple-text-muted relative z-10">
            <div className="p-1.5 rounded-lg bg-[#6B8AFF]/10 border border-[#6B8AFF]/20">
              <Sparkles size={14} className="text-[#6B8AFF]" />
            </div>
            <span className="text-xs font-medium tracking-widest">剩余能量</span>
          </div>
          <div className="text-3xl font-sans font-bold text-apple-text relative z-10 drop-shadow-md">{energy}</div>
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
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#F4CF83]/12 blur-3xl" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#F4CF83]">
              <Crown size={18} />
              <span className="text-sm font-bold tracking-wide">{plusActive ? 'Plus 已开通' : '星轨 Plus'}</span>
            </div>
            <h3 className="mt-2 text-2xl font-bold text-apple-text">{plusActive ? `还剩约 ${plusDaysLeft} 天权益` : '把一次占卜变成长期陪伴'}</h3>
            <p className="mt-2 text-sm leading-relaxed text-apple-text-muted">
              {membershipLabel}。每周成长报告、专属牌面、更多能量、长线记忆，都在这里慢慢解锁。
            </p>
          </div>
          <button
            onClick={() => setShowMembershipModal(true)}
            className="shrink-0 rounded-full bg-[#F4CF83] px-4 py-2 text-xs font-bold text-[#080a11] shadow-[0_10px_28px_rgba(244,207,131,0.25)]"
          >
            {plusActive ? '管理权益' : '查看权益'}
          </button>
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-2 gap-3">
          <GrowthMetric icon={<CalendarCheck size={15} />} label="连续陪伴" value={`${checkInStreak} 天`} />
          <GrowthMetric icon={<Sparkles size={15} />} label="提问记录" value={`${userQuestionCount} 次`} />
          <GrowthMetric icon={<Gift size={15} />} label="牌迹沉淀" value={`${tarotReadings.length} 次`} />
          <GrowthMetric icon={<ShieldCheck size={15} />} label="沙盘推演" value={`${simulationHistory.length} 次`} />
        </div>
        <div className="relative z-10 mt-3 rounded-2xl border border-apple-border bg-apple-surface/70 p-3 text-xs leading-relaxed text-apple-text-muted dark:border-white/10 dark:bg-white/[0.045]">
          用户分层：<span className="font-bold text-apple-text">{userSegment}</span> · 活跃 {engagement.activeDays} 天 · 已触发 {upgradePromptCount} 次付费提示
        </div>

        <div className="relative z-10 mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-apple-text-muted">
            <span>成长解锁度</span>
            <span>{valueScore}/100</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#F4CF83] to-[#7C9CFF]"
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
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2A2A35] to-[#141419] flex items-center justify-center text-lg shadow-inner border border-apple-border group-hover:border-apple-border transition-colors">
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
        <div className="absolute inset-0 bg-gradient-to-b from-[#6B8AFF]/10 to-transparent pointer-events-none"></div>
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#6B8AFF]/20 blur-3xl rounded-full pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#6B8AFF]/10 border border-[#6B8AFF]/20">
                <Heart size={16} className="text-[#6B8AFF]" />
              </div>
              <span className="font-sans font-semibold text-lg tracking-widest text-apple-text">羁绊等级</span>
            </div>
            <span className="text-[#6B8AFF] font-bold font-mono bg-[#6B8AFF]/10 px-3 py-1 rounded-full border border-[#6B8AFF]/20 shadow-[0_0_10px_rgba(107,138,255,0.2)]">LV.{bondLevel}</span>
          </div>
          
          <div className="text-center mb-6">
            <span className="text-2xl font-sans font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#6B8AFF] to-[#4F46E5] drop-shadow-sm">
              {LEVEL_TITLES[bondLevel - 1]}
            </span>
          </div>

          <div className="w-full h-2.5 bg-apple-surface rounded-full overflow-hidden mb-3 border border-apple-border shadow-inner">
            <motion.div 
              className="h-full bg-gradient-to-r from-[#6B8AFF]/80 to-[#6B8AFF] shadow-[0_0_10px_rgba(107,138,255,0.8)]"
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
          icon={<Volume2 size={18} />} 
          title="语音播报" 
          checked={settings.voiceEnabled} 
          onChange={() => toggleSetting('voiceEnabled')} 
        />
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
      <div className="mb-2 flex items-center gap-2 text-[#F4CF83]">
        {icon}
        <span className="text-[11px] text-apple-text-muted">{label}</span>
      </div>
      <div className="text-lg font-bold text-apple-text">{value}</div>
    </div>
  );
}

function PlusBenefit({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-apple-border bg-apple-surface/70 p-4 dark:border-white/10 dark:bg-white/[0.045]">
      <div className="font-bold text-apple-text">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-apple-text-muted">{desc}</div>
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
          checked ? "bg-[#6B8AFF]" : "bg-apple-surface-hover"
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
