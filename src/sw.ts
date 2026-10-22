/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { refresh } from './lib/watch';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

self.skipWaiting();
// Installs that ran an older version still hold Google Fonts responses in the 'fonts' cache.
self.addEventListener('activate', (e) => e.waitUntil(Promise.all([self.clients.claim(), caches.delete('fonts')])));

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Product photos come from the stores' CDNs; keep a bounded offline cache.
registerRoute(
  ({ request, url }) => request.destination === 'image' && url.origin !== self.location.origin,
  new CacheFirst({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 14 * 24 * 3600, purgeOnQuotaError: true })],
  }),
);

const dataUrl = () => new URL('data/offers.json', self.registration.scope).href;

async function backgroundCheck() {
  const allowed = (self as unknown as { Notification?: { permission: string } }).Notification?.permission === 'granted';
  await refresh(dataUrl(), allowed ? (title, opts) => self.registration.showNotification(title, opts) : null);
}

// Chrome (Android/desktop) fires this for installed apps, at a frequency it chooses.
self.addEventListener('periodicsync', ((e: Event & { tag: string; waitUntil(p: Promise<unknown>): void }) => {
  if (e.tag === 'refresh-offers') e.waitUntil(backgroundCheck());
}) as EventListener);

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url ?? '', self.registration.scope).href;
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins.find((w) => w.url.startsWith(self.registration.scope));
      if (win) {
        await win.focus();
        return win.navigate(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});
