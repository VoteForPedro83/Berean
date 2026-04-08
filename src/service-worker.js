/* ============================================================
   service-worker.js — Berean offline Service Worker
   Uses Workbox InjectManifest mode (NOT GenerateSW).

   Caching tiers:
   1. App shell (HTML/CSS/JS/fonts/WASM) — precached at install
   2. Small DBs (translations_cc, lexicon) — precached at install
   3. Large chunked DBs (bible_base, morphgnt…) — cache-on-demand
      with range-request slice support for sql.js-httpvfs

   IMPORTANT: Range requests (HTTP 206) cannot be stored in
   Cache Storage. We fetch the full chunk (200 OK), store it,
   then use workbox-range-requests to serve the slice.
   ============================================================ */

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { RangeRequestsPlugin } from 'workbox-range-requests';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// ── Skip waiting and claim clients immediately ────────────
self.skipWaiting();
clientsClaim();

// ── Tier 1: App shell precache ────────────────────────────
// __WB_MANIFEST is replaced by Workbox InjectManifest at build time
// with the list of hashed app shell assets.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// ── Tier 2: Small DB files (≤2 MB) — cache-first ─────────
// These are pre-bundled and change rarely.
const SMALL_DB_CACHE = 'berean-small-dbs-v1';

registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/db/') &&
    (url.pathname.includes('translations_cc') ||
     url.pathname.includes('lexicon')),
  new CacheFirst({
    cacheName: SMALL_DB_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 }), // 30 days
    ],
  })
);

// ── Tier 3: Large chunked SQLite files ────────────────────
// sql.js-httpvfs sends Range requests for 8 MB chunks.
// Cache API cannot store 206 responses — we must:
//   1. Intercept any request to a .chunk file
//   2. Strip the Range header and fetch as GET → 200 OK
//   3. Store the full 200 in cache
//   4. Use RangeRequestsPlugin to serve the slice back as 206
const CHUNK_CACHE = 'berean-chunks-v1';

registerRoute(
  ({ url }) => url.pathname.startsWith('/db/') && url.pathname.endsWith('.chunk'),
  new CacheFirst({
    cacheName: CHUNK_CACHE,
    plugins: [
      // Must come BEFORE CacheableResponsePlugin so we see the full response
      new RangeRequestsPlugin(),
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 40,                           // keep at most 40 chunks in cache
        maxAgeSeconds: 7 * 24 * 60 * 60,         // 7 days
        purgeOnQuotaError: true,
      }),
    ],
    fetchOptions: {
      // Strip Range header when going to network — fetch the full chunk
      headers: {},
    },
  })
);

// ── Tier 3b: Non-chunked SQLite files ─────────────────────
// bible_base.sqlite3, morphgnt.sqlite3 etc. if not chunked.
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/db/') &&
    url.pathname.endsWith('.sqlite3') &&
    !url.pathname.includes('translations_cc') &&
    !url.pathname.includes('lexicon'),
  new CacheFirst({
    cacheName: CHUNK_CACHE,
    plugins: [
      new RangeRequestsPlugin(),
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 7 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ── Fonts (self-hosted — never change) ───────────────────
registerRoute(
  ({ url }) => url.pathname.startsWith('/fonts/'),
  new CacheFirst({
    cacheName: 'berean-fonts-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxAgeSeconds: 365 * 24 * 60 * 60 }), // 1 year
    ],
  })
);

// ── Cloudflare Worker API calls — network-only ────────────
// BYOK keys and AI responses must never be cached.
registerRoute(
  ({ url }) => url.hostname.includes('workers.dev') || url.pathname.startsWith('/api/'),
  async ({ request }) => fetch(request)
);

// ── Persistent storage request ────────────────────────────
// Prevents iOS Safari from evicting caches after 7 days of inactivity.
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
