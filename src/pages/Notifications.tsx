import React from 'react';
import { cn } from '../lib/utils';
import PageHeader from '../components/ui/PageHeader';
import { useAppContext } from '../store';

export default function Notifications() {
  const { settings: appSettings, setSettings } = useAppContext();
  const settings = { daily: false, energy: false, updates: false, ...appSettings.notificationPreferences };
  const toggle = (key: keyof typeof settings) => setSettings((previous) => ({ ...previous, notificationPreferences: { ...settings, [key]: !settings[key] } }));

  return (
    <div className="rail-page">
      <div className="rail-page-content">
        <PageHeader eyebrow="偏好设置" title="通知管理" description="保存你想接收的提醒。当前尚未开通系统推送。" backTo="/app/settings" />
        <section className="rail-surface overflow-hidden" aria-label="通知偏好">
          <ToggleRow title="每日占卜提醒" desc="今日塔罗的每日提醒偏好" checked={settings.daily} onChange={() => toggle('daily')} />
          <ToggleRow title="能量状态通知" desc="能量状态变化的提醒偏好" checked={settings.energy} onChange={() => toggle('energy')} />
          <ToggleRow title="系统更新与活动" desc="版本更新和限时活动的提醒偏好" checked={settings.updates} onChange={() => toggle('updates')} hasBorder={false} />
        </section>
        <p role="status" className="rail-muted mt-4">偏好会自动保存，返回页面时继续保留。开通提醒服务前不会发送系统通知。</p>
      </div>
    </div>
  );
}

function ToggleRow({ title, desc, checked, onChange, hasBorder = true }: { title: string; desc: string; checked: boolean; onChange: () => void; hasBorder?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-center justify-between gap-5 p-5 hover:bg-apple-surface-hover sm:p-6', hasBorder && 'border-b border-apple-border')}>
      <span className="min-w-0">
        <span className="block text-base font-medium text-apple-text">{title}</span>
        <span className="rail-muted mt-1 block">{desc}</span>
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" checked={checked} onChange={onChange} className="peer sr-only" />
        <span className={cn('h-7 w-12 rounded-full border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-apple-gold', checked ? 'border-apple-gold bg-apple-gold' : 'border-apple-border bg-apple-surface-hover')}>
          <span className={cn('absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform duration-150', checked && 'translate-x-5')} />
        </span>
      </span>
    </label>
  );
}
