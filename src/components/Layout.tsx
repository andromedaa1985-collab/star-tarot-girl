import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Sparkles, User, Compass, Book, Moon, X, LockKeyhole } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { useAppContext } from '../store';
import { hasFeatureAccess, type PremiumFeature } from '../lib/membership';

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

const TAROT_NAV_POSITION_KEY = 'astroRailTarotFloatingNavPosition';
const TAROT_NAV_CLOSED_SIZE = 48;
const TAROT_NAV_OPEN_WIDTH = 332;
const TAROT_NAV_EDGE = 8;

type FloatingNavPosition = {
  x: number;
  y: number;
};

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const SAFE_AREA_ENV_NAMES: Record<string, string> = {
  '--app-safe-top': 'safe-area-inset-top',
  '--app-safe-bottom': 'safe-area-inset-bottom',
  '--app-safe-left': 'safe-area-inset-left',
  '--app-safe-right': 'safe-area-inset-right',
};

const resolveEnvPixel = (envName: string, fallback = 0) => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) return fallback;
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;contain:strict;padding-top:env(${envName}, 0px);`;
  document.body.appendChild(probe);
  const value = Number.parseFloat(window.getComputedStyle(probe).paddingTop);
  probe.remove();
  return Number.isFinite(value) ? value : fallback;
};

const getCssPixelCustomProperty = (name: string, fallback = 0) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  if (Number.isFinite(value)) return value;
  const envName = SAFE_AREA_ENV_NAMES[name];
  return envName ? resolveEnvPixel(envName, fallback) : fallback;
};

const getSafeAreaInsets = () => ({
  top: getCssPixelCustomProperty('--app-safe-top'),
  bottom: getCssPixelCustomProperty('--app-safe-bottom'),
  left: getCssPixelCustomProperty('--app-safe-left'),
  right: getCssPixelCustomProperty('--app-safe-right'),
});

const getDefaultFloatingNavPosition = (): FloatingNavPosition => {
  if (typeof window === 'undefined') return { x: 320, y: 560 };
  const safeArea = getSafeAreaInsets();
  return {
    x: Math.max(TAROT_NAV_EDGE + safeArea.left, window.innerWidth - safeArea.right - TAROT_NAV_CLOSED_SIZE - TAROT_NAV_EDGE),
    y: Math.max(TAROT_NAV_EDGE + safeArea.top, window.innerHeight - safeArea.bottom - 260),
  };
};

const getFloatingNavWidth = (open: boolean) => {
  if (typeof window === 'undefined') return open ? TAROT_NAV_OPEN_WIDTH : TAROT_NAV_CLOSED_SIZE;
  return open ? Math.min(TAROT_NAV_OPEN_WIDTH, window.innerWidth - TAROT_NAV_EDGE * 2) : TAROT_NAV_CLOSED_SIZE;
};

const getFloatingNavBounds = (open: boolean) => {
  if (typeof window === 'undefined') {
    return { minX: TAROT_NAV_EDGE, maxX: 360, minY: TAROT_NAV_EDGE, maxY: 720 };
  }
  const openWidth = getFloatingNavWidth(open);
  const safeArea = getSafeAreaInsets();
  return {
    minX: open ? TAROT_NAV_EDGE + safeArea.left + openWidth - TAROT_NAV_CLOSED_SIZE : TAROT_NAV_EDGE + safeArea.left,
    maxX: Math.max(TAROT_NAV_EDGE + safeArea.left, window.innerWidth - safeArea.right - TAROT_NAV_CLOSED_SIZE - TAROT_NAV_EDGE),
    minY: TAROT_NAV_EDGE + safeArea.top,
    maxY: Math.max(TAROT_NAV_EDGE + safeArea.top, window.innerHeight - safeArea.bottom - TAROT_NAV_CLOSED_SIZE - TAROT_NAV_EDGE),
  };
};

const clampFloatingNavPosition = (position: FloatingNavPosition, open: boolean): FloatingNavPosition => {
  const bounds = getFloatingNavBounds(open);
  return {
    x: clampNumber(position.x, bounds.minX, bounds.maxX),
    y: clampNumber(position.y, bounds.minY, bounds.maxY),
  };
};

export default function Layout() {
  const location = useLocation();
  const isTarotHome = location.pathname === '/app';
  const [tarotNavOpen, setTarotNavOpen] = React.useState(false);

  React.useEffect(() => {
    setTarotNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="fixed inset-0 h-[100dvh] overflow-hidden bg-apple-bg text-apple-text font-sans">
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

      {isTarotHome ? (
        <TarotFloatingNav open={tarotNavOpen} onToggle={() => setTarotNavOpen((value) => !value)} />
      ) : (
        <BottomDock />
      )}
    </div>
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

function TarotFloatingNav({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { membership } = useAppContext();
  const [position, setPosition] = React.useState<FloatingNavPosition>(() => {
    if (typeof window === 'undefined') return getDefaultFloatingNavPosition();
    try {
      const saved = localStorage.getItem(TAROT_NAV_POSITION_KEY);
      return saved ? clampFloatingNavPosition(JSON.parse(saved), false) : getDefaultFloatingNavPosition();
    } catch {
      return getDefaultFloatingNavPosition();
    }
  });
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const navWidth = getFloatingNavWidth(open);
  const displayPosition = clampFloatingNavPosition(position, open);
  const safeArea = getSafeAreaInsets();
  const displayLeft = open
    ? clampNumber(
        displayPosition.x - navWidth + TAROT_NAV_CLOSED_SIZE,
        TAROT_NAV_EDGE + safeArea.left,
        window.innerWidth - safeArea.right - navWidth - TAROT_NAV_EDGE,
      )
    : displayPosition.x;

  React.useEffect(() => {
    setPosition((current) => clampFloatingNavPosition(current, open));
  }, [open]);

  React.useEffect(() => {
    const handleResize = () => setPosition((current) => clampFloatingNavPosition(current, open));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open]);

  React.useEffect(() => {
    try {
      localStorage.setItem(TAROT_NAV_POSITION_KEY, JSON.stringify(position));
    } catch {
      // Ignore storage failures; dragging should still work for this session.
    }
  }, [position]);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (open && (event.target as HTMLElement).closest('a,button')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) drag.moved = true;
    setPosition(clampFloatingNavPosition({ x: drag.originX + deltaX, y: drag.originY + deltaY }, open));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!open && drag && !drag.moved) onToggle();
  };

  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        left: displayLeft,
        top: displayPosition.y,
        width: open ? navWidth : TAROT_NAV_CLOSED_SIZE,
      }}
    >
      <AnimatePresence initial={false}>
        {open ? (
          <motion.nav
            key="tarot-nav-dock"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="pointer-events-auto flex h-12 cursor-grab touch-none items-center gap-1 rounded-[24px] border border-[#e2cfb5]/85 bg-[#fff8ec]/90 px-1.5 shadow-[0_18px_52px_rgba(117,82,42,0.16),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-2xl active:cursor-grabbing dark:border-white/10 dark:bg-[#111621]/88 dark:shadow-[0_18px_52px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)]"
            style={{ width: navWidth }}
          >
            {navItems.map((item) => (
              <React.Fragment key={item.to}>
                <FloatingNavItem
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  end={item.end}
                  locked={Boolean(item.feature && !hasFeatureAccess(membership, item.feature))}
                />
              </React.Fragment>
            ))}
            <button
              type="button"
              onClick={onToggle}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dcc7aa]/85 bg-[#f5e7d3]/80 text-[#9a641c] transition-transform active:scale-95 dark:border-white/10 dark:bg-white/[0.06] dark:text-[#f4cf83]"
              aria-label="收起导航"
              title="收起导航"
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
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="pointer-events-auto flex h-12 w-12 cursor-grab touch-none items-center justify-center rounded-[20px] border border-[#d7c1a2]/90 bg-[#fff6e8]/90 text-[#9a641c] opacity-95 shadow-[0_16px_44px_rgba(117,82,42,0.16)] backdrop-blur-2xl transition-transform active:scale-95 active:cursor-grabbing dark:border-white/12 dark:bg-[#111621]/78 dark:text-[#f4cf83] dark:shadow-[0_16px_44px_rgba(0,0,0,0.32)]"
            aria-label="open navigation"
            title="拖动导航，点击展开"
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
          'group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border backdrop-blur-2xl transition-all',
          isActive
            ? 'border-[#b97b28]/35 bg-[#f0d28e] text-[#2c1d0d] shadow-[0_10px_24px_rgba(185,123,40,0.18)] dark:border-[#f4cf83]/40 dark:bg-[#f4cf83] dark:text-[#16130f] dark:shadow-[0_10px_24px_rgba(244,207,131,0.24)]'
            : 'border-[#dfccb2]/85 bg-[#fffaf2]/76 text-[#74695e] shadow-[0_10px_24px_rgba(117,82,42,0.12)] hover:bg-[#f3e5d1] hover:text-[#352719] dark:border-white/10 dark:bg-[#111621]/70 dark:text-white/62 dark:shadow-[0_10px_24px_rgba(0,0,0,0.26)] dark:hover:bg-[#182033] dark:hover:text-white'
        )
      }
      aria-label={label}
      title={label}
    >
      <span className="scale-90">{icon}</span>
      {locked && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-apple-gold text-[#14110e]">
          <LockKeyhole size={9} />
        </span>
      )}
    </NavLink>
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
