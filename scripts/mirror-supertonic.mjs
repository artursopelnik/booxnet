#!/usr/bin/env node
/**
 * Mirrors all Supertonic 3 assets from Hugging Face into public/supertonic/.
 *
 * The app checks /supertonic/<path> first and only falls back to Hugging
 * Face – a deployment that ships these files works even if the upstream
 * Hugging Face repository ever disappears (Supertone archived the project
 * in July 2026).
 *
 * Usage: node scripts/mirror-supertonic.mjs
 */
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const HF_BASE = 'https://huggingface.co/Supertone/supertonic-3/resolve/main'
const TARGET = new URL('../public/supertonic', import.meta.url).pathname

const ASSETS = [
  'onnx/tts.json',
  'onnx/unicode_indexer.json',
  'onnx/duration_predictor.onnx',
  'onnx/text_encoder.onnx',
  'onnx/vector_estimator.onnx',
  'onnx/vocoder.onnx',
  ...['M1', 'M2', 'M3', 'M4', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5'].map(
    (id) => `voice_styles/${id}.json`,
  ),
]

for (const asset of ASSETS) {
  const target = join(TARGET, asset)
  try {
    await access(target)
    console.log(`✓ ${asset} (bereits vorhanden)`)
    continue
  } catch {
    // Not mirrored yet.
  }
  process.stdout.write(`↓ ${asset} … `)
  const response = await fetch(`${HF_BASE}/${asset}`)
  if (!response.ok) {
    console.error(`FEHLER: HTTP ${response.status}`)
    process.exitCode = 1
    continue
  }
  const data = Buffer.from(await response.arrayBuffer())
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, data)
  console.log(`${(data.length / 1024 / 1024).toFixed(1)} MB`)
}

console.log('\nFertig. Assets liegen in public/supertonic/.')
console.log('Hinweis: Verzeichnis ist absichtlich nicht in Git (~400 MB).')
