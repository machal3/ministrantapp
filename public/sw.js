const CACHE = 'liturgy-offline-v1';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html','/icon-192.png'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('liturgy-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate' && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  }
});
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* Always show a visible notification. */ }
  event.waitUntil(self.registration.showNotification(data.title || 'Służba liturgiczna', {
    body: data.body || 'Sprawdź aktualny grafik.', icon: '/icon-192.png', badge: '/icon-192.png',
    tag: data.tag || 'liturgy', data: { url: data.url || '/' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  if (target.origin !== self.location.origin) target.href = self.location.origin + '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    for (const client of clients) if (new URL(client.url).origin === self.location.origin) {
      await client.navigate(target.href); return client.focus();
    }
    return self.clients.openWindow(target.href);
  }));
});
