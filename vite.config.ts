import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages serves the app under /<repo>/ – the workflow sets BASE_PATH.
  base: process.env.BASE_PATH || '/',
  // The TTS worker code-splits (dynamic onnxruntime import), which
  // requires ES module workers.
  worker: { format: 'es' },
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
        // from /ort/ (scripts/copy-ort-wasm.mjs), with cdnjs only as
        // fallback. Cache both so synthesis works offline; the voice
        // models themselves are stored in OPFS.
        runtimeCaching: [
          {
            urlPattern: /\/ort\/[^/]+\.(wasm|mjs)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tts-wasm',
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/,
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
