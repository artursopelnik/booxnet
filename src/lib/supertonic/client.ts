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

/** Eckdaten der geladenen Engine, für die Diagnose-Anzeige in der UI. */
export interface EngineStats {
  threads: number
  isolated: boolean
  cores: number | null
  loadSeconds: number
}

/** Messwerte der letzten fertigen Satz-Berechnung (ohne Vorschauen). */
export interface SynthStats {
  computeSeconds: number
  audioSeconds: number
}

/**
 * Meldungen, die der Worker von sich aus schickt: Fortschritt (0..1) für
 * Engine-Laden und Satz-Berechnung sowie Diagnose-Eckdaten.
 */
type ProgressMessage =
  | { type: 'engine-progress'; value: number }
  | { type: 'synth-progress'; value: number }
  | { type: 'engine-stats'; stats: EngineStats }
  | { type: 'synth-stats'; stats: SynthStats }

export interface EngineInfo {
  engine: EngineStats | null
  synth: SynthStats | null
}

let engineInfo: EngineInfo = { engine: null, synth: null }
const engineInfoListeners = new Set<(info: EngineInfo) => void>()

function updateEngineInfo(patch: Partial<EngineInfo>): void {
  engineInfo = { ...engineInfo, ...patch }
  for (const listener of engineInfoListeners) {
    listener(engineInfo)
  }
}

/**
 * Abonniert die Diagnose-Eckdaten (Threads, Ladezeit, letzte
 * Satz-Berechnung) für die Anzeige in der Stimmen-Auswahl – am Handy
 * gibt es keine Browser-Konsole. Sofort mit dem aktuellen Stand gerufen.
 */
export function subscribeEngineInfo(
  listener: (info: EngineInfo) => void,
): () => void {
  listener(engineInfo)
  engineInfoListeners.add(listener)
  return () => {
    engineInfoListeners.delete(listener)
  }
}



let engineProgress = 0
const engineProgressListeners = new Set<(value: number) => void>()

function setEngineProgress(value: number): void {
  engineProgress = value
  for (const listener of engineProgressListeners) {
    listener(value)
  }
}

let synthProgress = 0
const synthProgressListeners = new Set<(value: number) => void>()

function setSynthProgress(value: number): void {
  synthProgress = value
  for (const listener of synthProgressListeners) {
    listener(value)
  }
}

/**
 * Abonniert den Fortschritt des einmaligen Engine-Ladens (0..1, 1 =
 * geladen). Der Listener wird sofort mit dem aktuellen Stand aufgerufen –
 * so zeigt die UI auch dann den richtigen Wert, wenn das Laden schon vor
 * dem Abonnieren begann (Warmstart beim App-Start) oder längst fertig ist.
 */
export function subscribeEngineProgress(
  listener: (value: number) => void,
): () => void {
  listener(engineProgress)
  engineProgressListeners.add(listener)
  return () => {
    engineProgressListeners.delete(listener)
  }
}

/**
 * Abonniert den Rechenschritt-Fortschritt der laufenden Satz-Berechnung
 * (0..1). Die UI zeigt ihn nur, solange sie tatsächlich auf einen Satz
 * wartet – Hintergrund-Vorausberechnungen melden sich zwar auch, sind
 * dann aber nicht sichtbar.
 */
export function subscribeSynthProgress(
  listener: (value: number) => void,
): () => void {
  listener(synthProgress)
  synthProgressListeners.add(listener)
  return () => {
    synthProgressListeners.delete(listener)
  }
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
    worker.onmessage = (
      event: MessageEvent<WorkerResponse | ProgressMessage>,
    ) => {
      const data = event.data
      if ('type' in data) {
        if (data.type === 'engine-progress') setEngineProgress(data.value)
        else if (data.type === 'synth-progress') setSynthProgress(data.value)
        else if (data.type === 'engine-stats') {
          updateEngineInfo({ engine: data.stats })
        } else {
          updateEngineInfo({ synth: data.stats })
        }
        return
      }
      const { id, ok, wav, error, cancelled } = data
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
      setEngineProgress(0)
      setSynthProgress(0)
      updateEngineInfo({ engine: null, synth: null })
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

/**
 * Experimentier-Schalter für die Graph-Optimierung des Engine-Aufbaus:
 * In der Browser-Konsole z. B. localStorage.setItem('vorleser.ortopt',
 * 'basic') setzen und neu laden – die Diagnose-Logs ([booxnet-tts])
 * zeigen dann Ladezeit und Threads zum Vergleich. Ohne Eintrag gilt
 * 'all' (Standard von onnxruntime, stärkste Optimierung).
 */
function ortOptLevel(): string {
  try {
    const value = localStorage.getItem('vorleser.ortopt')
    return value === 'extended' || value === 'basic' || value === 'disabled'
      ? value
      : 'all'
  } catch {
    return 'all'
  }
}

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
    getWorker().postMessage({
      ...message,
      id,
      ortOpt: ortOptLevel(),
    })
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
  setEngineProgress(0)
  setSynthProgress(0)
  updateEngineInfo({ engine: null, synth: null })
  if (worker) {
    worker.terminate()
    worker = null
    for (const entry of pending.values()) {
      // Als "verdrängt" markiert: Läuft gerade eine Wiedergabe, fordert
      // der Sprecher den Satz einfach neu an (dann mit der neuen
      // Engine), statt dem Nutzer einen Fehler zu zeigen.
      const error = new Error('Engine wurde zurückgesetzt')
      error.name = TTS_CANCELLED_ERROR
      entry.reject(error)
    }
    pending.clear()
  }
}

/**
 * Verwirft wartende und laufende Hintergrund-Vorausberechnungen des
 * Vorlesens (nicht die Vorschau-Begrüßungen), z. B. nach einem
 * Tempowechsel: Die alten Berechnungen passen nicht mehr und würden die
 * im neuen Tempo nur ausbremsen. VOR dem Einreihen der neuen Prefetches
 * aufrufen.
 */
export function studioFlushPrefetches(): void {
  if (!worker) return
  worker.postMessage({ type: 'flush', id: nextId++ })
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
  channel: 'speech' | 'preview' = 'speech',
): Promise<Blob> {
  const key = `${voiceId} ${lang} ${speed} ${text}`
  const hit = cache.get(key)
  // Der Nutzer wartet ab jetzt aktiv auf eine NEUE Berechnung: Den
  // Rest-Fortschritt der vorigen nicht als vollen Balken aufblitzen
  // lassen. Läuft der gewünschte Satz schon (wartender Cache-Treffer),
  // stimmt der gemeldete Fortschritt dagegen bereits.
  if (priority && !hit?.pending) setSynthProgress(0)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    if (priority && hit.pending && worker) {
      worker.postMessage({ type: 'bump', target: hit.id, id: nextId++ })
    }
    return hit.promise
  }
  const { id, promise } = request(
    { type: 'synthesize', voiceId, lang, text, speed, steps, priority, channel },
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

// Das Vorausberechnen kommender Sätze liegt in lib/tts.ts
// (prefetchSentences): Es legt die Ergebnisse zusätzlich dauerhaft ab,
// damit der nächste App-Start ohne Warten auf die Engine losspielt.
