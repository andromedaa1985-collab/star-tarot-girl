import React from 'react';
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom';
import { Sparkles, User, Compass, Book, Moon, Sun, Settings } from 'lucide-react';
import clsx from 'clsx';
import { useAppContext } from '../store';
import { WorkspaceStorageNotice } from './WorkspaceStorageNotice';

const navItems = [
  { to: '/app', label: '今日', icon: <Sparkles size={20} />, end: true },
  { to: '/app/diary', label: '日记', icon: <Book size={20} /> },
  {
    to: '/app/explore',
    label: '探索',
    icon: <Compass size={20} />,
    activePaths: ['/app/bazi', '/app/simulator', '/app/guardian', '/app/collection'],
  },
  { to: '/app/profile', label: '我的', icon: <User size={20} /> },
];

export default function Layout() {
  const { theme, setTheme } = useAppContext();

  return (
    <div className="rail-app font-sans">
      <aside className="rail-sidebar">
        <NavLink to="/app" className="rail-sidebar-brand">
          <Sparkles size={26} className="text-apple-gold" aria-hidden="true" />
          <span><strong>星轨</strong></span>
        </NavLink>
        <nav aria-label="主导航">
          {navItems.map(item => <React.Fragment key={item.to}><NavItem {...item} /></React.Fragment>)}
        </nav>
        <div className="rail-sidebar-footer">
          <NavLink to="/app/settings" className="rail-nav-item"><Settings size={18} aria-hidden="true" />设置与存档</NavLink>
          <button type="button" className="rail-nav-item w-full" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            {theme === 'dark' ? '浅色模式' : '深色模式'}
          </button>
        </div>
      </aside>
      <main className="rail-main" id="app-main"><WorkspaceStorageNotice /><Outlet /></main>
      <nav className="rail-mobile-nav" aria-label="主导航">
        {navItems.map(item => <React.Fragment key={item.to}><NavItem {...item} /></React.Fragment>)}
      </nav>
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
  const isRelatedPage = activePaths.some(path => pathname === path || pathname.startsWith(`${path}/`));
  const isActive = pathname === to || (!end && pathname.startsWith(`${to}/`)) || isRelatedPage;

  return (
    <Link
      to={to}
      aria-current={isActive ? 'page' : undefined}
      className={clsx('rail-nav-item focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apple-accent', isActive && 'active')}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
