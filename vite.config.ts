import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Die onnxruntime-Version steckt im Pfad der WASM-Laufzeitdateien
// (/ort/<version>/...) und im CDN-Fallback: So sind die Dateien sicher
// unveraenderlich (immutable cachebar, siehe public/_headers), und ein
// Versions-Upgrade kann nie auf veraltete Cache-Eintraege treffen.
// (Direkt aus der Datei gelesen – die exports-Map des Pakets gibt
// package.json nicht frei.)
const ortVersion = (
  JSON.parse(
    readFileSync(
      new URL('./node_modules/onnxruntime-web/package.json', import.meta.url),
      'utf8',
    ),
  ) as { version: string }
).version

export default defineConfig({
  define: {
    __ORT_VERSION__: JSON.stringify(ortVersion),
  },
  // GitHub Pages serves the app under /<repo>/ – the workflow sets BASE_PATH.
  base: process.env.BASE_PATH || '/',
  // The TTS worker code-splits (dynamic onnxruntime import), which
  // requires ES module workers.
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        // Framework getrennt vom App-Code: App-Updates invalidieren dann
        // nur den kleinen App-Chunk, der grosse Framework-Chunk behaelt
        // seinen Hash und bleibt im Browser-/Service-Worker-Cache.
        // Bewusst EIN gemeinsamer Chunk: React und Ionic getrennt zu
        // buendeln erzeugt zirkulaere Chunk-Importe und laesst die App
        // beim Start mit einem TDZ-Fehler sterben (weisse Seite).
        manualChunks: {
          framework: [
            'react',
            'react-dom',
            'react-router',
            'react-router-dom',
            '@ionic/react',
            '@ionic/react-router',
            'ionicons',
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': updates activate over the "Update installieren" button in
      // the app instead of silently on the next visit.
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}'],
        // Die onnxruntime-Laufzeit (bis ~25 MB pro Datei) gehört nicht in
        // den Precache jedes Besuchers – die runtimeCaching-Route unten
        // cacht sie beim ersten Gebrauch bzw. beim Sprachpaket-Download.
        globIgnores: ['ort/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // onnxruntime-web loads its WASM binaries at runtime – same-origin
        // from /ort/ (scripts/copy-ort-wasm.mjs), mit jsDelivr nur als
        // Rueckfall. Beide cachen, damit die Synthese offline laeuft; die
        // Sprachmodelle selbst liegen in OPFS. Der Rueckfall-Host MUSS zu
        // ORT_CDN in src/lib/supertonic/ortwasm.ts passen – stimmen sie
        // nicht ueberein, wird die Rueckfall-Datei nie gecacht und die
        // Wiedergabe scheitert offline, sobald die lokale Kopie fehlt.
        runtimeCaching: [
          {
            urlPattern: /\/ort\/.+\.(wasm|mjs)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tts-wasm',
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tts-wasm',
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Booxnet – dein Buch, vorgelesen',
        short_name: 'Booxnet',
        description:
          'Buch hochladen, Stimme auswählen und offline vorlesen lassen.',
        lang: 'de',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0B63D6',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
