import PageHeader from '../components/ui/PageHeader';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Database,
  Download,
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
    icon: <Shield size={18} />,
    title: '模型密钥由服务端保管',
    desc: '应用通过服务端访问模型，模型密钥不会包含在浏览器加载的网页代码中。',
  },
  {
    icon: <Database size={18} />,
    title: '存档由你控制',
    desc: '本机存档包含塔罗、日记、八字档案、沙盘推演、守护消息和权益状态；你可以随时导出 JSON 备份。',
  },
  {
    icon: <Cloud size={18} />,
    title: '登录后自动同步到你的账户',
    desc: '登录并载入账户存档后，星轨会定期以及在页面离开时尝试上传当前存档，包括日记、牌迹和个人档案。你也可以在设置中手动同步或恢复。未登录时记录保存在本机。',
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
    <div className="rail-page">
      <div className="rail-page-content">
      <PageHeader eyebrow="信任与透明" title="隐私与存档" description="了解记录如何使用，随时备份和管理自己的数据。" backTo="/app/settings" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-6"
      >
        <section className="rail-panel">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-apple-gold/25 bg-apple-gold/12 text-apple-gold">
              <Shield size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-apple-text">你的记录不是用来打扰你的</div>
              <p className="mt-2 text-base leading-[1.85] text-apple-text-muted">
                星轨塔罗少女会用你的历史记录生成更贴近你的复盘，但不会把模型密钥放在前端，也不会把本机存档默认公开。
              </p>
            </div>
          </div>
        </section>

        <section className="rail-surface overflow-hidden">
          <div className="border-b border-apple-border px-5 py-3">
            <span className="text-[13px] font-medium text-apple-text-muted">信任说明</span>
          </div>
          <div className="divide-y divide-apple-border">
            {privacyPoints.map((point) => (
              <div key={point.title} className="flex items-start gap-3 p-5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-apple-border bg-apple-surface-hover text-apple-gold">
                  {point.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-base font-medium text-apple-text">{point.title}</div>
                  <p className="mt-2 text-[15px] leading-[1.85] text-apple-text-muted">{point.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rail-panel">
          <div className="text-[13px] font-medium text-apple-text-muted">存档操作</div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              className="rail-button"
            >
              <Download size={16} />
              导出本机存档
            </button>
            <button
              type="button"
              onClick={() => navigate('/app/settings')}
              className="rail-button-secondary"
            >
              <Trash2 size={16} />
              管理导入与清空
            </button>
          </div>
          <p className="mt-3 text-[13px] leading-[1.8] text-apple-text-muted">
            清空本机记录前建议先导出备份。有效 Plus 权益和已领取试用状态会尽量保留，避免误删记录时连权益一起丢失。
          </p>

          {notice && (
            <NoticeBox notice={notice} />
          )}
        </section>
      </motion.div>
    </div>
      </div>
  );
}

function NoticeBox({ notice }: { notice: PrivacyNotice }) {
  const isError = notice.type === 'error';
  return (
    <div
      role="status" className={`mt-4 flex items-start gap-2 rounded-2xl border px-3 py-2 text-[13px] leading-[1.8] ${
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
