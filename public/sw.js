const CACHE = 'liturgy-offline-v2';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html','/icon-192.png'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Retire subscriptions left by older versions of the app.
    try {
      const subscription = await self.registration.pushManager?.getSubscription();
      await subscription?.unsubscribe();
    } catch { /* Server-side cleanup disables deliveries independently. */ }
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('liturgy-offline-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate' && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  }
});
