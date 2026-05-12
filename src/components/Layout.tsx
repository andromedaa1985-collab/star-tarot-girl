import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Sparkles, User, Compass, Book, Moon, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';

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
  { to: '/app/simulator', label: '沙盘', icon: <SimulatorIcon /> },
  { to: '/app/diary', label: '日记', icon: <Book size={20} /> },
  { to: '/app/guardian', label: '守护', icon: <Moon size={20} /> },
  { to: '/app/profile', label: '我的', icon: <User size={20} /> },
];

export default function Layout() {
  const location = useLocation();
  const isTarotHome = location.pathname === '/app';
  const [tarotNavOpen, setTarotNavOpen] = React.useState(false);

  React.useEffect(() => {
    setTarotNavOpen(false);
  }, [location.pathname]);

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
          <main className="h-full overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>

      {isTarotHome ? (
        <TarotFloatingNav open={tarotNavOpen} onToggle={() => setTarotNavOpen((value) => !value)} />
      ) : (
        <BottomDock />
      )}
    </div>
  );
}

function BottomDock() {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 isolate px-3 pb-[max(env(safe-area-inset-bottom),10px)]">
      <div
        className="absolute inset-x-0 bottom-0 z-0 h-[84px]"
        style={{ background: 'var(--app-dock-wash)' }}
      />
      <div className="pointer-events-auto relative z-10 mx-auto flex h-[64px] w-full max-w-[540px] items-center justify-between gap-1 rounded-[30px] px-2 backdrop-blur-2xl" style={{ background: 'var(--app-dock-bg)', boxShadow: 'var(--app-dock-shadow)' }}>
        {navItems.map((item) => (
          <React.Fragment key={item.to}>
            <NavItem
              to={item.to}
              icon={item.icon}
              label={item.label}
              end={item.end}
            />
          </React.Fragment>
        ))}
      </div>
    </nav>
  );
}

function TarotFloatingNav({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[86px] z-50 flex justify-center px-4">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.nav
            key="tarot-nav-dock"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="pointer-events-auto flex h-12 max-w-[calc(100vw-32px)] items-center gap-1 rounded-[24px] border border-white/10 bg-[#111621]/88 px-1.5 shadow-[0_18px_52px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl"
          >
            {navItems.map((item) => (
              <React.Fragment key={item.to}>
                <FloatingNavItem
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  end={item.end}
                />
              </React.Fragment>
            ))}
            <button
              type="button"
              onClick={onToggle}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[#f4cf83] transition-transform active:scale-95"
              aria-label="close navigation"
              title="close navigation"
            >
              <X size={17} />
            </button>
          </motion.nav>
        ) : (
          <motion.button
            key="tarot-nav-tab"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 14 }}
            type="button"
            onClick={onToggle}
            className="pointer-events-auto fixed bottom-[98px] right-0 flex h-12 w-9 items-center justify-start rounded-l-[22px] border border-r-0 border-white/12 bg-[#111621]/78 pl-2 text-[#f4cf83] opacity-90 shadow-[0_16px_44px_rgba(0,0,0,0.32)] backdrop-blur-2xl transition-transform active:scale-95"
            aria-label="open navigation"
            title="open navigation"
          >
            <Sparkles size={18} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function FloatingNavItem({
  to,
  icon,
  label,
  end,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border backdrop-blur-2xl transition-all',
          isActive
            ? 'border-[#f4cf83]/40 bg-[#f4cf83] text-[#16130f] shadow-[0_10px_24px_rgba(244,207,131,0.24)]'
            : 'border-white/10 bg-[#111621]/70 text-white/62 shadow-[0_10px_24px_rgba(0,0,0,0.26)] hover:bg-[#182033] hover:text-white'
        )
      }
      aria-label={label}
      title={label}
    >
      <span className="scale-90">{icon}</span>
    </NavLink>
  );
}

function NavItem({
  to,
  icon,
  label,
  end,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'relative flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[22px] px-1 transition-colors duration-300',
          isActive
            ? 'text-[#f4cf83]'
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
          </motion.div>
          <span className="relative z-10 text-[9px] font-medium">
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}
