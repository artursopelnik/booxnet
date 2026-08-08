/**
 * Main-thread client for the Supertonic inference worker. Keeps the UI
 * responsive: heavy ONNX work happens in the worker, this side only
 * manages the request/response bridge and a small sentence cache.
 */
import type { StudioVoiceId } from '../voices'
import { warmOrtWasmCache } from './ortwasm'

interface WorkerResponse {
  id: number
  ok: boolean
  wav?: ArrayBuffer
  error?: string
  /** True, wenn ein neuerer Play-Druck die Anfrage verdrängt hat. */
  cancelled?: boolean
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<
  number,
  { resolve: (blob: Blob) => void; reject: (error: Error) => void }
>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, ok, wav, error, cancelled } = event.data
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      if (ok && wav) {
        entry.resolve(new Blob([wav], { type: 'audio/wav' }))
      } else if (ok) {
        entry.resolve(new Blob())
      } else {
        const rejection = new Error(error ?? 'Synthese fehlgeschlagen')
        if (cancelled) rejection.name = TTS_CANCELLED_ERROR
        entry.reject(rejection)
      }
    }
    worker.onerror = () => {
      for (const entry of pending.values()) {
        entry.reject(new Error('Synthese-Worker abgestürzt'))
      }
      pending.clear()
      worker?.terminate()
      worker = null
    }
  }
  return worker
}

/**
 * First synthesis after app start loads ~400 MB of sessions; give it time.
 * The watchdog guarantees the UI can never hang forever on a dead worker.
 * Background prefetches get extra headroom: on slow devices they queue
 * up, and a false timeout only causes repeat work.
 */
const FIRST_TIMEOUT_MS = 180_000
const PLAY_TIMEOUT_MS = 90_000
const PREFETCH_TIMEOUT_MS = 300_000
let firstRequestDone = false

/** Marks watchdog timeouts so the UI can word them honestly – the engine
 * runs locally, a timeout has nothing to do with the network. */
export const TTS_TIMEOUT_ERROR = 'TtsTimeoutError'

/** Marks requests displaced by a newer Play press – never user-visible. */
export const TTS_CANCELLED_ERROR = 'TtsCancelledError'

/**
 * Einheitliche Klangqualität für alles: Niedrigere "Schnell-Stufen"
 * (2–3 Schritte) klingen blechern und sind bewusst abgeschafft – lieber
 * ein Moment länger laden als schlecht klingen. 5 und 6 klangen im
 * Hörtest sauber, 4 ist der aktuelle Testwert (~20 % schneller als 5);
 * wirkt es zu dünn, sind 5/6 die bewährten Rückfallwerte. Die
 * Schrittzahl bleibt pro Anfrage übertragbar, damit eine spätere
 * Qualitäts-Einstellung ohne Umbau möglich ist.
 */
export const QUALITY_SYNTH_STEPS = 4

function request(
  message: Omit<Parameters<Worker['postMessage']>[0], 'id'> &
    Record<string, unknown>,
  timeoutMs: number = PLAY_TIMEOUT_MS,
): { id: number; promise: Promise<Blob> } {
  const id = nextId++
  const promise = new Promise<Blob>((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        pending.delete(id)
        const error = new Error(
          'Zeitüberschreitung bei der Sprachsynthese, bitte erneut versuchen.',
        )
        error.name = TTS_TIMEOUT_ERROR
        reject(error)
      },
      firstRequestDone ? timeoutMs : FIRST_TIMEOUT_MS,
    )
    pending.set(id, {
      resolve: (blob) => {
        clearTimeout(timeout)
        firstRequestDone = true
        resolve(blob)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    })
    getWorker().postMessage({ ...message, id })
  })
  return { id, promise }
}

const warmedVoices = new Set<string>()

/**
 * Fire-and-forget warm-up: loading the ~400 MB engine takes long, so it
 * starts as soon as the reader opens instead of on the first Play press.
 * The worker queues requests, so a Play during warm-up simply waits for
 * the already-running engine load instead of starting a second one.
 */
let wasmCacheWarmed = false

export function studioWarmup(voiceId: StudioVoiceId): void {
  // Auch Bestandsinstallationen (Sprachpaket vor diesem Update geladen)
  // bekommen die WASM-Laufzeit so in den Offline-Cache.
  if (!wasmCacheWarmed) {
    wasmCacheWarmed = true
    void warmOrtWasmCache()
  }
  if (warmedVoices.has(voiceId)) return
  warmedVoices.add(voiceId)
  request({ type: 'preload', voiceId }, PREFETCH_TIMEOUT_MS).promise.catch(
    () => {
      // Warm-up failures surface when playback actually starts.
      warmedVoices.delete(voiceId)
    },
  )
}

/** Drops the loaded engine, e.g. after the model pack was deleted. */
export function resetStudioEngine(): void {
  cache.clear()
  warmedVoices.clear()
  if (worker) {
    worker.terminate()
    worker = null
    for (const entry of pending.values()) {
      entry.reject(new Error('Engine wurde zurückgesetzt'))
    }
    pending.clear()
  }
}

const MAX_CACHED_SENTENCES = 24

interface CacheEntry {
  promise: Promise<Blob>
  /** Worker request id, for bumping a queued prefetch to the front. */
  id: number
  pending: boolean
}

const cache = new Map<string, CacheEntry>()

/**
 * Synthesizes one sentence, memoized per voice+language+speed+text.
 * With `priority` (the sentence is being played right now) it overtakes
 * queued prefetches in the worker; if the sentence is already queued as a
 * prefetch, that request is bumped to the front instead. Der Cache-Key
 * ignoriert die Schrittzahl bewusst: Ein bereits (hochwertig)
 * vorausberechneter Satz wird beim Antippen wiederverwendet statt
 * schnell-schlechter neu gerechnet.
 */
export function studioSynthesize(
  voiceId: StudioVoiceId,
  lang: string,
  text: string,
  speed: number,
  priority = false,
  steps: number = QUALITY_SYNTH_STEPS,
): Promise<Blob> {
  const key = `${voiceId} ${lang} ${speed} ${text}`
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    if (priority && hit.pending && worker) {
      worker.postMessage({ type: 'bump', target: hit.id, id: nextId++ })
    }
    return hit.promise
  }
  const { id, promise } = request(
    { type: 'synthesize', voiceId, lang, text, speed, steps, priority },
    priority ? PLAY_TIMEOUT_MS : PREFETCH_TIMEOUT_MS,
  )
  const entry: CacheEntry = {
    id,
    pending: true,
    promise: promise.then(
      (blob) => {
        entry.pending = false
        return blob
      },
      (error) => {
        entry.pending = false
        cache.delete(key)
        throw error
      },
    ),
  }
  cache.set(key, entry)
  while (cache.size > MAX_CACHED_SENTENCES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return entry.promise
}

/** Fire-and-forget warm-up of upcoming sentences, in good quality. */
export function studioPrefetch(
  voiceId: StudioVoiceId,
  lang: string,
  sentences: string[],
  speed: number,
): void {
  for (const text of sentences) {
    studioSynthesize(
      voiceId,
      lang,
      text,
      speed,
      false,
      QUALITY_SYNTH_STEPS,
    ).catch(() => {
      // Prefetch failures surface when the sentence is actually played.
    })
  }
}
