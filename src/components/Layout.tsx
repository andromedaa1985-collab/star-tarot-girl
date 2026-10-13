import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Sparkles, User, Compass, Book, Moon, Sun, Settings, LockKeyhole, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { useAppContext } from '../store';
import { hasFeatureAccess, type PremiumFeature } from '../lib/membership';
import { normalizeUserAddress } from '../lib/aiPrompting';
import { useDialogFocus } from '../lib/useDialogFocus';
import { WorkspaceStorageNotice } from './WorkspaceStorageNotice';

const SimulatorIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m15 9 6-6" />
    <path d="M15 15v6" />
    <path d="M21 3v6" />
    <path d="M21 3h-6" />
    <path d="M3 15v6" />
    <path d="M3 21h6" />
    <path d="M3 3v6" />
    <path d="M3 9h6" />
    <path d="M9 21v-6" />
    <path d="M9 3v6" />
    <path d="M15 3v6" />
    <path d="M15 21v-6" />
  </svg>
);

const navItems = [
  { to: '/app', label: '塔罗', icon: <Sparkles size={20} />, end: true },
  { to: '/app/bazi', label: '八字', icon: <Compass size={20} /> },
  { to: '/app/simulator', label: '沙盘', icon: <SimulatorIcon />, feature: 'simulator' as PremiumFeature },
  { to: '/app/diary', label: '日记', icon: <Book size={20} /> },
  { to: '/app/guardian', label: '守护', icon: <Moon size={20} />, feature: 'guardian' as PremiumFeature },
  { to: '/app/profile', label: '我的', icon: <User size={20} /> },
];

export default function Layout() {
  const { preferredAddress, preferredAddressPromptDismissed, membership, theme, setTheme } = useAppContext();
  const addressPromptOpen = !preferredAddress && !preferredAddressPromptDismissed;

  return (
    <div className="rail-app font-sans">
      <aside inert={addressPromptOpen} className="rail-sidebar">
        <NavLink to="/app" className="rail-sidebar-brand">
          <Sparkles size={26} className="text-apple-gold" aria-hidden="true" />
          <span><strong>星轨</strong><small>陪你看清今天</small></span>
        </NavLink>
        <nav aria-label="主导航">
          {navItems.map(item => <React.Fragment key={item.to}><NavItem {...item} locked={Boolean(item.feature && !hasFeatureAccess(membership, item.feature))} /></React.Fragment>)}
        </nav>
        <div className="rail-sidebar-footer">
          <NavLink to="/app/settings" className="rail-nav-item"><Settings size={18} aria-hidden="true" />设置与存档</NavLink>
          <button type="button" className="rail-nav-item w-full" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            {theme === 'dark' ? '浅色模式' : '深色模式'}
          </button>
          <p className="mt-6 px-3 text-xs leading-6 text-apple-text-muted">一张牌，一段心事。<br />把今天过清楚一点。</p>
        </div>
      </aside>
      <main inert={addressPromptOpen} className="rail-main" id="app-main"><WorkspaceStorageNotice /><Outlet /></main>
      <div inert={addressPromptOpen}><BottomDock /></div>
      <PreferredAddressPrompt />
    </div>
  );
}

function PreferredAddressPrompt() {
  const {
    userName,
    preferredAddress,
    setPreferredAddress,
    preferredAddressPromptDismissed,
    setPreferredAddressPromptDismissed,
  } = useAppContext();
  const [draftAddress, setDraftAddress] = React.useState('');
  const shouldShow = !preferredAddress && !preferredAddressPromptDismissed;
  const dialogRef = React.useRef<HTMLFormElement>(null);
  useDialogFocus(dialogRef, shouldShow, () => setPreferredAddressPromptDismissed(true));
  const normalizedDraft = normalizeUserAddress(draftAddress);
  const normalizedUserName = normalizeUserAddress(userName);
  const defaultPreview = normalizedUserName && normalizedUserName !== '星轨旅人'
    ? `默认会按昵称「${normalizedUserName}」来称呼你。`
    : '默认不会强行喊名字，只在语气上更贴近你。';

  React.useEffect(() => {
    if (shouldShow) setDraftAddress('');
  }, [shouldShow]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedDraft) return;
    setPreferredAddress(normalizedDraft);
    setPreferredAddressPromptDismissed(true);
  };

  const handleUseDefault = () => {
    setPreferredAddress('');
    setPreferredAddressPromptDismissed(true);
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto px-4 pb-[calc(18px+var(--app-safe-bottom))] pt-[calc(18px+var(--app-safe-top))] sm:items-center sm:p-6"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[10px]" />
          <motion.form
            ref={dialogRef}
            tabIndex={-1}
            onSubmit={handleSubmit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preferred-address-title"
            aria-describedby="preferred-address-description"
            className="rail-panel relative max-h-full w-full max-w-[420px] overflow-y-auto text-apple-text"
            initial={{ y: 28, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 24, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          >
            <div className="relative">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-apple-gold/10 text-apple-gold">
                  <Sparkles size={20} />
                </div>
                <div className="min-w-0">
                  <h2 id="preferred-address-title" className="text-lg font-bold leading-tight">
                    想让星轨怎么称呼你？
                  </h2>
                  <p id="preferred-address-description" className="mt-2 text-sm leading-relaxed text-apple-text-muted">
                    她会在每日运势和解读里自然叫你一次。选默认后不再弹出，也可以在「我的 - 编辑个人资料」里调整。
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="preferred-address-input" className="mb-2 block text-[13px] font-medium text-apple-text">
                  你爱听的称呼
                </label>
                <input
                  id="preferred-address-input"
                  type="text"
                  value={draftAddress}
                  onChange={(event) => setDraftAddress(event.target.value)}
                  placeholder="比如：宝子、小鱼、姐姐"
                  maxLength={16}
                  className="rail-field"
                />
              </div>

              <div className="mt-3 rounded-xl border border-apple-border bg-apple-surface-hover px-4 py-3 text-[13px] leading-relaxed text-apple-text-muted">
                {normalizedDraft
                  ? `之后她会自然叫你「${normalizedDraft}」，但不会每段都重复。`
                  : defaultPreview}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleUseDefault}
                  className="rail-button-secondary"
                >
                  先用默认
                </button>
                <button
                  type="submit"
                  disabled={!normalizedDraft}
                  className="rail-button"
                >
                  <Check size={17} />
                  就叫这个
                </button>
              </div>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BottomDock() {
  const { membership } = useAppContext();
  return (
    <nav className="rail-mobile-nav" aria-label="主导航">
        {navItems.map((item) => (
          <React.Fragment key={item.to}>
            <NavItem
              to={item.to}
              icon={item.icon}
              label={item.label}
              end={item.end}
              locked={Boolean(item.feature && !hasFeatureAccess(membership, item.feature))}
            />
          </React.Fragment>
        ))}
    </nav>
  );
}

function NavItem({
  to,
  icon,
  label,
  end,
  locked,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  locked?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => clsx('rail-nav-item', isActive && 'active')}
    >
      {({ isActive }) => (
        <>
          <span className="relative" aria-hidden="true">
            {icon}
            {locked && (
              <span className="absolute -right-2 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-apple-gold text-[#14110e]">
                <LockKeyhole size={9} />
              </span>
            )}
          </span>
          <span>
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}
