import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Cloud,
  Database,
  Download,
  KeyRound,
  Shield,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { downloadAppBackup } from '../lib/appBackup';

type PrivacyNotice = {
  type: 'success' | 'error';
  message: string;
};

const privacyPoints = [
  {
    icon: <KeyRound size={18} />,
    title: 'API key 不在前端',
    desc: '网页只调用后端 /api/* 通道，模型密钥应放在 Netlify 环境变量或服务端配置里，不会打包进浏览器代码。',
  },
  {
    icon: <Database size={18} />,
    title: '存档由你控制',
    desc: '本机存档包含塔罗、日记、八字档案、沙盘推演、守护消息和权益状态；你可以随时导出 JSON 备份。',
  },
  {
    icon: <Cloud size={18} />,
    title: '云端同步需账户操作',
    desc: '登录后可以手动同步或恢复云端存档，未登录状态下不会把本机记录公开给其他用户。',
  },
  {
    icon: <Shield size={18} />,
    title: 'AI 有明确边界',
    desc: '塔罗、日记复盘和守护回复用于陪伴与自我整理，不替代医疗、法律、财务或紧急心理危机支持。',
  },
];

export default function Privacy() {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<PrivacyNotice | null>(null);

  const handleExportBackup = () => {
    try {
      const backup = downloadAppBackup();
      setNotice({
        type: 'success',
        message: `本机存档已导出，生成时间：${formatBackupTime(backup.createdAt)}。`,
      });
    } catch {
      setNotice({
        type: 'error',
        message: '导出失败，请确认浏览器允许下载文件。',
      });
    }
  };

  return (
    <div className="relative h-full w-full overflow-y-auto overscroll-contain px-6 pt-4 pb-40 text-apple-text no-scrollbar">
      <div className="mb-8 flex items-center">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="返回"
          className="-ml-2 rounded-full p-2 text-apple-text transition-colors hover:bg-apple-surface-hover"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="ml-2 font-sans text-2xl font-bold tracking-widest text-[#6B8AFF]">隐私与存档</h1>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-6"
      >
        <section className="rounded-3xl border border-apple-border bg-apple-surface p-5 shadow-[0_14px_38px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-apple-gold/25 bg-apple-gold/12 text-apple-gold">
              <Shield size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-apple-text">你的记录不是用来打扰你的</div>
              <p className="mt-2 text-sm leading-relaxed text-apple-text-muted">
                星轨塔罗少女会用你的历史记录生成更贴近你的复盘，但不会把模型密钥放在前端，也不会把本机存档默认公开。
              </p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-apple-border bg-apple-surface shadow-[0_14px_38px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div className="border-b border-apple-border px-5 py-3">
            <span className="text-xs font-medium tracking-widest text-apple-text-muted">信任说明</span>
          </div>
          <div className="divide-y divide-apple-border">
            {privacyPoints.map((point) => (
              <div key={point.title} className="flex items-start gap-3 p-5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-apple-border bg-apple-surface-hover text-apple-gold">
                  {point.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold tracking-wide text-apple-text">{point.title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-apple-text-muted">{point.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-apple-border bg-apple-surface p-5 shadow-[0_14px_38px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div className="text-xs font-medium tracking-widest text-apple-text-muted">存档操作</div>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              className="flex items-center justify-center gap-2 rounded-2xl bg-apple-gold px-4 py-3 text-sm font-bold text-[#121018] shadow-[0_10px_24px_rgba(185,123,40,0.18)]"
            >
              <Download size={16} />
              导出本机存档
            </button>
            <button
              type="button"
              onClick={() => navigate('/app/settings')}
              className="flex items-center justify-center gap-2 rounded-2xl border border-apple-border bg-apple-surface-hover px-4 py-3 text-sm font-bold text-apple-text"
            >
              <Trash2 size={16} />
              管理导入与清空
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-apple-text-muted">
            清空本机记录前建议先导出备份。有效 Plus 权益和已领取试用状态会尽量保留，避免误删记录时连权益一起丢失。
          </p>

          {notice && (
            <NoticeBox notice={notice} />
          )}
        </section>
      </motion.div>
    </div>
  );
}

function NoticeBox({ notice }: { notice: PrivacyNotice }) {
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

function formatBackupTime(value: string | null | undefined) {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
