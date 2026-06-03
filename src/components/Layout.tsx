import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Sparkles, User, Compass, Book, Moon, LockKeyhole, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { useAppContext } from '../store';
import { hasFeatureAccess, type PremiumFeature } from '../lib/membership';
import { normalizeUserAddress } from '../lib/aiPrompting';

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
  const location = useLocation();
  const isTarotHome = location.pathname === '/app';

  return (
    <div className="fixed inset-0 overflow-hidden bg-apple-bg text-apple-text font-sans">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'var(--app-shell-image)',
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:44px_44px] opacity-35" />
        <div
          className="absolute inset-0 opacity-[0.08] mix-blend-screen"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=%270 0 160 160%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.7%27 numOctaves=%272%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")',
          }}
        />
      </div>

      <div className="relative z-10 flex h-full justify-center px-0 sm:px-5 md:py-5">
        <div className="app-stage h-full w-full max-w-[1180px] overflow-hidden shadow-[0_30px_120px_rgba(0,0,0,0.16)] backdrop-blur-2xl sm:rounded-[36px]" style={{ background: 'var(--app-stage-bg)' }}>
          <main className="box-border h-full overflow-hidden pt-[var(--app-safe-top)]">
            <Outlet />
          </main>
        </div>
      </div>

      {!isTarotHome && <BottomDock />}
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
          className="fixed inset-0 z-[90] flex items-end justify-center px-4 pb-[calc(18px+var(--app-safe-bottom))] pt-[calc(18px+var(--app-safe-top))] sm:items-center sm:p-6"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[10px]" />
          <motion.form
            onSubmit={handleSubmit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preferred-address-title"
            className="relative w-full max-w-[390px] overflow-hidden rounded-[30px] border border-[#ead7bb]/85 bg-[#fff8ec]/95 p-5 text-[#2b2117] shadow-[0_24px_70px_rgba(43,33,23,0.28),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl dark:border-white/12 dark:bg-[#121824]/94 dark:text-white dark:shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.08)]"
            initial={{ y: 28, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 24, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          >
            <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[#f1c86f]/20 blur-2xl dark:bg-[#6B8AFF]/18" />
            <div className="relative">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-[#f2d58e] text-[#2c1d0d] shadow-[0_12px_28px_rgba(185,123,40,0.18)] dark:bg-[#f4cf83]">
                  <Sparkles size={20} />
                </div>
                <div className="min-w-0">
                  <h2 id="preferred-address-title" className="text-lg font-bold leading-tight">
                    想让星轨怎么称呼你？
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#736658] dark:text-white/66">
                    她会在每日运势和解读里自然叫你一次。选默认后不再弹出，也可以在「我的 - 编辑个人资料」里调整。
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="preferred-address-input" className="mb-2 block text-xs font-semibold text-[#9a641c] dark:text-[#f4cf83]">
                  你爱听的称呼
                </label>
                <input
                  id="preferred-address-input"
                  type="text"
                  value={draftAddress}
                  onChange={(event) => setDraftAddress(event.target.value)}
                  placeholder="比如：宝子、小鱼、姐姐"
                  maxLength={16}
                  autoFocus
                  className="h-12 w-full rounded-2xl border border-[#dec8aa]/90 bg-white/78 px-4 text-[15px] font-medium text-[#2b2117] outline-none transition focus:border-[#b97b28]/55 focus:ring-4 focus:ring-[#d9a94f]/16 dark:border-white/10 dark:bg-white/[0.07] dark:text-white dark:placeholder:text-white/35 dark:focus:border-[#f4cf83]/45 dark:focus:ring-[#6B8AFF]/18"
                />
              </div>

              <div className="mt-3 rounded-2xl border border-[#ead7bb]/80 bg-white/45 px-4 py-3 text-xs leading-relaxed text-[#7a6d5f] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/58">
                {normalizedDraft
                  ? `之后她会自然叫你「${normalizedDraft}」，但不会每段都重复。`
                  : defaultPreview}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleUseDefault}
                  className="h-12 rounded-2xl border border-[#dfccb2]/90 bg-white/58 text-sm font-semibold text-[#665848] transition active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-white/66"
                >
                  先用默认
                </button>
                <button
                  type="submit"
                  disabled={!normalizedDraft}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#17130f] text-sm font-bold text-[#f4cf83] shadow-[0_14px_28px_rgba(23,19,15,0.18)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#cfc4b4] disabled:text-white/70 disabled:shadow-none dark:bg-[#f4cf83] dark:text-[#17130f] dark:disabled:bg-white/12 dark:disabled:text-white/30"
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
    <nav className="pointer-events-none fixed inset-x-0 z-50 isolate px-3" style={{ bottom: 'var(--app-bottom-pad)' }}>
      <div
        className="absolute inset-x-0 z-0"
        style={{ bottom: 'calc(-1 * var(--app-bottom-pad))', height: 'calc(84px + var(--app-bottom-pad))', background: 'var(--app-dock-wash)' }}
      />
      <div className="pointer-events-auto relative z-10 mx-auto flex h-[64px] w-full max-w-[540px] items-center justify-between gap-1 rounded-[30px] px-2 backdrop-blur-2xl" style={{ background: 'var(--app-dock-bg)', boxShadow: 'var(--app-dock-shadow)' }}>
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
      </div>
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
      className={({ isActive }) =>
        clsx(
          'relative flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[22px] px-1 transition-colors duration-300',
          isActive
            ? 'text-apple-gold'
            : 'text-apple-text-muted hover:bg-apple-surface-hover hover:text-apple-text'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="dock-active-pill"
              className="absolute inset-0 rounded-[22px] bg-apple-surface-hover shadow-[inset_0_0_0_1px_rgba(244,207,131,0.14)]"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <motion.div
            className="relative z-10"
            animate={{ y: isActive ? -2 : 0, scale: isActive ? 1.06 : 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 24 }}
          >
            {icon}
            {locked && (
              <span className="absolute -right-2 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-apple-gold text-[#14110e]">
                <LockKeyhole size={9} />
              </span>
            )}
          </motion.div>
          <span className="relative z-10 text-[9px] font-medium">
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}
