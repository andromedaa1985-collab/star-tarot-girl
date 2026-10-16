import React from 'react';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { AppProvider } from './store';
import Layout from './components/Layout';
import { FeatureGate } from './components/FeatureGate';
import { AccountAutoSync } from './components/AccountAutoSync';
import { AccountSessionChangeGuard } from './components/AccountSessionChangeGuard';
import { getStoredAccountSession } from './lib/accountClient';
import { hasSeenLandingIntro } from './lib/landingIntro';
import { MOTION_DURATION, MOTION_EASE } from './lib/uiMotion';

const Home = lazyPage(() => import('./pages/Home'));
const Landing = lazyPage(() => import('./pages/Landing'));
const Auth = lazyPage(() => import('./pages/Auth'));
const Collection = lazyPage(() => import('./pages/Collection'));
const Profile = lazyPage(() => import('./pages/Profile'));
const Settings = lazyPage(() => import('./pages/Settings'));
const About = lazyPage(() => import('./pages/About'));
const Privacy = lazyPage(() => import('./pages/Privacy'));
const Notifications = lazyPage(() => import('./pages/Notifications'));
const Help = lazyPage(() => import('./pages/Help'));
const Bazi = lazyPage(() => import('./pages/Bazi'));
const Simulator = lazyPage(() => import('./pages/Simulator'));
const Diary = lazyPage(() => import('./pages/Diary'));
const Guardian = lazyPage(() => import('./pages/Guardian'));
const Explore = lazyPage(() => import('./pages/Explore'));
const Deck = lazyPage(() => import('./pages/Deck'));
const Analytics = lazyPage(() => import('./pages/Analytics'));

function lazyPage(loadPage: () => Promise<{ default: React.ComponentType }>) {
  const Page = React.lazy(loadPage);

  return function DeferredPage() {
    return (
      <React.Suspense fallback={<PageLoading />}>
        <Page />
      </React.Suspense>
    );
  };
}

function PageLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="rail-page-loading flex h-full min-h-[50vh] items-center justify-center px-6 text-apple-text-muted"
    >
      <p className="text-sm leading-6">正在准备星轨页面…</p>
    </div>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <AccountSessionChangeGuard>
      <AppProvider>
        <MotionConfig reducedMotion="user" transition={{ duration: MOTION_DURATION.standard, ease: MOTION_EASE }}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/app/auth" element={<RedirectLegacyAppAuth />} />
              <Route path="/app" element={<AppShell />}>
                <Route index element={<Home />} />
                <Route path="explore" element={<Explore />} />
                <Route path="deck" element={<Deck />} />
                <Route path="bazi" element={<Bazi />} />
                <Route path="simulator" element={<Simulator />} />
                <Route path="diary" element={<Diary />} />
                <Route path="guardian" element={<FeatureGate feature="guardian"><Guardian /></FeatureGate>} />
                <Route path="collection" element={<Collection />} />
                <Route path="profile" element={<Profile />} />
                <Route path="settings" element={<Settings />} />
                <Route path="settings/privacy" element={<Privacy />} />
                <Route path="settings/notifications" element={<Notifications />} />
                <Route path="settings/help" element={<Help />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="admin" element={<Analytics />} />
                <Route path="about" element={<About />} />
                <Route path="*" element={<Navigate to="/app" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </MotionConfig>
      </AppProvider>
      </AccountSessionChangeGuard>
    </AppErrorBoundary>
  );
}

type AppErrorBoundaryProps = { children: React.ReactNode };

class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, { hasError: boolean }> {
  declare props: AppErrorBoundaryProps;
  declare state: { hasError: boolean };

  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07080d] px-6 text-[#fff9ed]">
        <div className="w-full max-w-sm rounded-[30px] border border-white/12 bg-[#111520]/86 p-6 text-center shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
          <div className="text-xl font-black">星轨刚刚走神了</div>
          <p className="mt-3 text-sm leading-6 text-[#cfc6b5]">
            页面暂时没有顺利打开。请检查网络后重新进入；刷新不会清空已经保存的记录。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 w-full rounded-full bg-[#f4cf83] px-5 py-3 text-sm font-black text-[#0b0910]"
          >
            重新进入
          </button>
        </div>
      </main>
    );
  }
}

function RedirectLegacyAppAuth() {
  const location = useLocation();
  return <Navigate to={`/auth${location.search || '?next=/app'}`} replace />;
}

function AppShell() {
  const location = useLocation();
  const session = getStoredAccountSession();

  if (location.pathname === '/app' && !hasSeenLandingIntro()) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      {session?.token ? <AccountAutoSync /> : null}
      <Layout />
    </>
  );
}

export default App;
