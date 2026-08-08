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
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const SOURCE = new URL('../node_modules/onnxruntime-web/dist', import.meta.url)
  .pathname
const TARGET = new URL('../public/ort', import.meta.url).pathname

// Nur die reine WASM-Variante – die App nutzt bewusst kein WebGPU
// (Speicherabstürze auf iPhones), daher entfallen die jsep-Dateien.
const FILES = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
]

// Reste älterer onnxruntime-Versionen nicht mit ausliefern.
await rm(TARGET, { recursive: true, force: true })
await mkdir(TARGET, { recursive: true })
for (const file of FILES) {
  await copyFile(join(SOURCE, file), join(TARGET, file))
  console.log(`✓ ort/${file}`)
}
