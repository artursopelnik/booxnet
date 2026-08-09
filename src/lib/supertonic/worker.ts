/**
 * Supertonic 3 inference worker (TypeScript port of the MIT-licensed web
 * example from github.com/supertone-inc/supertonic, preserved in
 * vendor/supertonic/).
 *
 * Runs entirely off the main thread so the UI never freezes during
 * synthesis. Four ONNX models (duration predictor, text encoder, vector
 * estimator, vocoder) run via onnxruntime-web on plain WASM. Deliberately
 * NO WebGPU: on iPhones the GPU engine tears down the whole page through
 * memory exhaustion (Safari's "a problem repeatedly occurred") – no
 * JavaScript survives that, so no fallback can catch it. Stability beats
 * speed here; speed comes from the low denoising step count instead.
 * Sessions are created once and reused.
 */
import type { StudioVoiceId } from '../voices'
import { ensureStudioStyle, loadStudioAsset } from './assets'
import { assetSize } from './opfs'
import { resolveOrtWasmPrefix } from './ortwasm'

type Ort = typeof import('onnxruntime-web')
type OrtSession = import('onnxruntime-web').InferenceSession
type OrtTensor = import('onnxruntime-web').Tensor

const SILENCE_SECONDS = 0.3

interface Cfgs {
  ae: { sample_rate: number; base_chunk_size: number }
  ttl: { chunk_compress_factor: number; latent_dim: number }
}

interface Style {
  ttl: OrtTensor
  dp: OrtTensor
}

interface Engine {
  ort: Ort
  cfgs: Cfgs
  indexer: number[]
  dp: OrtSession
  textEnc: OrtSession
  vectorEst: OrtSession
  vocoder: OrtSession
  styles: Map<StudioVoiceId, Style>
}

let enginePromise: Promise<Engine> | null = null

/**
 * Meldet den Stand des einmaligen Engine-Ladens (0..1) an den Client,
 * damit die UI beim ersten Play-Druck einen echten Fortschrittsbalken
 * zeigen kann statt eines endlos wirkenden Spinners. Byte-gewichtet:
 * Jedes Modell zählt einmal fürs Lesen aus OPFS und einmal für den
 * Session-Aufbau, so bewegt sich der Balken auch bei den großen Modellen
 * sichtbar voran.
 */
function reportEngineProgress(value: number): void {
  self.postMessage({
    type: 'engine-progress',
    value: Math.max(0, Math.min(1, value)),
  })
}

/**
 * Experimentier-Schalter für die Graph-Optimierung beim Session-Aufbau
 * (localStorage 'vorleser.ortopt', vom Client mitgeschickt): 'all'
 * (Standard) optimiert am stärksten, kostet aber beim Aufbau am meisten
 * Zeit; 'basic'/'disabled' bauen schneller auf, rechnen dafür ggf.
 * langsamer. Die Diagnose-Logs unten liefern die Messwerte zum Vergleich.
 */
export type OrtOptLevel = 'all' | 'extended' | 'basic' | 'disabled'

function toOrtOptLevel(value: unknown): OrtOptLevel {
  return value === 'extended' || value === 'basic' || value === 'disabled'
    ? value
    : 'all'
}

