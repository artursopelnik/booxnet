/**
 * Main-thread client for the Supertonic inference worker. Keeps the UI
 * responsive: heavy ONNX work happens in the worker, this side only
 * manages the request/response bridge and a small sentence cache.
 */
import type { StudioVoiceId } from '../voices'

interface WorkerResponse {
  id: number
  ok: boolean
  wav?: ArrayBuffer
  error?: string
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
      const { id, ok, wav, error } = event.data
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      if (ok && wav) {
        entry.resolve(new Blob([wav], { type: 'audio/wav' }))
      } else if (ok) {
        entry.resolve(new Blob())
      } else {
        entry.reject(new Error(error ?? 'Synthese fehlgeschlagen'))
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
 */
const FIRST_TIMEOUT_MS = 180_000
const TIMEOUT_MS = 60_000
let firstRequestDone = false

function request(
  message: Omit<Parameters<Worker['postMessage']>[0], 'id'> &
    Record<string, unknown>,
): Promise<Blob> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        pending.delete(id)
        reject(
          new Error(
            'Zeitüberschreitung bei der Sprachsynthese – bitte erneut versuchen.',
          ),
        )
      },
      firstRequestDone ? TIMEOUT_MS : FIRST_TIMEOUT_MS,
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
}

const warmedVoices = new Set<string>()

/**
 * Fire-and-forget warm-up: loading the ~400 MB engine takes long, so it
 * starts as soon as the reader opens instead of on the first Play press.
 * The worker queues requests, so a Play during warm-up simply waits for
 * the already-running engine load instead of starting a second one.
 */
export function studioWarmup(voiceId: StudioVoiceId): void {
  if (warmedVoices.has(voiceId)) return
  warmedVoices.add(voiceId)
  request({ type: 'preload', voiceId }).catch(() => {
    // Warm-up failures surface when playback actually starts.
    warmedVoices.delete(voiceId)
  })
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
const cache = new Map<string, Promise<Blob>>()

/** Synthesizes one sentence, memoized per voice+language+speed+text. */
export function studioSynthesize(
  voiceId: StudioVoiceId,
  lang: string,
  text: string,
  speed: number,
): Promise<Blob> {
  const key = `${voiceId} ${lang} ${speed} ${text}`
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const promise = request({ type: 'synthesize', voiceId, lang, text, speed }).catch(
    (error) => {
      cache.delete(key)
      throw error
    },
  )
  cache.set(key, promise)
  while (cache.size > MAX_CACHED_SENTENCES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return promise
}

/** Fire-and-forget warm-up of upcoming sentences. */
export function studioPrefetch(
  voiceId: StudioVoiceId,
  lang: string,
  sentences: string[],
  speed: number,
): void {
  for (const text of sentences) {
    studioSynthesize(voiceId, lang, text, speed).catch(() => {
      // Prefetch failures surface when the sentence is actually played.
    })
  }
}
