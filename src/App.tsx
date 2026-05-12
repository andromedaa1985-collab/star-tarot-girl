import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './store';
import Layout from './components/Layout';
import Home from './pages/Home';
import Landing from './pages/Landing';
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

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="bazi" element={<Bazi />} />
            <Route path="simulator" element={<Simulator />} />
            <Route path="diary" element={<Diary />} />
            <Route path="guardian" element={<Guardian />} />
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

export default App;
