import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronLeft, Cloud, Database, Download, KeyRound, Mail, RotateCcw, Trash2, Shield, Bell, HelpCircle, LogOut, Compass, Upload, UserRound } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clearAppStorage, createAppBackup, downloadAppBackup, getAutoRecoveryMeta, getBackupSummary, importAppBackup, parseBackupFile, restoreAutoRecoveryPoint } from '../lib/appBackup';
import {
  clearAccountSession,
  downloadCloudArchive,
  getStoredAccountSession,
  loginAccount,
  refreshAccountSession,
  registerAccount,
  storeAccountSession,
  uploadCloudArchive,
  type AccountSession,
} from '../lib/accountClient';
import { activateAccountWorkspace, clearActiveLocalWorkspace, saveAccountWorkspace } from '../lib/accountWorkspace';

type BackupNotice = {
  type: 'success' | 'error' | 'info';
  message: string;
};

export default function Settings() {
  const navigate = useNavigate();
  
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [backupNotice, setBackupNotice] = useState<BackupNotice | null>(null);
  const [autoRecoveryMeta, setAutoRecoveryMeta] = useState(() => getAutoRecoveryMeta());
  const [accountSession, setAccountSession] = useState<AccountSession | null>(() => getStoredAccountSession());
  const [accountMode, setAccountMode] = useState<'login' | 'register'>('login');
  const [accountEmail, setAccountEmail] = useState(() => getStoredAccountSession()?.user.email || '');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountDisplayName, setAccountDisplayName] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountNotice, setAccountNotice] = useState<BackupNotice | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const backupSummary = getBackupSummary();
  const archiveCount = backupSummary.profiles + backupSummary.tarotReadings + backupSummary.diaryEntries + backupSummary.simulations + backupSummary.guardianMessages;
  const lastBackupLabel = formatBackupTime(backupSummary.lastBackupAt, '还没有手动备份');
  const autoRecoveryLabel = formatBackupTime(autoRecoveryMeta?.createdAt || backupSummary.lastAutoRecoveryAt, '还没有自动恢复点');
  const cloudArchiveLabel = formatBackupTime(accountSession?.user.archiveUpdatedAt || null, '还没有云端存档');

  React.useEffect(() => {
    const handle = window.setInterval(() => {
      setAutoRecoveryMeta(getAutoRecoveryMeta());
    }, 2500);

    return () => window.clearInterval(handle);
  }, []);

  React.useEffect(() => {
    const session = getStoredAccountSession();
    if (!session) return;

    refreshAccountSession(session)
      .then(setAccountSession)
      .catch(() => {
        clearAccountSession();
        setAccountSession(null);
      });
  }, []);

  const handleClearData = () => {
    clearAppStorage();
    setShowClearConfirm(false);
    setShowSuccessToast(true);
    setTimeout(() => {
      window.location.href = '/app';
    }, 1500);
  };

  const handleExportBackup = () => {
    try {
      const backup = downloadAppBackup();
      setBackupNotice({
        type: 'success',
        message: `存档已导出，生成时间：${formatBackupTime(backup.createdAt)}。`,
      });
    } catch {
      setBackupNotice({
        type: 'error',
        message: '导出失败，请确认浏览器允许下载文件。',
      });
    }
  };

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const confirmed = window.confirm('导入会合并备份里的日记、牌阵、档案和记录；同名设置会以备份为准。继续导入吗？');
    if (!confirmed) return;

    try {
      const backup = await parseBackupFile(file);
      const result = importAppBackup(backup);
      setBackupNotice({
        type: 'success',
        message: `已导入 ${result.importedKeys} 类存档，其中 ${result.mergedKeys} 类记录已自动合并。页面即将刷新。`,
      });
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error: any) {
      setBackupNotice({
        type: 'error',
        message: error?.message || '导入失败，请确认选择的是星轨存档文件。',
      });
    }
  };

  const handleRestoreAutoRecovery = async () => {
    const confirmed = window.confirm('恢复最近自动恢复点会合并其中的记录，并以恢复点里的设置为准。继续恢复吗？');
    if (!confirmed) return;

    try {
      const result = await restoreAutoRecoveryPoint();
      setBackupNotice({
        type: 'success',
        message: `已恢复最近恢复点，合并 ${result.mergedKeys} 类记录。页面即将刷新。`,
      });
      setAutoRecoveryMeta(getAutoRecoveryMeta());
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error: any) {
      setBackupNotice({
        type: 'error',
        message: error?.message || '恢复失败，当前没有可用的自动恢复点。',
      });
    }
  };

  const handleAccountSubmit = async () => {
    setAccountBusy(true);
    setAccountNotice(null);
    const previousSession = getStoredAccountSession();
    try {
      const session = accountMode === 'login'
        ? await loginAccount({ email: accountEmail, password: accountPassword })
        : await registerAccount({ email: accountEmail, password: accountPassword, displayName: accountDisplayName });
      await activateAccountWorkspace(session, previousSession);
      setAccountSession(session);
      setAccountPassword('');
      setAccountNotice({
        type: 'success',
        message: accountMode === 'login' ? '登录成功，可以同步或恢复云端存档。' : '账户已创建，可以把当前本机存档同步到云端。',
      });
    } catch (error: any) {
      setAccountNotice({
        type: 'error',
        message: getAccountErrorMessage(error),
      });
    } finally {
      setAccountBusy(false);
    }
  };

  const handleCloudSync = async () => {
    if (!accountSession) return;
    setAccountBusy(true);
    setAccountNotice(null);
    try {
      const nextSession = await uploadCloudArchive(accountSession, createAppBackup());
      setAccountSession(nextSession);
      setAccountNotice({
        type: 'success',
        message: `已同步到云端，共 ${nextSession.user.archiveRecordCount} 条核心记录。`,
      });
    } catch (error: any) {
      setAccountNotice({
        type: 'error',
        message: getAccountErrorMessage(error, '同步失败，请稍后再试。'),
      });
    } finally {
      setAccountBusy(false);
    }
  };

  const handleCloudRestore = async () => {
    if (!accountSession) return;
    const confirmed = window.confirm('从云端恢复会合并云端记录，并以云端设置为准。继续恢复吗？');
    if (!confirmed) return;

    setAccountBusy(true);
    setAccountNotice(null);
    try {
      const data = await downloadCloudArchive(accountSession);
      importAppBackup(data.archive);
      const nextSession = {
        ...accountSession,
        user: {
          ...accountSession.user,
          archiveUpdatedAt: data.archiveUpdatedAt,
          archiveRecordCount: data.archiveRecordCount,
        },
      };
      storeAccountSession(nextSession);
      setAccountSession(nextSession);
      setAccountNotice({
        type: 'success',
        message: '云端存档已恢复，页面即将刷新。',
      });
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error: any) {
      setAccountNotice({
        type: 'error',
        message: getAccountErrorMessage(error, '恢复失败，请确认这个账户已有云端存档。'),
      });
    } finally {
      setAccountBusy(false);
    }
  };

  const handleAccountLogout = () => {
    if (accountSession) {
      saveAccountWorkspace(accountSession.user.id);
    }
    clearAccountSession();
    clearActiveLocalWorkspace();
    setAccountSession(null);
    setAccountPassword('');
    setAccountNotice({
      type: 'info',
      message: '已退出当前账户，并为这个账户保留本机工作区。',
    });
    window.setTimeout(() => {
      window.location.href = `/auth?next=${encodeURIComponent('/app')}`;
    }, 360);
  };

  return (
    <div className="relative h-full w-full overflow-y-auto overscroll-contain px-6 pt-4 pb-40 text-apple-text no-scrollbar">
      <div className="flex items-center mb-8">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-apple-surface-hover transition-colors text-apple-text"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-sans text-2xl font-bold tracking-widest text-[#6B8AFF] ml-2">设置</h1>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-6"
      >
        {/* Account Section */}
        <div className="bg-apple-surface backdrop-blur-xl rounded-3xl overflow-hidden border border-apple-border shadow-[0_14px_38px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div className="px-5 py-3 bg-apple-surface border-b border-apple-border">
            <span className="text-xs font-medium text-apple-text-muted tracking-widest">账号与隐私</span>
          </div>
          <div className="border-b border-apple-border p-5">
            <div className="rounded-3xl border border-apple-border bg-apple-surface/70 p-4 shadow-inner dark:bg-white/[0.035]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-apple-gold/25 bg-apple-gold/12 text-apple-gold">
                  <Cloud size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-bold text-apple-text">云端账户</div>
                  <p className="mt-1 text-xs leading-relaxed text-apple-text-muted">
                    登录后可以把本机存档同步到云端，换设备时再恢复。当前阶段先支持邮箱和密码。
                  </p>
                </div>
              </div>

              {accountSession ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-apple-border bg-apple-surface/80 p-3 text-xs leading-relaxed text-apple-text-muted dark:bg-white/[0.035]">
                    <div className="font-bold text-apple-text">{accountSession.user.displayName}</div>
                    <div className="mt-1 break-all">{accountSession.user.email}</div>
                    <div className="mt-2">云端存档：<span className="font-semibold text-apple-text">{cloudArchiveLabel}</span></div>
                    <div className="mt-1">核心记录：<span className="font-semibold text-apple-text">{accountSession.user.archiveRecordCount} 条</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleCloudSync}
                      disabled={accountBusy}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-apple-gold px-4 py-3 text-sm font-bold text-[#121018] disabled:opacity-60"
                    >
                      <Upload size={16} />
                      同步到云端
                    </button>
                    <button
                      type="button"
                      onClick={handleCloudRestore}
                      disabled={accountBusy || !accountSession.user.archiveUpdatedAt}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-apple-border bg-apple-surface-hover px-4 py-3 text-sm font-bold text-apple-text disabled:opacity-50"
                    >
                      <Download size={16} />
                      从云端恢复
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleAccountLogout}
                    disabled={accountBusy}
                    className="w-full rounded-2xl border border-apple-border bg-apple-surface/70 px-4 py-3 text-sm font-bold text-apple-text-muted"
                  >
                    退出云端账户
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-apple-surface-hover p-1">
                    <button
                      type="button"
                      onClick={() => setAccountMode('login')}
                      className={`rounded-xl py-2 text-xs font-bold ${accountMode === 'login' ? 'bg-apple-gold text-[#121018]' : 'text-apple-text-muted'}`}
                    >
                      登录
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountMode('register')}
                      className={`rounded-xl py-2 text-xs font-bold ${accountMode === 'register' ? 'bg-apple-gold text-[#121018]' : 'text-apple-text-muted'}`}
                    >
                      注册
                    </button>
                  </div>
                  {accountMode === 'register' && (
                    <AccountInput
                      icon={<UserRound size={15} />}
                      value={accountDisplayName}
                      onChange={setAccountDisplayName}
                      placeholder="昵称，例如：星轨旅人"
                    />
                  )}
                  <AccountInput
                    icon={<Mail size={15} />}
                    value={accountEmail}
                    onChange={setAccountEmail}
                    placeholder="邮箱"
                    type="email"
                  />
                  <AccountInput
                    icon={<KeyRound size={15} />}
                    value={accountPassword}
                    onChange={setAccountPassword}
                    placeholder="密码，至少 8 位"
                    type="password"
                  />
                  <button
                    type="button"
                    onClick={handleAccountSubmit}
                    disabled={accountBusy}
                    className="w-full rounded-2xl bg-apple-gold px-4 py-3 text-sm font-bold text-[#121018] disabled:opacity-60"
                  >
                    {accountBusy ? '处理中...' : accountMode === 'login' ? '登录并查看云端存档' : '创建账户'}
                  </button>
                </div>
              )}

              {accountNotice && (
                <NoticeBox notice={accountNotice} />
              )}
            </div>
          </div>
          <SettingRow icon={<Shield size={18} />} title="隐私设置" onClick={() => navigate('/app/settings/privacy')} />
          <SettingRow icon={<Bell size={18} />} title="通知管理" onClick={() => navigate('/app/settings/notifications')} />
        </div>

        {/* Data Section */}
        <div className="bg-apple-surface backdrop-blur-xl rounded-3xl overflow-hidden border border-apple-border shadow-[0_14px_38px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div className="px-5 py-3 bg-apple-surface border-b border-apple-border">
            <span className="text-xs font-medium text-apple-text-muted tracking-widest">数据管理</span>
          </div>
          <div className="border-b border-apple-border p-5">
            <div className="rounded-3xl border border-apple-border bg-apple-surface/70 p-4 shadow-inner dark:bg-white/[0.035]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-apple-gold/25 bg-apple-gold/12 text-apple-gold">
                  <Database size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-bold text-apple-text">星轨存档备份</div>
                  <p className="mt-1 text-xs leading-relaxed text-apple-text-muted">
                    保存日记、塔罗记录、八字档案、沙盘推演、守护消息和权益状态。换设备前先导出，导入后会自动合并记录。
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <ArchiveStat label="命理档案" value={`${backupSummary.profiles} 份`} />
                <ArchiveStat label="日记记录" value={`${backupSummary.diaryEntries} 篇`} />
                <ArchiveStat label="牌阵记录" value={`${backupSummary.tarotReadings} 次`} />
                <ArchiveStat label="总存档" value={`${archiveCount} 条`} />
              </div>

              <div className="mt-4 rounded-2xl border border-apple-border bg-apple-surface/80 p-3 text-[11px] leading-relaxed text-apple-text-muted">
                <div>上次手动备份：<span className="font-semibold text-apple-text">{lastBackupLabel}</span></div>
                <div className="mt-1">最近自动恢复点：<span className="font-semibold text-apple-text">{autoRecoveryLabel}</span></div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-apple-gold px-4 py-3 text-sm font-bold text-[#121018] shadow-[0_10px_24px_rgba(185,123,40,0.18)]"
                >
                  <Download size={16} />
                  导出存档
                </button>
                <button
                  type="button"
                  onClick={() => backupFileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-apple-border bg-apple-surface-hover px-4 py-3 text-sm font-bold text-apple-text"
                >
                  <Upload size={16} />
                  导入存档
                </button>
                <button
                  type="button"
                  onClick={handleRestoreAutoRecovery}
                  disabled={!autoRecoveryMeta}
                  className="col-span-2 flex items-center justify-center gap-2 rounded-2xl border border-apple-gold/25 bg-apple-gold/10 px-4 py-3 text-sm font-bold text-apple-gold disabled:cursor-not-allowed disabled:border-apple-border disabled:bg-apple-surface-hover disabled:text-apple-text-muted"
                >
                  <RotateCcw size={16} />
                  恢复最近自动恢复点
                </button>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleImportBackup}
                />
              </div>

              {backupNotice && (
                <div
                  className={`mt-4 flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs leading-relaxed ${
                    backupNotice.type === 'error'
                      ? 'border-red-500/25 bg-red-500/10 text-red-300'
                      : 'border-apple-gold/25 bg-apple-gold/10 text-apple-text'
                  }`}
                >
                  {backupNotice.type === 'error' ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-apple-gold" />}
                  <span>{backupNotice.message}</span>
                </div>
              )}
            </div>
          </div>
          <div 
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-3 p-5 hover:bg-apple-surface transition-colors cursor-pointer text-red-400"
          >
            <Trash2 size={18} />
            <span className="font-medium tracking-wide text-sm">清除所有数据</span>
          </div>
        </div>

        {/* Support Section */}
        <div className="bg-apple-surface backdrop-blur-xl rounded-3xl overflow-hidden border border-apple-border shadow-[0_14px_38px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div className="px-5 py-3 bg-apple-surface border-b border-apple-border">
            <span className="text-xs font-medium text-apple-text-muted tracking-widest">支持与帮助</span>
          </div>
          <SettingRow icon={<HelpCircle size={18} />} title="帮助中心" onClick={() => navigate('/app/settings/help')} />
          <SettingRow icon={<Compass size={18} />} title="查看应用详情页" onClick={() => navigate('/')} />
          <SettingRow 
            icon={<LogOut size={18} />} 
            title="退出登录" 
            hasBorder={false} 
            onClick={() => setShowLogoutConfirm(true)} 
          />
        </div>
      </motion.div>

      <AnimatePresence>
        {showClearConfirm && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-apple-surface backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center text-center border border-apple-border shadow-2xl"
            >
              <h3 className="font-sans font-bold text-2xl text-apple-text mb-4">清除所有数据</h3>
              <p className="text-apple-text-muted mb-8 text-sm">
                此操作会清除本机的日记、塔罗记录、八字档案、沙盘推演、守护消息和能量；已领取的试用记录与生效权益不会重置。建议先导出存档备份。
              </p>
              <div className="flex w-full gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-apple-surface-hover text-apple-text font-semibold hover:bg-apple-surface-hover transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={handleClearData}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold shadow-[0_4px_15px_rgba(239,68,68,0.3)] hover:bg-red-600 transition-colors"
                >
                  确认清除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showLogoutConfirm && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-apple-surface backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center text-center border border-apple-border shadow-2xl"
            >
              <h3 className="font-sans font-bold text-2xl text-apple-text mb-4">退出登录</h3>
              <p className="text-apple-text-muted mb-8 text-sm">
                确定要退出当前账号吗？
              </p>
              <div className="flex w-full gap-3">
                <button 
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-apple-surface-hover text-apple-text font-semibold hover:bg-apple-surface-hover transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    navigate('/');
                  }}
                  className="flex-1 py-3 rounded-xl bg-[#6B8AFF] text-white font-semibold shadow-[0_4px_15px_rgba(107,138,255,0.3)] hover:bg-[#4F46E5] transition-colors"
                >
                  确认退出
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showSuccessToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-[#6B8AFF] text-white px-6 py-3 rounded-full text-sm font-medium shadow-[0_4px_15px_rgba(107,138,255,0.4)] z-[100]"
          >
            数据已清除
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatBackupTime(value: string | null | undefined, emptyLabel = '还没有手动备份') {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAccountErrorMessage(error: any, fallback = '账户请求失败，请稍后再试。') {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (!message) return fallback;
  if (message.includes('AUTH_SESSION_SECRET') || message.includes('Netlify') || message.includes('Blobs')) {
    return '账户服务暂时不可用，请稍后再试。';
  }
  return message;
}

function AccountInput({
  icon,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: React.HTMLInputTypeAttribute;
}) {
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-apple-border bg-apple-surface/80 px-3 py-3 text-apple-text-muted focus-within:border-apple-gold/60 focus-within:text-apple-gold dark:bg-white/[0.035]">
      <span className="shrink-0">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={type === 'password' ? 'current-password' : type === 'email' ? 'email' : 'nickname'}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-apple-text placeholder:text-apple-text-muted/70 outline-none"
      />
    </label>
  );
}

function NoticeBox({ notice }: { notice: BackupNotice }) {
  const isError = notice.type === 'error';
  return (
    <div
      className={`mt-4 flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs leading-relaxed ${
        isError
          ? 'border-red-500/25 bg-red-500/10 text-red-300'
          : 'border-apple-gold/25 bg-apple-gold/10 text-apple-text'
      }`}
    >
      {isError ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-apple-gold" />}
      <span>{notice.message}</span>
    </div>
  );
}

function ArchiveStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-apple-border bg-apple-surface/80 px-3 py-2 dark:bg-white/[0.035]">
      <div className="text-[11px] text-apple-text-muted">{label}</div>
      <div className="mt-1 text-sm font-bold text-apple-text">{value}</div>
    </div>
  );
}

function SettingRow({ icon, title, hasBorder = true, onClick }: { icon: React.ReactNode, title: string, hasBorder?: boolean, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center justify-between p-5 hover:bg-apple-surface transition-colors cursor-pointer ${hasBorder ? 'border-b border-apple-border' : ''}`}
    >
      <div className="flex items-center gap-3 text-apple-text">
        {icon}
        <span className="font-medium tracking-wide text-sm">{title}</span>
      </div>
      <ChevronLeft size={18} className="text-apple-text-muted rotate-180" />
    </div>
  );
}
