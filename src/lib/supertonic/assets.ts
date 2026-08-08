/**
 * Asset management for Supertonic 3.
 *
 * The heavy part is the shared *engine* (four ONNX networks + configs,
 * ~400 MB) – it is downloaded once. The individual voices are tiny style
 * files (a few hundred KB) and are fetched on demand per voice.
 *
 * Every fetch tries the self-hosted mirror under /supertonic/ first (see
 * scripts/mirror-supertonic.mjs) and only falls back to Hugging Face, so a
 * mirrored deployment keeps working even if the upstream repository
 * disappears. Everything is stored in OPFS for offline use.
 */
import type { StudioVoiceId } from '../voices'
import {
  hasAsset,
  isStorageAvailable,
  readAsset,
  removeAllAssets,
  writeAsset,
} from './opfs'

export const STUDIO_ENGINE_SIZE_MB = 400

export type StudioDownloadFailure = 'storage' | 'quota' | 'network'

/** Download error with a coarse cause so the UI can give accurate advice. */
export class StudioDownloadError extends Error {
  constructor(
    readonly reason: StudioDownloadFailure,
    message: string,
  ) {
    super(message)
    this.name = 'StudioDownloadError'
  }
}

function classifyWriteError(error: unknown, path: string): StudioDownloadError {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new StudioDownloadError('quota', `Quota exceeded storing ${path}`)
  }
  return new StudioDownloadError(
    'storage',
    `Storage rejected ${path}: ${error instanceof Error ? error.message : String(error)}`,
  )
}

const HF_BASE = 'https://huggingface.co/Supertone/supertonic-3/resolve/main'

const ENGINE_ASSETS = [
  'onnx/tts.json',
  'onnx/unicode_indexer.json',
  'onnx/duration_predictor.onnx',
  'onnx/text_encoder.onnx',
  'onnx/vector_estimator.onnx',
  'onnx/vocoder.onnx',
]

function styleAsset(voiceId: StudioVoiceId): string {
  return `voice_styles/${voiceId}.json`
}

function mirrorUrl(path: string): string {
  return `${import.meta.env.BASE_URL}supertonic/${path}`
}

/** Fetches an asset, preferring the self-hosted mirror over Hugging Face. */
async function fetchAsset(path: string): Promise<Response> {
  try {
    const local = await fetch(mirrorUrl(path))
    const type = local.headers.get('Content-Type') ?? ''
    // A missing mirror file on SPA hosts returns index.html – reject that.
    if (local.ok && !type.includes('text/html')) return local
  } catch {
    // Mirror unreachable – fall through.
  }
  const remote = await fetch(`${HF_BASE}/${path}`)
  if (!remote.ok) {
    throw new Error(`Download failed for ${path}: HTTP ${remote.status}`)
  }
  return remote
}

export async function isStudioEngineInstalled(): Promise<boolean> {
  try {
    const checks = await Promise.all(
      ENGINE_ASSETS.map((path) => hasAsset(path)),
    )
    return checks.every(Boolean)
  } catch {
    return false
  }
}

export async function removeStudioData(): Promise<void> {
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
 * Makes sure a voice's style file is in OPFS, fetching it if needed.
 * Style files are only a few hundred KB, so this is near-instant online.
 */
export async function ensureStudioStyle(
  voiceId: StudioVoiceId,
): Promise<ArrayBuffer> {
  const path = styleAsset(voiceId)
  const cached = await readAsset(path)
  if (cached) return cached
  const response = await fetchAsset(path)
  const data = await response.arrayBuffer()
  await writeAsset(path, data)
  return data
}

/**
 * Downloads the shared engine sequentially with overall progress. Progress
 * is weighted by bytes; sizes come from Content-Length with the known total
 * as fallback. Already-stored files are skipped, so an interrupted download
 * resumes where it stopped.
 *
 * Fails fast with a typed StudioDownloadError before fetching anything when
 * the browser refuses OPFS (private windows) or the quota clearly cannot
 * hold a fresh download – no point streaming 400 MB that can't be stored.
 */
export async function downloadStudioEngine(
  onProgress: (percent: number) => void,
): Promise<void> {
  const totalEstimate = STUDIO_ENGINE_SIZE_MB * 1024 * 1024

  if (!(await isStorageAvailable())) {
    throw new StudioDownloadError('storage', 'OPFS unavailable')
  }
  const stored = await Promise.all(ENGINE_ASSETS.map((path) => hasAsset(path)))
  if (stored.every(Boolean)) {
    onProgress(100)
    return
  }
  if (!stored.some(Boolean)) {
    const estimate = await navigator.storage.estimate?.().catch(() => undefined)
    if (estimate?.quota != null) {
      const free = estimate.quota - (estimate.usage ?? 0)
      if (free < totalEstimate) {
        throw new StudioDownloadError(
          'quota',
          `Insufficient quota: ${free} bytes free`,
        )
      }
    }
  }

  let loadedBefore = 0
  for (const [index, path] of ENGINE_ASSETS.entries()) {
    if (stored[index]) {
      continue
    }
    let response: Response
    let contentLength: number
    const chunks: Uint8Array[] = []
    let loaded = 0
    try {
      response = await fetchAsset(path)
      if (!response.body) {
        throw new Error(`Download failed for ${path}: empty body`)
      }
      contentLength = Number(response.headers.get('Content-Length')) || 0
      const reader = response.body.getReader()
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
        const fallback = (index + fileShare) / ENGINE_ASSETS.length
        onProgress(
          Math.min(99, Math.round((contentLength ? overall : fallback) * 100)),
        )
      }
    } catch (error) {
      throw new StudioDownloadError(
        'network',
        error instanceof Error ? error.message : String(error),
      )
    }
    const data = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) {
      data.set(chunk, offset)
      offset += chunk.byteLength
    }
    try {
      await writeAsset(path, data)
    } catch (error) {
      throw classifyWriteError(error, path)
    }
    loadedBefore += loaded
  }
  onProgress(100)
}
