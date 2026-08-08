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
import { STUDIO_VOICES, type StudioVoiceId } from '../voices'
import { warmOrtWasmCache } from './ortwasm'
import {
  assetSize,
  isStorageAvailable,
  readAsset,
  removeAllAssets,
  removeAsset,
  writeAsset,
  writeAssetStream,
} from './opfs'

export const STUDIO_ENGINE_SIZE_MB = 400

export type StudioDownloadFailure = 'storage' | 'quota' | 'network'

/** Nutzerfreundliche Erklärungen je Download-Fehlerursache. */
export const DOWNLOAD_ERRORS: Record<StudioDownloadFailure, string> = {
  storage:
    'Dein Browser erlaubt hier keinen Speicher für das Sprachmodell, das passiert vor allem in privaten Fenstern. Öffne Booxnet in einem normalen Fenster und lade es dort herunter.',
  quota:
    `Auf deinem Gerät ist zu wenig Speicherplatz für das Sprachmodell frei (ca. ${STUDIO_ENGINE_SIZE_MB} MB). Schaffe etwas Platz und versuche es dann erneut. Bereits geladene Teile bleiben erhalten.`,
  network:
    'Die Sprachdaten sind gerade nicht erreichbar. Prüfe deine Internetverbindung und versuche es in ein paar Minuten noch einmal. Bereits geladene Teile bleiben erhalten.',
}

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
async function fetchAsset(
  path: string,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    const local = await fetch(mirrorUrl(path), { signal })
    const type = local.headers.get('Content-Type') ?? ''
    // A missing mirror file on SPA hosts returns index.html – reject that.
    if (local.ok && !type.includes('text/html')) return local
  } catch (error) {
    if (signal?.aborted) throw error
    // Mirror unreachable – fall through.
  }
  const remote = await fetch(`${HF_BASE}/${path}`, { signal })
  if (!remote.ok) {
    throw new Error(`Download failed for ${path}: HTTP ${remote.status}`)
  }
  return remote
}

export async function isStudioEngineInstalled(): Promise<boolean> {
  try {
    const checks = await Promise.all(
      ENGINE_ASSETS.map(async (path) => (await assetSize(path)) > 0),
    )
    return checks.every(Boolean)
  } catch {
    return false
  }
}

/**
 * Experimentelle int8-Variante des Rechenmodells (vector_estimator):
 * Community-Quantisierung aus Reza2kn/supertonic-3-litert, per
 * onnxruntime-Dynamikquantisierung direkt aus dem Original erzeugt –
 * 65 statt 257 MB und auf CPUs potenziell schneller. Wird zusätzlich
 * zur fp32-Fassung gespeichert, damit das Zurückschalten sofort geht;
 * "Sprachmodell löschen" entfernt beide zusammen.
 */
export const INT8_VECTOR_ESTIMATOR_PATH = 'onnx/vector_estimator_int8.onnx'
export const INT8_VECTOR_ESTIMATOR_SIZE_MB = 65

const INT8_HF_BASE =
  'https://huggingface.co/Reza2kn/supertonic-3-litert/resolve/main'

/** Mögliche Ablageorte im Community-Repo – der erste Treffer gewinnt. */
const INT8_REMOTE_CANDIDATES = [
  'onnx/vector_estimator_int8.onnx',
  'vector_estimator_int8.onnx',
]

/** Gibt die ~65 MB des Experiments frei, ohne das Sprachmodell zu löschen. */
export async function removeInt8VectorEstimator(): Promise<void> {
  await removeAsset(INT8_VECTOR_ESTIMATOR_PATH)
}

export async function isInt8VariantInstalled(): Promise<boolean> {
  try {
    return (await assetSize(INT8_VECTOR_ESTIMATOR_PATH)) > 0
  } catch {
    return false
  }
}

