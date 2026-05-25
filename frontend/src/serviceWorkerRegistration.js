// Service Worker Registration
// This file registers the service worker for offline capability

export function register() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.log('[SW] Service Worker registered:', registration);
          
          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 10 * 60 * 1000); // Check every 10 minutes

          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker == null) {
              return;
            }

            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('[SW] New content available, please refresh.');
                } else {
                  console.log('[SW] Content cached for offline use.');
                }
              }
            };
          };
        })
        .catch((error) => {
          console.error('[SW] Service Worker registration failed:', error);
        });
    });
  }
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .catch((error) => {
        console.error('[SW] Service Worker unregistration failed:', error);
      })
      .finally(() => {
        if ('caches' in window) {
          caches.keys()
            .then((cacheNames) => Promise.all(cacheNames.map((name) => caches.delete(name))))
            .catch(() => undefined);
        }
      });
  }
}
