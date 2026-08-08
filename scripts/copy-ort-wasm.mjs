#!/usr/bin/env node
/**
 * Kopiert die onnxruntime-web WASM-Binärdateien nach public/ort/.
 *
 * Der TTS-Worker lädt sie von dort same-origin: immer passend zur
 * gebündelten JS-Version, vom Service Worker cachebar und damit komplett
 * offline-fähig. Ohne diesen Schritt fällt der Worker auf das cdnjs-CDN
 * zurück – das bricht das Offline-Versprechen und kann von Content-
 * Blockern oder restriktiven Netzen blockiert werden.
 *
 * Läuft automatisch vor `npm run dev` und `npm run build`.
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const SOURCE = new URL('../node_modules/onnxruntime-web/dist', import.meta.url)
  .pathname
const TARGET = new URL('../public/ort', import.meta.url).pathname

const FILES = [
  'ort-wasm.wasm',
  'ort-wasm-simd.wasm',
  'ort-wasm-threaded.wasm',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.wasm',
]

await mkdir(TARGET, { recursive: true })
for (const file of FILES) {
  await copyFile(join(SOURCE, file), join(TARGET, file))
  console.log(`✓ ort/${file}`)
}