export async function downloadInt8VectorEstimator(
  onProgress: (percent: number, loadedMB: number) => void,
): Promise<void> {
  if (!(await isStorageAvailable())) {
    throw new StudioDownloadError('storage', 'OPFS unavailable')
  }
  if (await isInt8VariantInstalled()) {
    onProgress(100, INT8_VECTOR_ESTIMATOR_SIZE_MB)
    return
  }
  const totalEstimate = INT8_VECTOR_ESTIMATOR_SIZE_MB * 1024 * 1024
  let lastError: unknown
  for (const candidate of INT8_REMOTE_CANDIDATES) {
    try {
      // Erst der eigene Mirror (gleiche Ablage-Konvention wie die
      // übrigen Engine-Dateien), dann das Community-Repo auf Hugging Face.
      let response: Response | null = null
      try {
        const local = await fetch(mirrorUrl(candidate))
        const type = local.headers.get('Content-Type') ?? ''
        if (local.ok && !type.includes('text/html')) response = local
      } catch {
        // Mirror nicht erreichbar – Hugging Face versuchen.
      }
      if (!response) {
        const remote = await fetch(`${INT8_HF_BASE}/${candidate}`)
        if (!remote.ok) {
          throw new Error(
            `Download failed for ${candidate}: HTTP ${remote.status}`,
          )
        }
        response = remote
      }
      if (!response.body) {
        throw new Error(`Download failed for ${candidate}: empty body`)
      }
      const contentLength =
        Number(response.headers.get('Content-Length')) || 0
      let loaded = 0
      await writeAssetStream(
        INT8_VECTOR_ESTIMATOR_PATH,
        response.body,
        (bytes) => {
          loaded += bytes
          onProgress(
            Math.min(99, Math.round((loaded / totalEstimate) * 100)),
            Math.round(loaded / 1024 / 1024),
          )
        },
        contentLength,
      )
      onProgress(100, Math.round(loaded / 1024 / 1024))
      return
    } catch (error) {
      lastError = error
      if ((error as DOMException | null)?.name === 'QuotaExceededError') {
        throw new StudioDownloadError(
          'quota',
          'Quota exceeded storing int8 variant',
        )
      }
      // Nächsten Kandidaten-Pfad versuchen.
    }
  }
  throw new StudioDownloadError(
    'network',
    lastError instanceof Error ? lastError.message : String(lastError),
  )
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
  // Mit hartem Timeout: Dieser Abruf läuft mitten in der SERIELLEN
  // Synthese-Warteschlange des Workers – ein hängender Netzabruf würde
  // sonst jede weitere Sprachausgabe für immer blockieren.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetchAsset(path, controller.signal)
    const data = await response.arrayBuffer()
    await writeAsset(path, data)
    return data
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Downloads the shared engine plus all ten voice styles sequentially with
 * byte-weighted overall progress. Files stream directly into OPFS – no
 * full-file buffering, which matters for the ~200 MB models on memory-tight
 * mobile devices. Already-stored files are skipped and incomplete files are
 * never committed, so an interrupted download resumes where it stopped.
 *
 * Fails fast with a typed StudioDownloadError before fetching anything when
 * the browser refuses OPFS (private windows) or the quota clearly cannot
 * hold a fresh download – no point streaming 400 MB that can't be stored.
 */
export async function downloadStudioEngine(
  onProgress: (percent: number, loadedMB: number) => void,
): Promise<void> {
  if (!(await isStorageAvailable())) {
    throw new StudioDownloadError('storage', 'OPFS unavailable')
  }
  // Ask the browser not to evict the ~400 MB store under storage pressure –
  // without this, Safari may silently wipe OPFS after a few days.
  try {
    await navigator.storage.persist?.()
  } catch {
    // Persistence is best-effort.
  }

  const assets = [
    ...ENGINE_ASSETS,
    ...STUDIO_VOICES.map((voice) => styleAsset(voice.id)),
  ]
  const totalEstimate = STUDIO_ENGINE_SIZE_MB * 1024 * 1024
  const sizes = await Promise.all(assets.map((path) => assetSize(path)))

  if (!sizes.some((size) => size > 0)) {
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

  let storedBytes = 0
  const report = (fileBytes: number) => {
    const loaded = storedBytes + fileBytes
    onProgress(
      Math.min(99, Math.round((loaded / totalEstimate) * 100)),
      Math.round(loaded / 1024 / 1024),
    )
  }

  for (const [index, path] of assets.entries()) {
    const existing = sizes[index]
    if (existing > 0) {
      storedBytes += existing
      report(0)
      continue
    }
    storedBytes += await downloadAsset(path, report)
  }
  // Die Synthese braucht zusätzlich die onnxruntime-WASM-Laufzeit; einmal
  // anfassen, damit der Service Worker sie cacht und "alles offline"
  // wirklich stimmt. Best-effort – online klappt die Wiedergabe auch so.
  await warmOrtWasmCache()
  onProgress(100, Math.round(storedBytes / 1024 / 1024))
}

const DOWNLOAD_ATTEMPTS = 3

/** Downloads one asset with retries, reporting in-file progress bytes. */
async function downloadAsset(
  path: string,
  onBytes: (fileBytes: number) => void,
): Promise<number> {
  let lastError: unknown
  for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)))
    }
    let fileBytes = 0
    try {
      const response = await fetchAsset(path)
      if (!response.body) {
        throw new Error(`Download failed for ${path}: empty body`)
      }
      const contentLength = Number(response.headers.get('Content-Length')) || 0
      return await writeAssetStream(
        path,
        response.body,
        (bytes) => {
          fileBytes += bytes
          onBytes(fileBytes)
        },
        contentLength,
      )
    } catch (error) {
      lastError = error
      onBytes(0)
      // A full store won't fix itself by retrying – tell the user directly.
      if ((error as DOMException | null)?.name === 'QuotaExceededError') {
        throw new StudioDownloadError('quota', `Quota exceeded storing ${path}`)
      }
    }
  }
  console.error(`Supertonic download failed for ${path}:`, lastError)
  throw new StudioDownloadError(
    'network',
    lastError instanceof Error ? lastError.message : String(lastError),
  )
}
