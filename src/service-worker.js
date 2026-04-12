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

// ── Commentary chunk range-request fixer ─────────────────
// Cloudflare Pages returns HTTP 200 (full file) for all Range requests.
// sql.js-httpvfs expects 206 and slices buf starting at offset 0, so any
// range that doesn't start at byte 0 within a chunk gets the wrong data
// → "database disk image is malformed".
//
// Fix: intercept Range requests for commentary chunks, fetch the full chunk
// into Cache Storage once, then return the exact byte slice as 206.
// Other DBs are single-chunk so their first Range is always bytes=0-N ✓

const COMM_CHUNK_CACHE = 'berean-commentary-chunks-v1';

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/db/chunks/commentaries/')) return;

  const rangeHeader = event.request.headers.get('Range');
  if (!rangeHeader) return; // non-range request — let browser handle normally

  event.respondWith(serveCommentaryRange(event.request, rangeHeader));
});

async function serveCommentaryRange(request, rangeHeader) {
  const cache = await caches.open(COMM_CHUNK_CACHE);

  let fullResponse = await cache.match(request.url);
  if (!fullResponse) {
    try {
      const fetched = await fetch(request.url); // fetch full chunk, no Range
      if (fetched.ok) {
        await cache.put(request.url, fetched.clone());
        fullResponse = fetched;
      }
    } catch (_) {}
  }

  if (!fullResponse?.ok) return fetch(request); // fallback

  const match = rangeHeader.match(/^bytes=(\d+)-(\d+)$/);
  if (!match) return fetch(request);

  const start = parseInt(match[1]);
  const end   = parseInt(match[2]);
  const buf   = await fullResponse.arrayBuffer();
  const slice = buf.slice(start, end + 1);

  return new Response(slice, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type':   'application/octet-stream',
      'Content-Range':  `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges':  'bytes',
    },
  });
}

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
