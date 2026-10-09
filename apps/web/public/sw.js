/*
 * Service worker: the app opens offline and reads stay available on a bad connection.
 *
 * - App shell (pages): network first, the last good copy when offline, else /offline.
 * - Build assets (/_next/static, icons, fonts): cache first (file names are content-hashed).
 * - API GET requests: network first, the last answer when offline. Writes always go to the network.
 *   Cached API answers are dropped on logout (message "clear-user-data") and on a new version.
 */
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const API = `api-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];
const MAX_ENTRIES = { [SHELL]: 40, [ASSETS]: 300, [API]: 150 };

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL, ASSETS, API]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-user-data") {
    event.waitUntil(
      Promise.all([caches.delete(API), caches.delete(SHELL)]).then(() =>
        caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)),
      ),
    );
  }
});

async function trim(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const extra = keys.length - (MAX_ENTRIES[cacheName] ?? 100);
  for (let index = 0; index < extra; index += 1) await cache.delete(keys[index]);
}

async function put(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  await trim(cacheName);
}

/** Only plain successful answers are kept (no redirects, no errors, no opaque responses). */
const cacheable = (response) =>
  response &&
  response.ok &&
  !response.redirected &&
  (response.type === "basic" || response.type === "cors");

async function networkFirst(request, cacheName, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (cacheable(response)) await put(cacheName, request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { cacheName });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { cacheName: ASSETS });
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) await put(ASSETS, request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // API (any origin, the API may live on its own host). Auth and sockets are never cached.
  if (url.pathname.includes("/api/v1/")) {
    if (url.pathname.includes("/api/v1/auth/") || url.pathname.includes("/socket.io")) return;
    event.respondWith(networkFirst(request, API));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, OFFLINE_URL));
    return;
  }
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:woff2?|png|svg|ico)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
  }
});
