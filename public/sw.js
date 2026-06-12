// Bumping CACHE_NAME is the kill switch for stale clients: the activate
// handler deletes every cache that doesn't match, and changing this string
// changes sw.js's bytes, which is what makes browsers re-install the worker.
// v1 pre-cached "/" once at install and never refreshed it — clients that ever
// hit the offline fallback were pinned to that first-visit shell (old hashed
// chunks then served cache-first), i.e. a permanently outdated app. v2 purges
// those caches and keeps the fallback shell fresh on every successful visit.
const CACHE_NAME = "wireline-v2";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/wireline-icon-512.png",
  "/wireline-icon-1024.png",
  "/site.webmanifest",
  "/humans.txt",
];

// Install Service Worker and cache essential shell resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.error("[wireline:sw] Pre-caching app shell");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Service Worker and clean up legacy caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.error("[wireline:sw] Deleting obsolete cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercept fetch requests to enable offline support and performance caching
self.addEventListener("fetch", (event) => {
  // Only cache local GET requests
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(event.request.url);

  // Bypass service worker caching for real-time backend API paths, Vercel edge functions, and Stripe checkouts
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/_next") || url.pathname.includes("stripe.com")) {
    return;
  }

  // SPA navigations: Network-First. On success, refresh the cached shell so
  // the offline fallback is always the latest shell the client has seen —
  // never a first-install snapshot pointing at long-gone hashed chunks.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put("/", responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          console.error("[wireline:sw] Serving cached app shell for navigation:", url.pathname);
          return caches.match("/");
        })
    );
    return;
  }

  // Immutable build artifacts (content-hashed under /assets/): Cache-First.
  // A hash change is a URL change, so a hit here can never be stale.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else (favicons, manifest, fonts at stable URLs): Network-First
  // with cache fallback, refreshing the cached copy on success. These URLs
  // aren't content-hashed, so Cache-First would pin them forever.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
