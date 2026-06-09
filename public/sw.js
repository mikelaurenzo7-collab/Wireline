const CACHE_NAME = "wireline-v1";
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

  // Handle SPA navigation requests: Network-First falling back to Cached Root Shell
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => {
        console.error("[wireline:sw] Serving cached app shell for navigation:", url.pathname);
        return caches.match("/");
      })
    );
    return;
  }

  // Static Assets (CSS, JS, Fonts, Images): Cache-First, fallback to Network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Cache successful responses for our own origin
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
});
