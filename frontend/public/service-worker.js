// Service Worker for Cafe Management System
// Provides offline capability and aggressive caching for better performance

const CACHE_NAME = 'cafe-app-v7';
const API_CACHE_NAME = 'cafe-api-v7';
const API_CACHEABLE_PREFIXES = [
  '/api/menu',
  '/api/orders',
  '/api/payments',
  '/api/tables',
  '/api/users',
  '/api/inventory',
  '/api/attendance'
];

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/assets/logo.png',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] Caching static assets');
        const results = await Promise.allSettled(
          STATIC_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
        );
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
          console.warn(`[SW] Failed to cache ${failed.length} static asset(s)`);
        }
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
            return undefined;
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const accept = String(request.headers.get('accept') || '').toLowerCase();
  const isSameOrigin = url.origin === self.location.origin;

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  if (request.mode === 'navigate' || accept.includes('text/html')) {
    event.respondWith(networkFirstStrategy(request, CACHE_NAME));
    return;
  }

  // Only manage same-origin requests
  if (!isSameOrigin) {
    return;
  }

  // API requests - stale-while-revalidate (instant cache + background refresh)
  if (url.pathname.startsWith('/api/')) {
    if (accept.includes('text/event-stream') || !shouldCacheApiRequest(url.pathname)) {
      event.respondWith(fetch(request));
      return;
    }

    event.respondWith(
      staleWhileRevalidateStrategy(request, API_CACHE_NAME, event)
    );
    return;
  }

  // Static assets - Cache first, fallback to network
  event.respondWith(
    cacheFirstStrategy(request, CACHE_NAME)
  );
});

async function networkFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await caches.match('/index.html');
    if (fallback) return fallback;
    const root = await caches.match('/');
    if (root) return root;
    return new Response('', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

// Cache-first strategy (for static assets)
async function cacheFirstStrategy(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Guard: never serve HTML for JS/CSS assets.
      // A previously cached index.html for a bundle URL will cause "Unexpected token '<'".
      const url = new URL(request.url);
      const p = url.pathname.toLowerCase();
      if (p.endsWith('.js') || p.endsWith('.css')) {
        const ct = String(cachedResponse.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) {
          // Ignore bad cached response and go to network.
        } else {
          return cachedResponse;
        }
      } else {
        return cachedResponse;
      }
    }

    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-first strategy failed:', error);

    // SPA navigation fallback
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) {
        return fallback;
      }

      const root = await caches.match('/');
      if (root) {
        return root;
      }
    }

    return new Response('Offline', { status: 503 });
  }
}

// Stale-while-revalidate strategy (for API calls)
async function staleWhileRevalidateStrategy(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const networkPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cachedResponse) {
    if (event && typeof event.waitUntil === 'function') {
      event.waitUntil(networkPromise);
    }
    return cachedResponse;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return new Response(
    JSON.stringify({
      status: 'error',
      message: 'Network unavailable and no cached data',
      offline: true
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

function shouldCacheApiRequest(pathname) {
  if (!API_CACHEABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }

  if (pathname.startsWith('/api/orders')) {
    return false;
  }

  if (pathname.startsWith('/api/inventory')) {
    return false;
  }

  // Skip live stream or print-only payload endpoints
  if (
    pathname.startsWith('/api/orders/stream') ||
    pathname.startsWith('/api/orders/unprinted') ||
    pathname.includes('/ticket-payload') ||
    pathname.includes('/receipt-escpos') ||
    pathname.includes('/receipt-images')
  ) {
    return false;
  }

  return true;
}

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});
