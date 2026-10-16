const CACHE_NAME = "astro-rail-pwa-v4-20261016";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/railstar-app-icon-no-text.png",
  "/railstar-app-icon.png",
  "/tarot/mecha-v1/back-640.webp",
  "/default-pet.png",
];
const NETWORK_FIRST_PATHS = new Set([
  "/manifest.webmanifest",
  "/sw.js",
  "/railstar-app-icon-no-text.png",
  "/railstar-app-icon.png",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "reload" }).catch(() =>
        caches.match(request).then((cached) => cached || caches.match("/")).then((response) => response || Response.error()),
      ),
    );
    return;
  }

  if (NETWORK_FIRST_PATHS.has(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: "reload" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response.ok) {
            return caches.match(request).then((cached) => cached || response);
          }
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error())),
    );
    return;
  }

  // Versioned artwork is immutable. Cache only images the user actually views.
  if (url.pathname.startsWith("/tarot/mecha-v1/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      })),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
      return cached || network;
    }),
  );
});