async function loadEngine(ortOpt: OrtOptLevel): Promise<Engine> {
  const startedAt = Date.now()
  reportEngineProgress(0)
  const ort = (await import('onnxruntime-web/wasm')) as Ort
  // Multi-threaded WASM needs SharedArrayBuffer (COOP/COEP headers, siehe
  // public/_headers - Netlify setzt sie, GitHub Pages kann das nicht).
  // Without cross-origin isolation forcing threads makes onnxruntime hang
  // on iOS Safari instead of falling back. Alle Kerne bis auf einen
  // (maximal 6): Der freie Kern haelt UI und Audio-Ausgabe fluessig,
  // oberhalb von 6 Threads bringen diese Modelle kaum noch Tempo.
  ort.env.wasm.numThreads = self.crossOriginIsolated
    ? Math.max(1, Math.min(6, (navigator.hardwareConcurrency ?? 4) - 1))
    : 1
  // Diagnose: Ohne Cross-Origin-Isolation (COOP/COEP-Header fehlen oder
  // gingen im Service-Worker-Cache verloren) läuft die Engine EINKERNIG –
  // das wäre der wahre Schuldige hinter "quälend langsam".
  console.info(
    `[booxnet-tts] Threads: ${ort.env.wasm.numThreads}` +
      ` (crossOriginIsolated=${self.crossOriginIsolated === true},` +
      ` Kerne=${navigator.hardwareConcurrency ?? '?'},` +
      ` Optimierung=${ortOpt})`,
  )
  ort.env.wasm.wasmPaths = await resolveOrtWasmPrefix()

  const [cfgsBuf, indexerBuf] = await Promise.all([
    loadStudioAsset('onnx/tts.json'),
    loadStudioAsset('onnx/unicode_indexer.json'),
  ])
  const cfgs = JSON.parse(new TextDecoder().decode(cfgsBuf)) as Cfgs
  const indexer = JSON.parse(new TextDecoder().decode(indexerBuf)) as number[]

  // Pipelined statt strikt seriell: Während onnxruntime eine Session
  // aufbaut (reine CPU-Arbeit), wird bereits die nächste Modelldatei aus
  // OPFS gelesen (reines I/O). Das spart die Lesezeit von drei der vier
  // Modelle beim Kaltstart, hält aber höchstens zwei Modellpuffer
  // gleichzeitig im Speicher – alle vier parallel würde auf
  // speicherknappen iPhones das Seiten-Aus riskieren.
  const modelPaths = [
    'onnx/duration_predictor.onnx',
    'onnx/text_encoder.onnx',
    'onnx/vector_estimator.onnx',
    'onnx/vocoder.onnx',
  ]
  const sizes = await Promise.all(modelPaths.map((path) => assetSize(path)))
  const totalWork = sizes.reduce((sum, size) => sum + Math.max(0, size), 0) * 2
  let doneWork = 0
  const step = (bytes: number) => {
    doneWork += Math.max(0, bytes)
    reportEngineProgress(totalWork > 0 ? doneWork / totalWork : 0)
  }

  const sessions: OrtSession[] = []
  let nextBuffer = loadStudioAsset(modelPaths[0])
  for (let i = 0; i < modelPaths.length; i++) {
    const buffer = await nextBuffer
    step(sizes[i])
    if (i + 1 < modelPaths.length) {
      nextBuffer = loadStudioAsset(modelPaths[i + 1])
    }
    const sessionStart = Date.now()
    sessions.push(
      await ort.InferenceSession.create(new Uint8Array(buffer), {
        executionProviders: ['wasm'],
        graphOptimizationLevel: ortOpt,
      }),
    )
    // Diagnose: Welches Modell frisst die Ladezeit? (Session-Aufbau ohne
    // die parallel laufende OPFS-Lesezeit.)
    console.info(
      `[booxnet-tts] ${modelPaths[i]}: Session in ` +
        `${((Date.now() - sessionStart) / 1000).toFixed(1)} s` +
        ` (${Math.round(Math.max(0, sizes[i]) / 1024 / 1024)} MB)`,
    )
    step(sizes[i])
  }
  const [dp, textEnc, vectorEst, vocoder] = sessions

  reportEngineProgress(1)
  const loadSeconds = (Date.now() - startedAt) / 1000
  console.info(
    `[booxnet-tts] Engine bereit: WASM, gesamt ${loadSeconds.toFixed(1)} s`,
  )
  // Eckdaten an die UI: Am Handy gibt es keine Browser-Konsole, die
  // Stimmen-Auswahl zeigt sie stattdessen unter "Technische Details".
  self.postMessage({
    type: 'engine-stats',
    stats: {
      threads: ort.env.wasm.numThreads,
      isolated: self.crossOriginIsolated === true,
      cores: navigator.hardwareConcurrency ?? null,
      loadSeconds,
    },
  })
  return {
    ort,
    cfgs,
    indexer,
    dp,
    textEnc,
    vectorEst,
    vocoder,
    styles: new Map(),
  }
}

