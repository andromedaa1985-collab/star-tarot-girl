import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronLeft, Database, Download, RotateCcw, Trash2, Shield, Bell, HelpCircle, LogOut, Compass, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clearAppStorage, downloadAppBackup, getAutoRecoveryMeta, getBackupSummary, importAppBackup, parseBackupFile, restoreAutoRecoveryPoint } from '../lib/appBackup';

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
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const backupSummary = getBackupSummary();
  const archiveCount = backupSummary.profiles + backupSummary.tarotReadings + backupSummary.diaryEntries + backupSummary.simulations + backupSummary.guardianMessages;
  const lastBackupLabel = formatBackupTime(backupSummary.lastBackupAt);
  const autoRecoveryLabel = formatBackupTime(autoRecoveryMeta?.createdAt || backupSummary.lastAutoRecoveryAt);

  React.useEffect(() => {
    const handle = window.setInterval(() => {
      setAutoRecoveryMeta(getAutoRecoveryMeta());
    }, 2500);

    return () => window.clearInterval(handle);
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
                此操作会清除本机的日记、塔罗记录、八字档案、沙盘推演、守护消息、能量和权益状态。建议先导出存档备份。
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

function formatBackupTime(value: string | null) {
  if (!value) return '还没有手动备份';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '还没有手动备份';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
