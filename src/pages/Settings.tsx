import PageHeader from '../components/ui/PageHeader';
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronLeft, Cloud, Database, Download, KeyRound, Mail, RotateCcw, Trash2, Shield, Bell, HelpCircle, LogOut, Compass, Upload, UserRound } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clearAppStorage, downloadAppBackup, getAutoRecoveryMeta, getAutoRecoveryPoint, getBackupSummary, parseBackupFile } from '../lib/appBackup';
import {
  beginAccountTransitionSafely,
  downloadCloudArchive,
  getStoredAccountSession,
  loginAccount,
  isAccountTransitioning,
  isCurrentAccountSession,
  refreshAccountSession,
  registerAccount,
  type AccountSession,
} from '../lib/accountClient';
import { activateAccountWorkspace, logoutAccountWorkspace, restoreActiveWorkspaceBackup, uploadAccountWorkspaceSnapshot } from '../lib/accountWorkspace';

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

    let disposed = false;
    refreshAccountSession(session)
      .then((nextSession) => {
        if (!disposed && !isAccountTransitioning() && isCurrentAccountSession(session)) setAccountSession(nextSession);
      })
      .catch(() => {
        if (!disposed && !isAccountTransitioning() && isCurrentAccountSession(session)) {
          setAccountNotice({ type: 'error', message: '暂时无法刷新账户状态，当前账户和本机记录已保留。请稍后重试。' });
        }
      });
    return () => { disposed = true; };
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

    let releaseSync: (() => Promise<void>) | undefined;
    let reloading = false;
    try {
      releaseSync = await beginAccountTransitionSafely();
      const backup = await parseBackupFile(file);
      const result = await restoreActiveWorkspaceBackup(backup);
      setBackupNotice({
        type: 'success',
        message: `已导入 ${result.importedKeys} 类存档，其中 ${result.mergedKeys} 类记录已自动合并。页面即将刷新。`,
      });
      window.location.reload();
      reloading = true;
    } catch (error: any) {
      setBackupNotice({
        type: 'error',
        message: error?.message || '导入失败，请确认选择的是星轨存档文件。',
      });
    } finally {
      if (!reloading) await releaseSync?.();
    }
  };

  const handleRestoreAutoRecovery = async () => {
    const confirmed = window.confirm('恢复最近自动恢复点会合并其中的记录，并以恢复点里的设置为准。继续恢复吗？');
    if (!confirmed) return;

    let releaseSync: (() => Promise<void>) | undefined;
    let reloading = false;
    try {
      releaseSync = await beginAccountTransitionSafely();
      const backup = await getAutoRecoveryPoint();
      if (!backup) throw new Error('还没有可恢复的自动恢复点。');
      const result = await restoreActiveWorkspaceBackup(backup);
      setBackupNotice({
        type: 'success',
        message: `已恢复最近恢复点，合并 ${result.mergedKeys} 类记录。页面即将刷新。`,
      });
      setAutoRecoveryMeta(getAutoRecoveryMeta());
      window.location.reload();
      reloading = true;
    } catch (error: any) {
      setBackupNotice({
        type: 'error',
        message: error?.message || '恢复失败，当前没有可用的自动恢复点。',
      });
    } finally {
      if (!reloading) await releaseSync?.();
    }
  };

  const handleAccountSubmit = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountNotice(null);
    const previousSession = getStoredAccountSession();
    let releaseSync: (() => Promise<void>) | undefined;
    let reloading = false;
    try {
      releaseSync = await beginAccountTransitionSafely();
      const session = accountMode === 'login'
        ? await loginAccount({ email: accountEmail, password: accountPassword })
        : await registerAccount({ email: accountEmail, password: accountPassword, displayName: accountDisplayName });
      await activateAccountWorkspace(session, previousSession);
      setAccountSession(getStoredAccountSession());
      setAccountPassword('');
      setAccountNotice({
        type: 'success',
        message: accountMode === 'login' ? '登录成功，正在载入账户存档。' : '账户已创建，正在载入账户存档。',
      });
      window.location.reload();
      reloading = true;
    } catch (error: any) {
      setAccountNotice({
        type: 'error',
        message: getAccountErrorMessage(error),
      });
    } finally {
      if (!reloading) {
        await releaseSync?.();
        setAccountBusy(false);
      }
    }
  };

  const handleCloudSync = async () => {
    if (!accountSession || accountBusy || isAccountTransitioning()) return;
    setAccountBusy(true);
    setAccountNotice(null);
    try {
      const nextSession = await uploadAccountWorkspaceSnapshot(accountSession);
      if (isCurrentAccountSession(accountSession) && !isAccountTransitioning()) setAccountSession(nextSession);
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
    if (!accountSession || accountBusy) return;
    const confirmed = window.confirm('从云端恢复会合并云端记录，并以云端设置为准。继续恢复吗？');
    if (!confirmed) return;

    setAccountBusy(true);
    setAccountNotice(null);
    let releaseSync: (() => Promise<void>) | undefined;
    let reloading = false;
    try {
      releaseSync = await beginAccountTransitionSafely();
      const data = await downloadCloudArchive(accountSession);
      const nextSession = {
        ...accountSession,
        user: {
          ...accountSession.user,
          archiveUpdatedAt: data.archiveUpdatedAt,
          archiveRecordCount: data.archiveRecordCount,
        },
      };
      await restoreActiveWorkspaceBackup(data.archive, nextSession);
      setAccountSession(nextSession);
      setAccountNotice({
        type: 'success',
        message: '云端存档已恢复，页面即将刷新。',
      });
      window.location.reload();
      reloading = true;
    } catch (error: any) {
      setAccountNotice({
        type: 'error',
        message: getAccountErrorMessage(error, '恢复失败，请确认这个账户已有云端存档。'),
      });
    } finally {
      if (!reloading) {
        await releaseSync?.();
        setAccountBusy(false);
      }
    }
  };

  const handleAccountLogout = async () => {
    if (accountBusy) return;
    let releaseSync: (() => Promise<void>) | undefined;
    try {
      releaseSync = await beginAccountTransitionSafely();
      setAccountBusy(true);
      await logoutAccountWorkspace();
      setShowLogoutConfirm(false);
      window.location.replace(`/auth?next=${encodeURIComponent('/app')}`);
    } catch (error: any) {
      await releaseSync?.();
      setAccountBusy(false);
      setShowLogoutConfirm(false);
      setAccountNotice({ type: 'error', message: getAccountErrorMessage(error, '退出失败，当前账户和记录已保留。') });
    }
  };

  return (
    <div className="rail-page relative">
      <div className="rail-page-content">
      <PageHeader eyebrow="你的星轨" title="设置" description="管理账号、云端同步与本机存档。" backTo="/app/profile" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-6"
      >
        {/* Account Section */}
        <div className="rail-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-apple-border">
            <h2 className="rail-section-title">账号与隐私</h2>
          </div>
          <div className="border-b border-apple-border p-5">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-apple-gold/25 bg-apple-gold/12 text-apple-gold">
                  <Cloud size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-apple-text">云端账户</div>
                  <p className="mt-2 text-[15px] leading-[1.8] text-apple-text-muted">
                    登录后会自动同步本机存档，也可以手动同步或从云端恢复。切换账户时会暂停同步，并重新载入该账户的记录。
                  </p>
                </div>
              </div>

              {accountSession ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-apple-border bg-apple-surface p-3 text-[13px] leading-[1.8] text-apple-text-muted">
                    <div className="font-semibold text-apple-text">{accountSession.user.displayName}</div>
                    <div className="mt-1 break-all">{accountSession.user.email}</div>
                    <div className="mt-2">云端存档：<span className="font-semibold text-apple-text">{cloudArchiveLabel}</span></div>
                    <div className="mt-1">核心记录：<span className="font-semibold text-apple-text">{accountSession.user.archiveRecordCount} 条</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleCloudSync}
                      disabled={accountBusy}
                      className="rail-button"
                    >
                      <Upload size={16} />
                      同步到云端
                    </button>
                    <button
                      type="button"
                      onClick={handleCloudRestore}
                      disabled={accountBusy || !accountSession.user.archiveUpdatedAt}
                      className="rail-button-secondary"
                    >
                      <Download size={16} />
                      从云端恢复
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleAccountLogout}
                    disabled={accountBusy}
                    className="rail-button-secondary w-full"
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
                      aria-pressed={accountMode === 'login'}
                      className={`rounded-xl py-2 text-[13px] font-semibold ${accountMode === 'login' ? 'bg-apple-surface text-apple-text' : 'text-apple-text-muted'}`}
                    >
                      登录
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountMode('register')}
                      aria-pressed={accountMode === 'register'}
                      className={`rounded-xl py-2 text-[13px] font-semibold ${accountMode === 'register' ? 'bg-apple-surface text-apple-text' : 'text-apple-text-muted'}`}
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
                    className="rail-button w-full"
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
          <SettingRow icon={<Shield size={18} />} title="隐私与存档" onClick={() => navigate('/app/settings/privacy')} />
          <SettingRow icon={<Bell size={18} />} title="通知管理" onClick={() => navigate('/app/settings/notifications')} />
        </div>

        {/* Data Section */}
        <div className="rail-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-apple-border">
            <h2 className="rail-section-title">数据管理</h2>
          </div>
          <div className="border-b border-apple-border p-5">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-apple-gold/25 bg-apple-gold/12 text-apple-gold">
                  <Database size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-apple-text">星轨存档备份</div>
                  <p className="mt-2 text-[15px] leading-[1.8] text-apple-text-muted">
                    保存日记、塔罗记录、八字档案、沙盘推演、守护消息和权益状态。换设备前先导出，导入后会自动合并记录。
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
                <ArchiveStat label="命理档案" value={`${backupSummary.profiles} 份`} />
                <ArchiveStat label="日记记录" value={`${backupSummary.diaryEntries} 篇`} />
                <ArchiveStat label="牌阵记录" value={`${backupSummary.tarotReadings} 次`} />
                <ArchiveStat label="总存档" value={`${archiveCount} 条`} />
              </div>

              <div className="mt-4 rounded-2xl border border-apple-border bg-apple-surface p-3 text-[13px] leading-[1.8] text-apple-text-muted">
                <div>上次手动备份：<span className="font-semibold text-apple-text">{lastBackupLabel}</span></div>
                <div className="mt-1">最近自动恢复点：<span className="font-semibold text-apple-text">{autoRecoveryLabel}</span></div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="rail-button"
                >
                  <Download size={16} />
                  导出存档
                </button>
                <button
                  type="button"
                  onClick={() => backupFileInputRef.current?.click()}
                  className="rail-button-secondary"
                >
                  <Upload size={16} />
                  导入存档
                </button>
                <button
                  type="button"
                  onClick={handleRestoreAutoRecovery}
                  disabled={!autoRecoveryMeta}
                  className="rail-button-secondary col-span-2"
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
                  role="status" className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-[13px] leading-[1.8] ${
                    backupNotice.type === 'error'
                      ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
                      : 'border-apple-gold/25 bg-apple-gold/10 text-apple-text'
                  }`}
                >
                  {backupNotice.type === 'error' ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-apple-gold" />}
                  <span>{backupNotice.message}</span>
                </div>
              )}
            </div>
          </div>
          <button type="button"
            onClick={() => setShowClearConfirm(true)}
            className="flex w-full items-center gap-3 p-5 text-left text-red-700 dark:text-red-300 hover:bg-red-500/5"
          >
            <Trash2 size={18} />
            <span className="font-medium text-[15px]">清除所有数据</span>
          </button>
        </div>

        {/* Support Section */}
        <div className="rail-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-apple-border">
            <h2 className="rail-section-title">支持与帮助</h2>
          </div>
          <SettingRow icon={<HelpCircle size={18} />} title="帮助中心" onClick={() => navigate('/app/settings/help')} />
          <SettingRow icon={<Compass size={18} />} title="查看应用详情页" onClick={() => navigate('/')} />
          {accountSession && <SettingRow
            icon={<LogOut size={18} />} 
            title="退出登录" 
            hasBorder={false} 
            onClick={() => setShowLogoutConfirm(true)} 
          />}
        </div>
      </motion.div>

      <AnimatePresence>
        <SettingsDialog open={showClearConfirm} title="清除所有数据" onClose={() => setShowClearConfirm(false)}>
          <div className="p-6 text-left">
              <h3 className="text-xl font-semibold text-apple-text mb-4">清除所有数据</h3>
              <p className="text-apple-text-muted mb-6 text-[15px] leading-[1.8]">
                此操作会清除本机的日记、塔罗记录、八字档案、沙盘推演、守护消息和能量；已领取的试用记录与生效权益不会重置。建议先导出存档备份。
              </p>
              <div className="flex w-full gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="rail-button-secondary flex-1"
                >
                  取消
                </button>
                <button 
                  onClick={handleClearData}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors"
                >
                  确认清除
                </button>
              </div>
          </div>
        </SettingsDialog>

        <SettingsDialog open={showLogoutConfirm} title="退出登录" onClose={() => setShowLogoutConfirm(false)}>
          <div className="p-6 text-left">
              <h3 className="text-xl font-semibold text-apple-text mb-4">退出登录</h3>
              <p className="text-apple-text-muted mb-6 text-[15px] leading-[1.8]">
                确定要退出当前账号吗？
              </p>
              <div className="flex w-full gap-3">
                <button 
                  onClick={() => setShowLogoutConfirm(false)}
                  className="rail-button-secondary flex-1"
                >
                  取消
                </button>
                <button 
                  onClick={handleAccountLogout}
                  disabled={accountBusy}
                  className="rail-button flex-1"
                >
                  确认退出
                </button>
              </div>
          </div>
        </SettingsDialog>

        {showSuccessToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-apple-text text-apple-bg px-6 py-3 rounded-full text-[15px] font-medium z-[100]"
          >
            数据已清除
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  if (
    message.includes('AUTH_SESSION_SECRET') ||
    message.includes('Netlify') ||
    message.includes('Blobs') ||
    message.includes('Vercel') ||
    message.includes('Upstash') ||
    message.includes('UPSTASH_REDIS_REST')
  ) {
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
  const id = React.useId();
  const label = type === 'email' ? '邮箱' : type === 'password' ? '密码' : '昵称';
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-medium text-apple-text">{label}</label>
      <div className="flex min-h-12 items-center gap-2 rounded-xl border border-apple-border bg-apple-surface px-3 text-apple-text-muted focus-within:border-apple-gold/60 focus-within:text-apple-gold">
      <span aria-hidden="true" className="shrink-0">{icon}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={type === 'password' ? 'current-password' : type === 'email' ? 'email' : 'nickname'}
        className="min-w-0 flex-1 bg-transparent text-base text-apple-text outline-none"
      />
      </div>
    </div>
  );
}

function NoticeBox({ notice }: { notice: BackupNotice }) {
  const isError = notice.type === 'error';
  return (
    <div
      role="status" className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-[13px] leading-[1.8] ${
        isError
          ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
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
    <div className="rounded-xl bg-apple-surface-hover px-3 py-3">
      <div className="text-[13px] text-apple-text-muted">{label}</div>
      <div className="mt-1 text-xl font-medium tabular-nums text-apple-text">{value}</div>
    </div>
  );
}

function SettingRow({ icon, title, hasBorder = true, onClick }: { icon: React.ReactNode; title: string; hasBorder?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-apple-surface-hover ${hasBorder ? 'border-b border-apple-border' : ''}`}>
      <span className="flex items-center gap-3 text-apple-text"><span className="text-apple-gold">{icon}</span><span className="text-[15px] font-medium">{title}</span></span>
      <ChevronLeft size={18} aria-hidden="true" className="text-apple-text-muted rotate-180" />
    </button>
  );
}

function SettingsDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={dialogRef} role="alertdialog" aria-label={title} onCancel={onClose} className="m-auto w-[calc(100%_-_32px)] max-w-md max-h-[calc(100dvh_-_48px)] overflow-y-auto rounded-2xl border border-apple-border bg-apple-surface p-0 text-apple-text backdrop:bg-black/55">{open && children}</dialog>;
}
