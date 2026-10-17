import React from 'react';
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom';
import { Sparkles, User, Compass, Book, Moon, Sun, Settings } from 'lucide-react';
import clsx from 'clsx';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useAppContext } from '../store';
import { CloudSyncNotice } from './CloudSyncNotice';
import { WorkspaceStorageNotice } from './WorkspaceStorageNotice';
import RouteTransition from './ui/RouteTransition';
import { MOTION_DURATION, MOTION_EASE } from '../lib/uiMotion';

const navItems = [
  { to: '/app', label: '今日', icon: <Sparkles size={20} />, end: true },
  { to: '/app/diary', label: '日记', icon: <Book size={20} /> },
  {
    to: '/app/explore',
    label: '探索',
    icon: <Compass size={20} />,
    activePaths: ['/app/deck', '/app/bazi', '/app/simulator', '/app/guardian', '/app/collection'],
  },
  { to: '/app/profile', label: '我的', icon: <User size={20} /> },
];

export default function Layout() {
  const { theme, setTheme } = useAppContext();

  return (
    <div className="rail-app font-sans">
      <motion.aside layoutScroll className="rail-sidebar">
        <NavLink to="/app" className="rail-sidebar-brand">
          <Sparkles size={26} className="text-apple-gold" aria-hidden="true" />
          <span><strong>塔罗少女</strong></span>
        </NavLink>
        <LayoutGroup id="rail-desktop-navigation"><nav aria-label="主导航">
          {navItems.map(item => <React.Fragment key={item.to}><NavItem {...item} /></React.Fragment>)}
        </nav></LayoutGroup>
        <div className="rail-sidebar-footer">
          <NavLink to="/app/settings" className="rail-nav-item"><Settings size={18} aria-hidden="true" />设置与存档</NavLink>
          <button type="button" className="rail-nav-item w-full" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            {theme === 'dark' ? '浅色模式' : '深色模式'}
          </button>
        </div>
      </motion.aside>
      <main className="rail-main" id="app-main"><WorkspaceStorageNotice /><CloudSyncNotice /><RouteTransition><Outlet /></RouteTransition></main>
      <LayoutGroup id="rail-mobile-navigation"><motion.nav layoutRoot className="rail-mobile-nav" aria-label="主导航">
        {navItems.map(item => <React.Fragment key={item.to}><NavItem {...item} /></React.Fragment>)}
      </motion.nav></LayoutGroup>
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  end,
  activePaths = [],
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  activePaths?: readonly string[];
}) {
  const { pathname } = useLocation();
  const reducedMotion = useReducedMotion();
  const isRelatedPage = activePaths.some(path => pathname === path || pathname.startsWith(`${path}/`));
  const isActive = pathname === to || (!end && pathname.startsWith(`${to}/`)) || isRelatedPage;

  return (
    <Link
      to={to}
      data-animated-nav="true"
      aria-current={isActive ? 'page' : undefined}
      className={clsx('rail-nav-item focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apple-accent', isActive && 'active')}
    >
      {isActive && <motion.span
        aria-hidden="true"
        className="rail-nav-indicator"
        layoutId="selected-navigation"
        layoutDependency={pathname}
        initial={false}
        transition={{ duration: reducedMotion ? 0 : MOTION_DURATION.standard, ease: MOTION_EASE }}
      />}
      <span className="rail-nav-icon" aria-hidden="true">{icon}</span>
      <span className="rail-nav-label">{label}</span>
    </Link>
  );
}
