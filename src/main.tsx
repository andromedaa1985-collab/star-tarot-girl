import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

function reloadOnceForStaleAssets(reason: string) {
  try {
    const key = `astroRail:${reason}:reloadedAt`;
    const now = Date.now();
    const lastReloadAt = Number(window.sessionStorage.getItem(key) || 0);
    if (now - lastReloadAt < 30_000) return;
    window.sessionStorage.setItem(key, String(now));
  } catch {
    // Reload protection is best-effort; recovering from a stale app shell matters more.
  }
  window.location.reload();
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  reloadOnceForStaleAssets('preload-error');
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let controllerReloading = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || controllerReloading) return;
    controllerReloading = true;
    reloadOnceForStaleAssets('service-worker-update');
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update().catch(() => undefined))
      .catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
  });
}
