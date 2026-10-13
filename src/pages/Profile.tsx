import PageHeader from '../components/ui/PageHeader';
import React, { useEffect, useState, useRef } from 'react';
import { useAppContext, LEVEL_THRESHOLDS, LEVEL_TITLES, FRAGMENTS_POOL } from '../store';
import { User, Sparkles, Settings, ChevronRight, Moon, Vibrate, Edit2, X, Check, Upload, Compass, Crown, CalendarCheck, Gift, ShieldCheck, WalletCards, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
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
import { getPlanPeriodLabel, getPlanTerms, getProfilePurchaseAuthPath } from '../lib/purchaseFlow';
import { getBackupSummary, type BackupSummary } from '../lib/appBackup';
import { formatArchiveTime, getRecentProfileRecords } from '../lib/profileRecords';
import { formatRecordDate } from '../lib/recordSearch';
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


type PayMethodId = (typeof PAY_METHODS)[number]['id'];
type PaymentStatus = 'idle' | 'creating' | 'opened' | 'checking' | 'waiting' | 'paid' | 'failed';
const PLAN_REDIRECTS: Record<string, string> = {
  relationship_report: 'bazi_full_archive',
  relationship_weekly: 'bazi_full_archive',
};

export default function Profile() {
  const { bondExp, bondLevel, energy, setEnergy, fragments, messages, diaryEntries, tarotReadings, simulationHistory, guardianMessages, settings, setSettings, userName, setUserName, preferredAddress, setPreferredAddress, setPreferredAddressPromptDismissed, userAvatar, setUserAvatar, profiles, setProfiles, activeProfileId, setActiveProfileId, setBaziFormData, setBaziMessages, checkInStreak, lastCheckInDate, membership, setMembership, engagement, appEvents } = useAppContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [isEditing, setIsEditing] = useState(false);
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('daily_fortune_deep');
  const [selectedPayMethod, setSelectedPayMethod] = useState<PayMethodId>('alipay');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialNotice, setTrialNotice] = useState<{ error: boolean; message: string } | null>(null);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemNotice, setRedeemNotice] = useState<{ error: boolean; message: string } | null>(null);
  const trialResumeAttempted = useRef(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [editName, setEditName] = useState(userName);
  const [editPreferredAddress, setEditPreferredAddress] = useState(preferredAddress);
  const [editAvatar, setEditAvatar] = useState(userAvatar);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupSummary, setBackupSummary] = useState<BackupSummary | null>(() => {
    try { return getBackupSummary(); } catch { return null; }
  });
  const [archiveNotice, setArchiveNotice] = useState('');
  const session = getStoredAccountSession();
  const recentRecords = getRecentProfileRecords(tarotReadings, diaryEntries, simulationHistory);

  const refreshArchiveStatus = () => {
    try { setBackupSummary(getBackupSummary()); setArchiveNotice('已刷新本机存档状态。云端时间来自上次服务端确认。'); }
    catch { setBackupSummary(null); setArchiveNotice('暂时无法读取本机存档状态，请到设置检查或导出记录。'); }
  };
  useEffect(() => {
    const refresh = () => { try { setBackupSummary(getBackupSummary()); } catch { setBackupSummary(null); } };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  
  const nextLevelExp = LEVEL_THRESHOLDS[bondLevel] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const progressPercent = Math.min(100, (bondExp / nextLevelExp) * 100);
  const userQuestionCount = messages.filter(msg => msg.role === 'user').length;
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
  const selectedPlan = shopPlans.find((plan) => plan.id === selectedPlanId) || shopPlans[0];
  const selectedPayMethodMeta = PAY_METHODS.find((method) => method.id === selectedPayMethod) || PAY_METHODS[0];

  const toggleSetting = (key: 'bgmEnabled' | 'hapticsEnabled') => {
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
    if (redeemBusy) return;
    const normalizedCode = redeemCode.trim().toUpperCase();
    if (!normalizedCode) {
      setRedeemNotice({ error: true, message: '请输入兑换码。' });
      return;
    }
    if (!getStoredAccountSession()) {
      setRedeemNotice({ error: true, message: '请先在设置中登录账户，再回来兑换。' });
      return;
    }
    setRedeemBusy(true);
    setRedeemNotice(null);
    try {
      const snapshot = await redeemEntitlementCode(normalizedCode);
      applyServerEntitlements(snapshot);
      setRedeemCode('');
      setRedeemNotice({ error: false, message: snapshot.message || '兑换成功，权益已生效。' });
    } catch (error: any) {
      setRedeemNotice({ error: true, message: error.message || '兑换失败，请稍后再试。' });
    } finally {
      setRedeemBusy(false);
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
    if (!trialAvailable || trialBusy) return;
    if (!getStoredAccountSession()) {
      navigate(getProfilePurchaseAuthPath(selectedPlan.id, true));
      return;
    }
    setTrialBusy(true);
    setTrialNotice(null);
    try {
      const snapshot = await startPlusTrialOnServer();
      applyServerEntitlements(snapshot);
      setTrialNotice({ error: false, message: snapshot.message || '已开通 24 小时 Plus 试用。' });
    } catch (error: any) {
      setTrialNotice({ error: true, message: error.message || '试用暂未开通，请稍后重试。' });
    } finally {
      setTrialBusy(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('trial') !== '1' || !getStoredAccountSession() || trialResumeAttempted.current) return;
    trialResumeAttempted.current = true;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('trial');
    setSearchParams(nextParams, { replace: true });
    void handleStartTrial();
  }, [searchParams]);

  useEffect(() => {
    if (!getStoredAccountSession() || searchParams.get('trial') === '1') return;
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
    if (isCreatingPayment) return;
    setPaymentMessage(null);
    setPaymentStatus('idle');
    const accountSession = getStoredAccountSession();
    if (!accountSession) {
      navigate(getProfilePurchaseAuthPath(selectedPlan.id));
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

      <section className="mb-8" aria-labelledby="my-records-heading">
        <h2 id="my-records-heading" className="rail-section-title mb-4">我的记录</h2>
        <div className="rail-surface divide-y divide-apple-border overflow-hidden">
          {[{ label: '牌迹', count: tarotReadings.length, description: '查找问题与牌面，沿原解读追问', href: '/app?history=1' }, { label: '日记', count: diaryEntries.length, description: '查找、编辑与回看心情', href: '/app/diary' }, { label: '沙盘', count: simulationHistory.length, description: '回看选择与比较标准', href: '/app/simulator' }].map(item => (
            <button key={item.label} type="button" onClick={() => navigate(item.href)} className="flex min-h-20 w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-apple-surface-hover">
              <span className="min-w-0"><span className="block text-base font-medium">{item.label} · {item.count} 条</span><span className="rail-muted mt-1 block">{item.description}</span></span><ChevronRight size={18} aria-hidden="true" className="shrink-0 text-apple-text-muted" />
            </button>
          ))}
        </div>
        <h3 className="mt-6 mb-3 text-base font-medium">最近留下的记录</h3>
        {recentRecords.length ? (
          <ol className="divide-y divide-apple-border">
            {recentRecords.map(record => <li key={`${record.kind}:${record.id}`}><button type="button" onClick={() => navigate(record.href)} className="flex w-full items-start justify-between gap-3 rounded-xl px-2 py-4 text-left hover:bg-apple-surface-hover"><span className="min-w-0"><span className="rail-muted block">{record.label} · {formatRecordDate(record.date)}</span><span className="mt-1 block line-clamp-2 break-words text-base leading-7">{record.title}</span></span><ChevronRight size={17} aria-hidden="true" className="mt-1 shrink-0 text-apple-text-muted" /></button></li>)}
          </ol>
        ) : <div className="rail-empty"><p>还没有留下记录</p><p className="rail-muted mt-2">先抽一张今日牌，或写下一句今天的心情。</p><div className="mt-4 flex flex-wrap justify-center gap-3"><button type="button" onClick={() => navigate('/app')} className="rail-button-secondary">开始今日塔罗</button><button type="button" onClick={() => navigate('/app/diary')} className="rail-button-secondary">写一句心情</button></div></div>}
      </section>

      <section className="rail-panel mb-8" aria-labelledby="archive-status-heading">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="archive-status-heading" className="rail-section-title">账户与存档</h2><button type="button" onClick={refreshArchiveStatus} className="min-h-11 rounded-xl px-3 text-sm text-apple-text-muted hover:bg-apple-surface-hover">刷新状态</button></div>
        <dl className="mt-4 space-y-3 text-sm leading-6">
          <div className="flex flex-wrap justify-between gap-x-4"><dt className="text-apple-text-muted">当前账户</dt><dd className="min-w-0 break-all">{session?.user.email || '本机游客'}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-4"><dt className="text-apple-text-muted">服务端存档时间</dt><dd>{session ? formatArchiveTime(session.user.archiveUpdatedAt, '尚未确认云端存档') : '登录后可同步'}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-4"><dt className="text-apple-text-muted">最近自动恢复点</dt><dd>{backupSummary ? formatArchiveTime(backupSummary.lastAutoRecoveryAt, '尚未生成') : '读取状态失败'}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-4"><dt className="text-apple-text-muted">此浏览器最近手动存档操作</dt><dd>{backupSummary ? formatArchiveTime(backupSummary.lastBackupAt, '尚未操作') : '读取状态失败'}</dd></div>
        </dl>
        <p className="rail-muted mt-4">云端时间是上次确认的存档时间，不代表当前输入已同步。手动存档操作包括导出或恢复，操作时间不能证明备份文件已经保存。</p>
        {archiveNotice && <p role="status" className="rail-muted mt-2">{archiveNotice}</p>}
        <button type="button" onClick={() => navigate('/app/settings')} className="rail-button-secondary mt-4 w-full sm:w-auto">{session ? '备份与云端同步' : '登录或导出存档'}<ChevronRight size={16} aria-hidden="true" /></button>
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
                    className={cn(
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
                      className={cn(
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
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="rail-muted mb-2 flex items-center gap-2"><Crown size={16} className="text-apple-gold" />陪伴权益 · {membershipLabel}</p>
              <h2 className="text-balance text-2xl font-semibold text-apple-text">选择适合你的陪伴</h2>
              <p className="rail-muted mt-2">价格与有效期先看清，按需要开通。</p>
            </div>
            <button type="button" aria-label="关闭会员详情" onClick={() => setShowMembershipModal(false)} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-apple-text-muted hover:bg-apple-surface-hover"><X size={18} /></button>
          </div>

          {trialAvailable && (
            <div className="mt-5 border-b border-apple-border pb-5">
              <button type="button" onClick={handleStartTrial} disabled={trialBusy || isCreatingPayment} className="rail-button-secondary w-full">
                {trialBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {trialBusy ? '正在开通试用' : '先试用 24 小时 Plus'}
              </button>
              <p className="rail-muted mt-2">无需付款，不自动续费。登录后继续领取；试用包含普通 Plus 功能。</p>
            </div>
          )}
          {trialNotice && <ActionNotice {...trialNotice} />}

          <section className="mt-5" aria-labelledby="shop-plan-heading">
            <h3 id="shop-plan-heading" className="mb-3 text-base font-semibold">选择方案</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {shopPlans.map((plan) => (
                <button key={plan.id} type="button" aria-pressed={selectedPlanId === plan.id} onClick={() => { setSelectedPlanId(plan.id); setGuardianConsent(false); }} disabled={isCreatingPayment || trialBusy}
                  className={cn('rounded-xl border p-3 text-left disabled:opacity-50', selectedPlanId === plan.id ? 'border-apple-gold bg-apple-gold/10' : 'border-apple-border hover:bg-apple-surface-hover')}>
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-base font-medium">{plan.label}</span>
                    <span className="shrink-0 text-lg font-semibold tabular-nums text-apple-gold">¥{plan.price}</span>
                  </span>
                  <span className="rail-muted mt-1 flex items-center justify-between gap-2">
                    <span>{getPlanPeriodLabel(plan)}</span>
                    {selectedPlanId === plan.id ? <Check size={14} aria-label="已选择" className="text-apple-gold" /> : plan.id === recommendedPlanId && <span className="text-apple-gold">推荐</span>}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-5 border-t border-apple-border pt-5" aria-labelledby="selected-plan-heading">
            <h3 id="selected-plan-heading" className="text-lg font-semibold">{selectedPlan.title}</h3>
            <p className="mt-2 text-pretty text-sm leading-7 text-apple-text-muted">{selectedPlan.desc}</p>
            <ul className="mt-3 space-y-2 text-sm leading-6">
              {selectedPlan.bullets.map((item) => <li key={item} className="flex items-start gap-2"><Check size={15} aria-hidden="true" className="mt-1 shrink-0 text-apple-gold" /><span>{item}</span></li>)}
            </ul>
            <p id="shop-plan-terms" className="mt-4 rounded-xl bg-apple-surface-hover p-3 text-sm leading-6 text-apple-text">{getPlanTerms(selectedPlan)}</p>
          </section>

          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium">支付方式</legend>
            <div className="grid grid-cols-2 gap-2">
              {PAY_METHODS.map((method) => (
                <button key={method.id} type="button" aria-pressed={selectedPayMethod === method.id} disabled={isCreatingPayment} onClick={() => setSelectedPayMethod(method.id)}
                  className={cn('rounded-xl border p-3 text-left', selectedPayMethod === method.id ? 'border-apple-gold bg-apple-gold/10' : 'border-apple-border hover:bg-apple-surface-hover')}>
                  <span className="block text-base font-medium">{method.label}</span>
                  <span className="rail-muted mt-1 block">{method.desc}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-apple-text-muted">
            <input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} aria-describedby="shop-plan-terms" className="mt-1 size-4 shrink-0 accent-apple-gold" />
            <span>我已确认 ¥{selectedPlan.price} 的价格与上述权益规则；未成年人已获得监护人同意。</span>
          </label>

          {paymentStatus !== 'idle' || pendingOrderId ? (
            <PaymentStatusPanel status={paymentStatus} message={paymentMessage} orderId={pendingOrderId} planLabel={selectedPlan.label} methodLabel={selectedPayMethodMeta.label} onRefresh={() => pendingOrderId && checkPaymentOrder(pendingOrderId)} />
          ) : paymentMessage && <ActionNotice error message={paymentMessage} />}

          <div className="sticky bottom-0 mt-5 border-t border-apple-border bg-apple-surface py-4">
            <button type="button" onClick={handleCreatePaymentOrder} disabled={isCreatingPayment || trialBusy || !guardianConsent} className="rail-button w-full">
              {isCreatingPayment ? <Loader2 size={18} className="animate-spin" /> : <WalletCards size={18} />}
              {isCreatingPayment ? '正在创建订单' : '开通 ' + selectedPlan.label + ' · ¥' + selectedPlan.price}
            </button>
            <button type="button" onClick={() => setShowMembershipModal(false)} className="mt-3 w-full py-2 text-sm text-apple-text-muted hover:text-apple-text">暂时不用</button>
          </div>

          <details className="border-t border-apple-border pt-4">
            <summary className="cursor-pointer py-2 text-sm font-medium">有兑换码？</summary>
            <div className="mt-3 flex gap-2">
              <input aria-label="兑换码" value={redeemCode} onChange={(event) => setRedeemCode(event.target.value)} placeholder="输入兑换码" className="rail-field min-w-0 flex-1" />
              <button type="button" onClick={handleRedeemTesterCode} disabled={redeemBusy} className="rail-button-secondary shrink-0">{redeemBusy ? '兑换中' : '兑换'}</button>
            </div>
            {redeemNotice && <ActionNotice {...redeemNotice} />}
          </details>
        </div>
      </ProfileDialog>

      <section className="grid grid-cols-2 gap-4 mb-8" aria-label="能量与收藏">
        <div className="rail-panel">
          <p className="rail-muted flex items-center gap-2"><Sparkles size={16} className="text-apple-gold" />剩余能量</p>
          <p className="mt-3 text-3xl font-medium tabular-nums">{testerActive ? '∞' : energy}</p>
        </div>
        <button type="button" onClick={() => navigate('/app/collection')} className="rail-panel text-left hover:bg-apple-surface-hover">
          <p className="rail-muted flex items-center gap-2"><LibraryIcon width={16} height={16} className="text-apple-gold" />收集进度</p>
          <p className="mt-3 text-3xl font-medium tabular-nums">{fragments.length}<span className="ml-2 text-base text-apple-text-muted">/ {FRAGMENTS_POOL.length}</span></p>
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
            <GrowthMetric icon={<ShieldCheck size={16} />} label="沙盘记录" value={`${simulationHistory.length} 条`} />
          </div>
          <div className="mt-6 border-t border-apple-border pt-4">
            <p className="rail-muted mt-3">已陪伴 {engagement.activeDays} 天 · 已沉淀 {memorySeedCount} 份线索 · 上次签到 {lastCheckInLabel}</p>
          </div>
        </div>
      </section>

      <section className="mb-8" aria-labelledby="archive-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="archive-heading" className="rail-section-title">命理档案</h2>
          <button type="button" onClick={() => navigate('/app/bazi?new=1')} className="rail-button-secondary">+ 新建档案</button>
        </div>
        {profiles.length === 0 ? (
          <div className="rail-empty"><Compass size={28} className="mx-auto mb-3 text-apple-gold" /><p>还没有添加任何命理档案</p><button type="button" onClick={() => navigate('/app/bazi?new=1')} className="rail-button-secondary mt-5">添加第一份档案</button></div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <div key={profile.id} className={cn('rail-surface p-5 relative', activeProfileId === profile.id && '!border-apple-gold')}>
                <button type="button" onClick={() => {
                  if (activeProfileId === profile.id) return;
                  const { id: _id, ...input } = profile;
                  setBaziFormData(input);
                  setBaziMessages([]);
                  setActiveProfileId(profile.id);
                }} aria-pressed={activeProfileId === profile.id} className="w-full text-left">
                  <span className="mb-4 flex items-center justify-between gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-apple-surface-hover text-xl">{profile.gender === 'male' ? '👨' : '👩'}</span>{activeProfileId === profile.id && <span className="rail-muted !text-apple-gold">当前档案</span>}</span>
                  <span className="block text-base font-medium truncate">{profile.name}</span>
                  <span className="rail-muted mt-1 block tabular-nums">{profile.birthDate} · {profile.birthTime}</span>
                  <span className="rail-muted mt-1 block break-words">出生：{profile.birthLocation} · 现居：{profile.currentLocation}</span>
                </button>
                <button type="button" onClick={() => navigate(`/app/bazi?profile=${encodeURIComponent(profile.id)}`)} className="mt-3 min-h-11 rounded-xl px-2 text-sm text-apple-text-muted hover:bg-apple-surface-hover">编辑这份档案</button>
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

function ActionNotice({ error, message }: { error: boolean; message: string }) {
  return <p role={error ? 'alert' : 'status'} className={cn('mt-3 rounded-xl border p-3 text-sm leading-6', error ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300' : 'border-apple-gold/25 bg-apple-gold/10 text-apple-text')}>{message}</p>;
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
            className={cn(
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
        <span className={cn('h-7 w-12 rounded-full border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-apple-gold', checked ? 'bg-apple-gold border-apple-gold' : 'bg-apple-surface-hover border-apple-border')}><span className={cn('absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform duration-150', checked && 'translate-x-5')} /></span>
      </span>
    </label>
  );
}

function SettingItem({ title, hasBorder = true, onClick }: { title: string; hasBorder?: boolean; onClick?: () => void }) {
  return <button type="button" onClick={onClick} className={cn('flex w-full items-center justify-between gap-3 p-5 text-left text-[15px] font-medium hover:bg-apple-surface-hover', hasBorder && 'border-b border-apple-border')}><span>{title}</span><ChevronRight size={18} className="text-apple-text-muted" /></button>;
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