function getEngine(ortOpt: OrtOptLevel): Promise<Engine> {
  // Die erste Anfrage bestimmt die Optimierungsstufe; ein Wechsel greift
  // erst nach einem Engine-Reset bzw. App-Neustart.
  enginePromise ??= loadEngine(ortOpt).catch((error) => {
    enginePromise = null
    // Sonst bliebe der Fortschrittsbalken beim nächsten Versuch auf dem
    // alten Stand stehen.
    reportEngineProgress(0)
    throw error
  })
  return enginePromise
}

async function getStyle(
  engine: Engine,
  voiceId: StudioVoiceId,
): Promise<Style> {
  const cached = engine.styles.get(voiceId)
  if (cached) return cached
  // Style files are tiny and fetched on demand the first time a voice is
  // used; afterwards they live in OPFS like the engine itself.
  const buffer = await ensureStudioStyle(voiceId)
  const json = JSON.parse(new TextDecoder().decode(buffer)) as {
    style_ttl: { dims: number[]; data: unknown }
    style_dp: { dims: number[]; data: unknown }
  }
  const toTensor = (entry: { dims: number[]; data: unknown }) => {
    const flat = new Float32Array(
      (entry.data as number[][]).flat(Infinity as 1) as unknown as number[],
    )
    return new engine.ort.Tensor('float32', flat, [
      1,
      entry.dims[1],
      entry.dims[2],
    ])
  }
  const style = { ttl: toTensor(json.style_ttl), dp: toTensor(json.style_dp) }
  engine.styles.set(voiceId, style)
  return style
}

/** Text cleanup + language tagging, ported from the reference example. */
function preprocessText(text: string, lang: string): string {
  let t = text.normalize('NFKD')
  t = t.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu,
    '',
  )
  const replacements: Record<string, string> = {
    '–': '-',
    '‑': '-',
    '—': '-',
    _: ' ',
    '“': '"',
    '”': '"',
    '‘': "'",
    '’': "'",
    '´': "'",
    '`': "'",
    '[': ' ',
    ']': ' ',
    '|': ' ',
    '/': ' ',
    '#': ' ',
    '→': ' ',
    '←': ' ',
  }
  for (const [k, v] of Object.entries(replacements)) {
    t = t.replaceAll(k, v)
  }
  t = t.replace(/[♥☆♡©\\]/g, '')
  t = t
    .replaceAll(' ,', ',')
    .replaceAll(' .', '.')
    .replaceAll(' !', '!')
    .replaceAll(' ?', '?')
    .replaceAll(' ;', ';')
    .replaceAll(' :', ':')
    .replaceAll(" '", "'")
  while (t.includes('""')) t = t.replace('""', '"')
  while (t.includes("''")) t = t.replace("''", "'")
  t = t.replace(/\s+/g, ' ').trim()
  if (!/[.!?;:,'")\]}…。」』】〉》›»]$/.test(t)) {
    t += '.'
  }
  return `<${lang}>${t}</${lang}>`
}

/** Splits an over-long sentence into chunks the model handles well. */
function chunkText(text: string, lang: string): string[] {
  const maxLen = lang === 'ko' || lang === 'ja' ? 120 : 300
  const clean = text.trim()
  if (clean.length <= maxLen) return [clean]
  const words = clean.split(/\s+/)
  const chunks: string[] = []
  let current = ''
  for (const word of words) {
    if (current && current.length + word.length + 1 > maxLen) {
      chunks.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) chunks.push(current)
  return chunks
}

function gaussianArray(length: number): Float32Array {
  const result = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const u1 = Math.max(0.0001, Math.random())
    const u2 = Math.random()
    result[i] = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
  }
  return result
}

