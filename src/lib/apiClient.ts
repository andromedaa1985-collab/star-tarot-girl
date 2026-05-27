const configuredApiBase = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.MODE === 'android' ? 'https://zjhrail.xyz' : '')
).trim().replace(/\/+$/, '');

export function apiUrl(path: string) {
  if (!configuredApiBase || /^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${configuredApiBase}${normalizedPath}`;
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init);
}
