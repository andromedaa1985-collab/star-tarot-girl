const viteEnvironment: { VITE_API_BASE_URL?: string; MODE?: string } = import.meta.env ?? {};
const configuredApiBase = (
  viteEnvironment.VITE_API_BASE_URL ||
  (viteEnvironment.MODE === 'android' ? 'https://star-tarot-girl.vercel.app' : '')
).trim().replace(/\/+$/, '');

export function apiUrl(path: string) {
  if (!configuredApiBase || /^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${configuredApiBase}${normalizedPath}`;
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init);
}
