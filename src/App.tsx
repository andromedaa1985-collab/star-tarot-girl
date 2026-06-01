import React from 'react';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider } from './store';
import Layout from './components/Layout';
import { FeatureGate } from './components/FeatureGate';
import { AccountAutoSync } from './components/AccountAutoSync';
import Home from './pages/Home';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Collection from './pages/Collection';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import About from './pages/About';
import Privacy from './pages/Privacy';
import Notifications from './pages/Notifications';
import Help from './pages/Help';
import Bazi from './pages/Bazi';
import Simulator from './pages/Simulator';
import Diary from './pages/Diary';
import Guardian from './pages/Guardian';
import Analytics from './pages/Analytics';
import { getStoredAccountSession } from './lib/accountClient';

function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/app" element={<RequireAccount><Layout /></RequireAccount>}>
              <Route index element={<Home />} />
              <Route path="bazi" element={<Bazi />} />
              <Route path="simulator" element={<FeatureGate feature="simulator"><Simulator /></FeatureGate>} />
              <Route path="diary" element={<Diary />} />
              <Route path="guardian" element={<FeatureGate feature="guardian"><Guardian /></FeatureGate>} />
              <Route path="collection" element={<Collection />} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<Settings />} />
              <Route path="settings/privacy" element={<Privacy />} />
              <Route path="settings/notifications" element={<Notifications />} />
              <Route path="settings/help" element={<Help />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="about" element={<About />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
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
            页面启动时遇到了一条异常存档。刷新后会自动跳过坏数据，不会影响你的账号。
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

function RequireAccount({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const session = getStoredAccountSession();

  if (!session) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?next=${encodeURIComponent(next)}`} replace />;
  }

  return (
    <>
      <AccountAutoSync />
      {children}
    </>
  );
}

export default App;
