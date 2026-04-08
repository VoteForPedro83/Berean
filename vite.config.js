import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
// NOTE: @tailwindcss/vite removed — it caused an infinite HMR reload loop by
// scanning public/db/bible_base.sqlite3. Re-enable in Stage 5 with @source directives.
// import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    // tailwindcss(),

    // ── Service Worker (InjectManifest mode) ──────────────
    // InjectManifest gives us full control — we write our own SW
    // and Workbox only injects the precache manifest (__WB_MANIFEST).
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.js',

      // App shell assets to precache (hashed by Vite build)
      injectManifest: {
        // Limit to files we want in Tier 1 precache
        // Large SQLite chunks are handled by the SW's own cache-on-demand logic
        globPatterns: [
          '**/*.{html,css,js,wasm}',
          'fonts/**/*.{woff,woff2,ttf}',
        ],
        // Exclude large DB files from precache manifest — they're huge
        globIgnores: [
          '**/db/**',
          '**/node_modules/**',
        ],
        // Don't fail the build if a single file is over 2 MB (WASM)
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB
      },

      manifest: {
        name: 'Berean Bible Study',
        short_name: 'Berean',
        description: 'Free Bible study and sermon preparation platform for pastors',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      // Dev: disable SW in development (avoids caching stale dev files)
      devOptions: {
        enabled: false,
      },
    }),
  ],

  // Allow large WASM files (sql.js, pandoc-wasm)
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
  },

  optimizeDeps: {
    // Pre-bundle every npm dep the browser will import.
    include: [
      'mousetrap',
      'split.js',
      'idb',
      'driver.js',
      'tippy.js',
      'marked',
      'dompurify',
      'sql.js-httpvfs',
      'leaflet',
      '@tiptap/core',
      '@tiptap/starter-kit',
      'workbox-window',
      'qr-code-styling',
      'vis-timeline/standalone',
      'cytoscape',
      'cytoscape-fcose',
      'cose-base',
      'layout-base',
    ],
    // Disable runtime dep discovery — prevents infinite re-optimization reload loop.
    // All deps are already listed in `include` above.
    noDiscovery: true,
    // better-sqlite3 is Node.js only — never ship to the browser
    exclude: ['better-sqlite3'],
  },

  // Serve the COOP/COEP headers needed for SharedArrayBuffer (sql.js-httpvfs requirement)
  server: {
    port: 5173,
    strictPort: true,   // Fail immediately instead of hunting for a free port
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },

  // Ensure WASM files are served correctly
  assetsInclude: ['**/*.wasm'],
});