/** Laufende Synthese wurde von einer Vorrang-Anfrage verdrängt. */
class AbortedError extends Error {}

/**
 * Gibt die Ereignisschleife des Workers frei, damit eingegangene
 * Steuer-Nachrichten (Vorrang-Anfrage, bump, flush) verarbeitet werden.
 * Ohne dieses Luftholen hängen ONNX-Rechenblöcke nur über Microtasks
 * aneinander und onmessage feuert erst, wenn die GESAMTE Warteschlange
 * leergerechnet ist – ein Stimmen- oder Tempowechsel musste dann erst
 * alle veralteten Vorausberechnungen abwarten. Über MessageChannel statt
 * setTimeout: Nachrichten derselben Task-Quelle, die während des Rechnens
 * eintrafen, kommen garantiert VOR der Fortsetzung dran, und die
 * Timer-Mindestverzögerung entfällt.
 */
const yieldChannel = new MessageChannel()
let yieldResolve: (() => void) | null = null
yieldChannel.port1.onmessage = () => {
  const resolve = yieldResolve
  yieldResolve = null
  resolve?.()
}
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    yieldResolve = resolve
    yieldChannel.port2.postMessage(0)
  })
}

async function inferChunk(
  engine: Engine,
  text: string,
  lang: string,
  style: Style,
  speed: number,
  steps: number,
  shouldAbort: () => boolean,
  onStep?: (completedSteps: number) => void,
): Promise<Float32Array> {
  const { ort, cfgs } = engine

  // Text → id sequence (batch size is always 1 here).
  const processed = preprocessText(text, lang)
  const ids = new BigInt64Array(processed.length)
  for (let j = 0; j < processed.length; j++) {
    const codePoint = processed.codePointAt(j) ?? 0
    ids[j] = BigInt(
      codePoint < engine.indexer.length ? engine.indexer[codePoint] : -1,
    )
  }
  const textIds = new ort.Tensor('int64', ids, [1, processed.length])
  const textMask = new ort.Tensor(
    'float32',
    new Float32Array(processed.length).fill(1),
    [1, 1, processed.length],
  )

  // Predict duration; the speed factor stretches/compresses it natively.
  const dpOut = await engine.dp.run({
    text_ids: textIds,
    style_dp: style.dp,
    text_mask: textMask,
  })
  const duration = Number((dpOut.duration.data as Float32Array)[0]) / speed

  // Encode text.
  const encOut = await engine.textEnc.run({
    text_ids: textIds,
    style_ttl: style.ttl,
    text_mask: textMask,
  })
  const textEmb = encOut.text_emb

  // Sample noisy latent.
  const sampleRate = cfgs.ae.sample_rate
  const chunkSize = cfgs.ae.base_chunk_size * cfgs.ttl.chunk_compress_factor
  const latentDim = cfgs.ttl.latent_dim * cfgs.ttl.chunk_compress_factor
  const wavLen = Math.floor(duration * sampleRate)
  const latentLen = Math.floor((wavLen + chunkSize - 1) / chunkSize)
  let xt = gaussianArray(latentDim * latentLen)

  const latentMask = new ort.Tensor(
    'float32',
    new Float32Array(latentLen).fill(1),
    [1, 1, latentLen],
  )
  const totalStep = new ort.Tensor(
    'float32',
    new Float32Array([steps]),
    [1],
  )

  // Denoising loop. Zwischen den Schritten abbrechbar: So blockiert eine
  // laufende Hintergrund-Berechnung einen Play-Druck nur noch für einen
  // einzelnen Schritt (~Sekunden) statt für die gesamte Synthese.
  for (let step = 0; step < steps; step++) {
    if (shouldAbort()) throw new AbortedError('Von Play-Druck verdrängt')
    const out = await engine.vectorEst.run({
      noisy_latent: new ort.Tensor('float32', xt, [1, latentDim, latentLen]),
      text_emb: textEmb,
      style_ttl: style.ttl,
      latent_mask: latentMask,
      text_mask: textMask,
      current_step: new ort.Tensor('float32', new Float32Array([step]), [1]),
      total_step: totalStep,
    })
    xt = new Float32Array(out.denoised_latent.data as Float32Array)
    onStep?.(step + 1)
    // ONNX-Runtime läuft hier (ohne SharedArrayBuffer nur 1 Thread) rein
    // synchron hinter einer bereits aufgelösten Promise – ohne echtes
    // Yield an die Browser-Ereignisschleife bleiben eingehende
    // Vorrang-Anfragen (Stimmen-/Tempowechsel) in der Nachrichten-
    // Warteschlange liegen, bis die GESAMTE Warteschlange abgearbeitet
    // ist. Das erklärt, warum ein Wechsel scheinbar mehrere Sätze lang
    // "durchlädt", bevor er greift.
    await yieldToEventLoop()
  }

  // Latent → waveform.
  if (shouldAbort()) throw new AbortedError('Von Play-Druck verdrängt')
  const vocoderOut = await engine.vocoder.run({
    latent: new ort.Tensor('float32', xt, [1, latentDim, latentLen]),
  })
  return new Float32Array(vocoderOut.wav_tts.data as Float32Array)
}

