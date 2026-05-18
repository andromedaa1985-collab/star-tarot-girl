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
import { getStoredAccountSession } from './lib/accountClient';

function App() {
  return (
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
            <Route path="about" element={<About />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
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
