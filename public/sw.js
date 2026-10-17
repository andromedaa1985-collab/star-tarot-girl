const CACHE_PREFIX = "astro-rail-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}v5-20261017`;
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/railstar-app-icon-no-text.png",
  "/railstar-app-icon.png",
  "/tarot/mecha-v1/back-640.webp",
  "/default-pet.png",
];
const NETWORK_FIRST_PATHS = new Set([
  "/manifest.webmanifest",
  "/railstar-app-icon-no-text.png",
  "/railstar-app-icon.png",
]);

function canCache(response) {
  return response.status === 200 && !response.redirected &&
    !/\b(no-store|private)\b/i.test(response.headers.get("cache-control") || "");
}

function isShellAsset(response, path) {
  const type = response.headers.get("content-type") || "";
  if (path === "/") return /^text\/html(?:;|$)/i.test(type);
  if (path === "/manifest.webmanifest") return /^application\/(?:manifest\+)?json(?:;|$)/i.test(type);
  return /^image\//i.test(type);
}

async function readCache(request) {
  try {
    return await (await caches.open(CACHE_NAME)).match(request);
  } catch {
    // Storage restrictions must not prevent an otherwise working network request.
    return undefined;
  }
}

function saveCache(event, request, response) {
  if (!canCache(response)) return;
  const copy = response.clone();
  event.waitUntil(caches.open(CACHE_NAME)
    .then((cache) => cache.put(request, copy))
    .catch(() => undefined));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all(APP_SHELL.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (canCache(response) && isShellAsset(response, url)) {
          await (await caches.open(CACHE_NAME)).put(url, response);
        }
      } catch {
        // One unavailable optional asset must not prevent installation.
      }
    })).then(() => self.skipWaiting()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(event, cacheKey = event.request, isDocument = false) {
  try {
    const response = await fetch(event.request, { cache: "reload" });
    const path = isDocument ? "/" : new URL(event.request.url).pathname;
    if (isShellAsset(response, path)) {
      saveCache(event, cacheKey, response);
    }
    return response;
  } catch {
    return (await readCache(cacheKey)) || Response.error();
  }
}

async function cacheFirst(event, expectedType) {
  const cached = await readCache(event.request);
  if (cached) return cached;
  try {
    const response = await fetch(event.request);
    if (expectedType.test(response.headers.get("content-type") || "")) {
      saveCache(event, event.request, response);
    }
    return response;
  } catch {
    return Response.error();
  }
}

async function staleWhileRevalidate(event) {
  const cached = await readCache(event.request);
  const network = fetch(event.request).then((response) => {
    if (/^(image\/|font\/|application\/(font-woff|vnd\.ms-fontobject))/.test(response.headers.get("content-type") || "")) {
      saveCache(event, event.request, response);
    }
    return response;
  }).catch(() => cached || Response.error());
  // Keep background revalidation alive and handle rejection even on a cache hit.
  event.waitUntil(network.then(() => undefined));
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Only the public SPA shell is shared; API responses and arbitrary documents
    // never enter the offline cache. Query strings do not create duplicate shells.
    if (/^\/(?:$|app(?:\/|$)|auth(?:\/|$))/.test(url.pathname)) {
      event.respondWith(networkFirst(event, "/", true));
    }
    return;
  }

  if (NETWORK_FIRST_PATHS.has(url.pathname)) {
    event.respondWith(networkFirst(event));
    return;
  }

  // Vite's content hash changes on deployment, so these URLs need no revalidation.
  if (/^\/assets\/.+-[\w-]{8,}\.(?:js|css)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(event, /^(?:text\/(?:javascript|css)|application\/(?:javascript|x-javascript))(?:;|$)/i));
    return;
  }

  // Versioned artwork is immutable. Cache only images the user actually views.
  if (/^\/tarot\/mecha-v1\/.+\.(?:webp|png|jpg)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(event, /^image\//));
    return;
  }

  if (/\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
