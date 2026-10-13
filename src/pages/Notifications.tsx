import React, { useState } from 'react';
import clsx from 'clsx';
import PageHeader from '../components/ui/PageHeader';

export default function Notifications() {
  const [settings, setSettings] = useState({ daily: true, energy: true, updates: false });
  const toggle = (key: keyof typeof settings) => setSettings((previous) => ({ ...previous, [key]: !previous[key] }));

  return (
    <div className="rail-page">
      <div className="rail-page-content">
        <PageHeader eyebrow="偏好设置" title="通知管理" description="选择想接收的提醒，让陪伴贴合你的生活节奏。" backTo="/app/settings" />
        <section className="rail-surface overflow-hidden" aria-label="通知偏好">
          <ToggleRow title="每日占卜提醒" desc="每天清晨提醒您抽取今日塔罗" checked={settings.daily} onChange={() => toggle('daily')} />
          <ToggleRow title="能量恢复通知" desc="当您的星轨能量完全恢复时通知您" checked={settings.energy} onChange={() => toggle('energy')} />
          <ToggleRow title="系统更新与活动" desc="接收关于新版本和限时活动的推送" checked={settings.updates} onChange={() => toggle('updates')} hasBorder={false} />
        </section>
      </div>
    </div>
  );
}

function ToggleRow({ title, desc, checked, onChange, hasBorder = true }: { title: string; desc: string; checked: boolean; onChange: () => void; hasBorder?: boolean }) {
  return (
    <label className={clsx('flex cursor-pointer items-center justify-between gap-5 p-5 hover:bg-apple-surface-hover sm:p-6', hasBorder && 'border-b border-apple-border')}>
      <span className="min-w-0">
        <span className="block text-base font-medium text-apple-text">{title}</span>
        <span className="rail-muted mt-1 block">{desc}</span>
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" checked={checked} onChange={onChange} className="peer sr-only" />
        <span className={clsx('h-7 w-12 rounded-full border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-apple-gold', checked ? 'border-apple-gold bg-apple-gold' : 'border-apple-border bg-apple-surface-hover')}>
          <span className={clsx('absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform duration-150', checked && 'translate-x-5')} />
        </span>
      </span>
    </label>
  );
}
