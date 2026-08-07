/**
 * Download manager for the Supertonic 3 model pack.
 *
 * All assets are fetched once from Hugging Face and stored in OPFS, so
 * synthesis works fully offline afterwards. Total size is roughly 400 MB.
 */
import { STUDIO_VOICES } from '../voices'
import { hasAsset, readAsset, removeAllAssets, writeAsset } from './opfs'

export const STUDIO_PACK_SIZE_MB = 404

const HF_BASE = 'https://huggingface.co/Supertone/supertonic-3/resolve/main'

const MODEL_ASSETS = [
  'onnx/tts.json',
  'onnx/unicode_indexer.json',
  'onnx/duration_predictor.onnx',
  'onnx/text_encoder.onnx',
  'onnx/vector_estimator.onnx',
  'onnx/vocoder.onnx',
]

const STYLE_ASSETS = STUDIO_VOICES.map(
  (voice) => `voice_styles/${voice.id}.json`,
)

export const ALL_ASSETS = [...MODEL_ASSETS, ...STYLE_ASSETS]

export async function isStudioInstalled(): Promise<boolean> {
  try {
    const checks = await Promise.all(ALL_ASSETS.map((path) => hasAsset(path)))
    return checks.every(Boolean)
  } catch {
    return false
  }
}

export async function removeStudioPack(): Promise<void> {
  await removeAllAssets()
}

export async function loadStudioAsset(path: string): Promise<ArrayBuffer> {
  const data = await readAsset(path)
  if (!data) {
    throw new Error(`Supertonic asset missing: ${path}`)
  }
  return data
}

/**
 * Downloads all pack assets sequentially with overall progress. Progress is
 * weighted by bytes; sizes come from Content-Length with the known total as
 * fallback.
 */
export async function downloadStudioPack(
  onProgress: (percent: number) => void,
): Promise<void> {
  const totalEstimate = STUDIO_PACK_SIZE_MB * 1024 * 1024
  let loadedBefore = 0

  for (const [index, path] of ALL_ASSETS.entries()) {
    if (await hasAsset(path)) {
      // Resume: skip files from an earlier, interrupted download.
      continue
    }
    const response = await fetch(`${HF_BASE}/${path}`)
    if (!response.ok || !response.body) {
      throw new Error(`Download failed for ${path}: HTTP ${response.status}`)
    }
    const contentLength = Number(response.headers.get('Content-Length')) || 0
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      const fileShare = contentLength
        ? Math.min(loaded / contentLength, 1)
        : 0
      const overall =
        (loadedBefore + fileShare * (contentLength || 0)) / totalEstimate
      const fallback = (index + fileShare) / ALL_ASSETS.length
      onProgress(
        Math.min(99, Math.round((contentLength ? overall : fallback) * 100)),
      )
    }
    const data = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) {
      data.set(chunk, offset)
      offset += chunk.byteLength
    }
    await writeAsset(path, data)
    loadedBefore += loaded
  }
  onProgress(100)
}