function toWav(audio: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = audio.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let i = 0; i < audio.length; i++) {
    const clamped = Math.max(-1, Math.min(1, audio[i]))
    view.setInt16(44 + i * 2, Math.floor(clamped * 32767), true)
  }
  return buffer
}

async function synthesize(
  engine: Engine,
  voiceId: StudioVoiceId,
  lang: string,
  text: string,
  speed: number,
  steps: number,
  shouldAbort: () => boolean,
  onProgress?: (value: number) => void,
): Promise<ArrayBuffer> {
  const style = await getStyle(engine, voiceId)
  const chunks = chunkText(text, lang)
  // Fortschritt über alle Denoising-Schritte aller Text-Stücke hinweg –
  // der Vocoder am Ende ist im Vergleich dazu kurz.
  const totalSteps = chunks.length * steps
  const parts: Float32Array[] = []
  for (const [index, chunk] of chunks.entries()) {
    parts.push(
      await inferChunk(engine, chunk, lang, style, speed, steps, shouldAbort,
        (done) => onProgress?.((index * steps + done) / totalSteps),
      ),
    )
  }
  const sampleRate = engine.cfgs.ae.sample_rate
  const silence = Math.floor(SILENCE_SECONDS * sampleRate)
  const total =
    parts.reduce((sum, part) => sum + part.length, 0) +
    silence * Math.max(0, parts.length - 1)
  const audio = new Float32Array(total)
  let offset = 0
  parts.forEach((part, i) => {
    if (i > 0) offset += silence
    audio.set(part, offset)
    offset += part.length
  })
  return toWav(audio, sampleRate)
}

interface SynthesizeRequest {
  id: number
  type: 'synthesize'
  voiceId: StudioVoiceId
  lang: string
  text: string
  speed: number
  /** Denoising-Schritte: mehr = besserer Klang, langsamere Synthese. */
  steps?: number
  /** Wird gerade abgespielt/erwartet – verdrängt Vorab-Berechnungen. */
  priority?: boolean
  /**
   * Quelle der Vorrang-Anfrage ('speech' | 'preview'): Eine neue
   * Vorrang-Anfrage verwirft wartende Vorrang-Anfragen DERSELBEN Quelle
   * – der Sprecher will immer nur seinen neuesten Satz, schnelle
   * Stimmwechsel/Tipper dürfen keine Berechnungs-Schlange auftürmen.
   */
  channel?: string
  /** Experimentier-Schalter für die Graph-Optimierung (siehe oben). */
  ortOpt?: string
}

interface PreloadRequest {
  id: number
  type: 'preload'
  voiceId: StudioVoiceId
  /** Experimentier-Schalter für die Graph-Optimierung (siehe oben). */
  ortOpt?: string
}

