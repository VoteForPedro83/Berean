/* ============================================================
   service-worker.js — Berean offline Service Worker
   Uses Workbox InjectManifest mode (NOT GenerateSW).

   Database files are NOT handled by the SW. They use:
   - Chunk files (/db/chunks/**): cache-control: max-age=31536000, immutable
     → browser HTTP cache handles range requests natively and perfectly
   - bible_base.sqlite3: handled by bible.js with its own chunked config

   The SW only handles the app shell (HTML/CSS/JS/fonts/WASM)
   and font files. This is the correct, minimal scope.
   ============================================================ */

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// ── Skip waiting and claim clients immediately ────────────
self.skipWaiting();
clientsClaim();

// ── App shell precache ────────────────────────────────────
// __WB_MANIFEST is replaced by Workbox InjectManifest at build time.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// ── Fonts (self-hosted — never change) ───────────────────
registerRoute(
  ({ url }) => url.pathname.startsWith('/fonts/'),
  new CacheFirst({
    cacheName: 'berean-fonts-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  })
);

// ── Cloudflare Worker API calls — network-only ────────────
registerRoute(
  ({ url }) => url.hostname.includes('workers.dev') || url.pathname.startsWith('/api/'),
  async ({ request }) => fetch(request)
);

// ── Persistent storage request ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      if (navigator.storage?.persist) {
        const persisted = await navigator.storage.persist();
        console.log('[SW] Storage persistence:', persisted ? 'granted' : 'denied');
      }
    })()
  );
});
