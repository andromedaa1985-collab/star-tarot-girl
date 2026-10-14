// Let the API return a structured timeout before the browser gives up, while
// leaving Vercel time to deliver that response instead of terminating the function.
export const VERCEL_API_MAX_DURATION_SECONDS = 60;
export const AI_UPSTREAM_TIMEOUT_MS = 50_000;
export const AI_CLIENT_TIMEOUT_MS = 55_000;
