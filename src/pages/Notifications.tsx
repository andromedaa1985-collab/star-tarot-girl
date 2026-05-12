import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import clsx from 'clsx';

export default function Notifications() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({ daily: true, energy: true, updates: false });

  const toggle = (key: keyof typeof settings) => setSettings(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="relative h-full w-full overflow-y-auto overscroll-contain px-6 pt-4 pb-40 text-apple-text no-scrollbar">
      <div className="flex items-center mb-8">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-apple-surface-hover transition-colors text-apple-text">
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-sans text-2xl font-bold tracking-widest text-[#6B8AFF] ml-2">通知管理</h1>
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-3xl overflow-hidden border-apple-border shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
        <ToggleRow title="每日占卜提醒" desc="每天清晨提醒您抽取今日塔罗" checked={settings.daily} onChange={() => toggle('daily')} />
        <ToggleRow title="能量恢复通知" desc="当您的星轨能量完全恢复时通知您" checked={settings.energy} onChange={() => toggle('energy')} />
        <ToggleRow title="系统更新与活动" desc="接收关于新版本和限时活动的推送" checked={settings.updates} onChange={() => toggle('updates')} hasBorder={false} />
      </motion.div>
    </div>
  );
}

function ToggleRow({ title, desc, checked, onChange, hasBorder = true }: any) {
  return (
    <div className={`flex items-center justify-between p-5 bg-apple-surface hover:bg-apple-surface-hover transition-colors ${hasBorder ? 'border-b border-apple-border' : ''}`}>
      <div className="flex flex-col gap-1 pr-4">
        <span className="font-medium tracking-wide text-sm text-apple-text">{title}</span>
        <span className="text-xs text-apple-text-muted leading-relaxed">{desc}</span>
      </div>
      <button onClick={onChange} className={clsx("w-12 h-6 rounded-full transition-colors relative shrink-0", checked ? "bg-[#6B8AFF]" : "bg-apple-surface-hover")}>
        <motion.div className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm" animate={{ left: checked ? "calc(100% - 22px)" : "2px" }} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
      </button>
    </div>
  );
}