interface ResetRequest {
  id: number
  type: 'reset'
}

/** Zieht eine bereits eingereihte Anfrage an die Spitze der Warteschlange. */
interface BumpRequest {
  id: number
  type: 'bump'
  target: number
}

/**
 * Verwirft alle wartenden (und die laufende) Hintergrund-Vorlese-
 * Berechnungen, z. B. nach einem Tempowechsel: Die alten Vorausberechnungen
 * passen nicht mehr und würden nur die neuen blockieren. Vorschau-
 * Berechnungen (channel 'preview') bleiben unberührt.
 */
interface FlushRequest {
  id: number
  type: 'flush'
}

type Request =
  | SynthesizeRequest
  | PreloadRequest
  | ResetRequest
  | BumpRequest
  | FlushRequest

/** Gerade rechnende Synthese – von Vorrang-Anfragen abbrechbar. */
let runningTask: {
  id: number
  priority: boolean
  channel?: string
  aborted: boolean
} | null = null

async function handle(
  request: Exclude<Request, BumpRequest | FlushRequest>,
): Promise<void> {
  if (request.type === 'reset') {
    enginePromise = null
    self.postMessage({ id: request.id, ok: true })
    return
  }
  try {
    const engine = await getEngine(toOrtOptLevel(request.ortOpt))
    if (request.type === 'preload') {
      await getStyle(engine, request.voiceId)
      self.postMessage({ id: request.id, ok: true })
      return
    }
    // Diagnose: Welche Stimme rechnet gerade, wie lang ist der Rückstau?
    console.info(
      `[booxnet-tts] Synthese ${request.voiceId}` +
        ` (prio=${request.priority === true}, wartend=${taskQueue.length})`,
    )
    // Der Client schickt die Schrittzahl immer mit; der Rückfallwert
    // greift nur bei einer unvollständigen Anfrage. Bewusst konservativ,
    // damit daraus nie unbemerkt eine andere Klangqualität wird.
    const steps = Math.min(12, Math.max(1, Math.round(request.steps ?? 6)))
    runningTask = {
      id: request.id,
      priority: request.priority === true,
      channel: request.channel,
      aborted: false,
    }
    // Rechenschritt-Fortschritt an die UI melden, damit auch die
    // Satz-Berechnung nie wie eingefroren wirkt. Nur fürs Vorlesen –
    // Vorschau-Begrüßungen rechnen unsichtbar im Hintergrund.
    const reportSynth =
      request.channel === 'preview'
        ? undefined
        : (value: number) =>
            self.postMessage({
              type: 'synth-progress',
              value: Math.max(0, Math.min(1, value)),
            })
    reportSynth?.(0)
    const synthStart = Date.now()
    const wav = await synthesize(
      engine,
      request.voiceId,
      request.lang,
      request.text,
      request.speed,
      steps,
      () => runningTask?.aborted === true,
      reportSynth,
    )
    // Messwerte für die Diagnose-Anzeige: Rechenzeit gegen erzeugte
    // Tonlänge (16-Bit-Mono nach dem 44-Byte-WAV-Kopf). Ein Verhältnis
    // unter 1 heißt: schneller als Echtzeit, der Vorrat wächst.
    if (reportSynth) {
      self.postMessage({
        type: 'synth-stats',
        stats: {
          computeSeconds: (Date.now() - synthStart) / 1000,
          audioSeconds:
            (wav.byteLength - 44) / 2 / engine.cfgs.ae.sample_rate,
        },
      })
    }
    // Transfer the buffer – no copy on the way back.
    self.postMessage({ id: request.id, ok: true, wav }, { transfer: [wav] })
  } catch (error) {
    if (error instanceof AbortedError) {
      self.postMessage({
        id: request.id,
        ok: false,
        cancelled: true,
        error: 'Abgebrochen: neuer Satz angefordert',
      })
      return
    }
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    runningTask = null
  }
}

// Requests are processed strictly one at a time: parallel denoising loops
// would fight over CPU/GPU without finishing any sentence sooner. The
// queue is a real list instead of a promise chain, so the sentence the
// user is actually waiting for can overtake queued prefetches – on slow
// devices those would otherwise add up to a timeout before playback.
const taskQueue: Exclude<Request, BumpRequest | FlushRequest>[] = []
let pumping = false

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  for (;;) {
    const request = taskQueue.shift()
    if (!request) break
    await handle(request)
  }
  pumping = false
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data
  if (request.type === 'flush') {
    for (let i = taskQueue.length - 1; i >= 0; i--) {
      const task = taskQueue[i]
      if (
        task.type === 'synthesize' &&
        !task.priority &&
        task.channel !== 'preview'
      ) {
        taskQueue.splice(i, 1)
        self.postMessage({
          id: task.id,
          ok: false,
          cancelled: true,
          error: 'Abgebrochen: Vorausberechnung verworfen',
        })
      }
    }
    if (
      runningTask &&
      !runningTask.priority &&
      runningTask.channel !== 'preview'
    ) {
      runningTask.aborted = true
    }
    return
  }
  if (request.type === 'bump') {
    const index = taskQueue.findIndex((task) => task.id === request.target)
    if (index > 0) {
      const [task] = taskQueue.splice(index, 1)
      taskQueue.unshift(task)
    }
    // Der Nutzer wartet JETZT auf die Ziel-Anfrage (Play-Druck auf einen
    // bereits vorgemerkten Satz). Eine gerade laufende HINTERGRUND-
    // Berechnung eines anderen Auftrags steigt am nächsten Rechenschritt
    // aus, statt erst komplett fertig zu rechnen, während der gewünschte
    // Satz in der Warteschlange hängt. Die Ziel-Anfrage selbst darf
    // natürlich weiterlaufen, falls sie schon dran ist.
    if (
      runningTask &&
      !runningTask.priority &&
      runningTask.id !== request.target
    ) {
      runningTask.aborted = true
    }
    return
  }
  if (request.type === 'synthesize' && request.priority) {
    // Der letzte Play-Druck gewinnt: Verworfen werden alle wartenden
    // HINTERGRUND-Synthesen (Prefetch, Vorschau-Warmup) sowie wartende
    // Vorrang-Anfragen DERSELBEN Quelle (channel) – der Sprecher will
    // immer nur seinen neuesten Satz; ohne das tuermte jeder schnelle
    // Stimmwechsel/Tipper eine volle Berechnung obenauf und die
    // Warteschlange wuchs ins scheinbar Endlose. Vorrang-Anfragen
    // ANDERER Quellen bleiben bestehen (Probehören und Vorlesen dürfen
    // sich nicht gegenseitig abwürgen). Verdrängte Anfragen werden dem
    // Client als abgebrochen gemeldet – er räumt seinen Cache auf.
    for (let i = taskQueue.length - 1; i >= 0; i--) {
      const task = taskQueue[i]
      if (
        task.type === 'synthesize' &&
        (!task.priority || task.channel === request.channel)
      ) {
        taskQueue.splice(i, 1)
        self.postMessage({
          id: task.id,
          ok: false,
          cancelled: true,
          error: 'Abgebrochen: neuer Satz angefordert',
        })
      }
    }
    // Auch die LAUFENDE Berechnung verdrängen, wenn sie Hintergrund ist
    // oder eine ältere Vorrang-Anfrage derselben Quelle: Sie steigt am
    // nächsten Rechenschritt aus (~Sekunden) statt z. B. eine lange
    // Begrüßungs-Berechnung komplett zu Ende zu rechnen, während der
    // Nutzer auf seinen Satz wartet.
    if (
      runningTask &&
      (!runningTask.priority || runningTask.channel === request.channel)
    ) {
      runningTask.aborted = true
    }
    taskQueue.unshift(request)
  } else {
    taskQueue.push(request)
  }
  void pump()
}
