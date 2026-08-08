/**
 * Supertonic 3 inference worker (TypeScript port of the MIT-licensed web
 * example from github.com/supertone-inc/supertonic, preserved in
 * vendor/supertonic/).
 *
 * Runs entirely off the main thread so the UI never freezes during
 * synthesis. Four ONNX models (duration predictor, text encoder, vector
 * estimator, vocoder) run via onnxruntime-web — WebGPU when available,
 * WASM otherwise. Sessions are created once and reused.
 */
import type { StudioVoiceId } from '../voices'
import { ensureStudioStyle, loadStudioAsset } from './assets'

type Ort = typeof import('onnxruntime-web')
type OrtSession = import('onnxruntime-web').InferenceSession
type OrtTensor = import('onnxruntime-web').Tensor

const ONNX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/'
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
  /** Denoising steps (5–12): more = better quality, slower synthesis. */
  steps: number
}

let enginePromise: Promise<Engine> | null = null

async function loadOrt(): Promise<{ ort: Ort; providers: string[] }> {
  if ('gpu' in navigator) {
    try {
      const ort = (await import('onnxruntime-web/webgpu')) as Ort
      return { ort, providers: ['webgpu', 'wasm'] }
    } catch {
      // Fall through to the plain WASM build.
    }
  }
  const ort = await import('onnxruntime-web')
  return { ort, providers: ['wasm'] }
}

async function loadEngine(): Promise<Engine> {
  const { ort, providers } = await loadOrt()
  ort.env.allowLocalModels = false
  // Multi-threaded WASM needs SharedArrayBuffer (COOP/COEP headers).
  // Without cross-origin isolation - e.g. on GitHub Pages - forcing
  // threads makes onnxruntime hang on iOS Safari instead of falling back.
  ort.env.wasm.numThreads = self.crossOriginIsolated
    ? (navigator.hardwareConcurrency ?? 4)
    : 1
  ort.env.wasm.wasmPaths = ONNX_CDN

  const [cfgsBuf, indexerBuf] = await Promise.all([
    loadStudioAsset('onnx/tts.json'),
    loadStudioAsset('onnx/unicode_indexer.json'),
  ])
  const cfgs = JSON.parse(new TextDecoder().decode(cfgsBuf)) as Cfgs
  const indexer = JSON.parse(new TextDecoder().decode(indexerBuf)) as number[]

  const options = { executionProviders: providers }
  const createSession = async (path: string) => {
    const buffer = await loadStudioAsset(path)
    try {
      return await ort.InferenceSession.create(new Uint8Array(buffer), options)
    } catch {
      // WebGPU init can fail per-model; retry on plain WASM.
      return await ort.InferenceSession.create(new Uint8Array(buffer), {
        executionProviders: ['wasm'],
      })
    }
  }

  const dp = await createSession('onnx/duration_predictor.onnx')
  const textEnc = await createSession('onnx/text_encoder.onnx')
  const vectorEst = await createSession('onnx/vector_estimator.onnx')
  const vocoder = await createSession('onnx/vocoder.onnx')

  return {
    ort,
    cfgs,
    indexer,
    dp,
    textEnc,
    vectorEst,
    vocoder,
    styles: new Map(),
    // With GPU acceleration the higher quality tier stays fast enough.
    steps: providers.includes('webgpu') ? 10 : 8,
  }
}

function getEngine(): Promise<Engine> {
  enginePromise ??= loadEngine().catch((error) => {
    enginePromise = null
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

async function inferChunk(
  engine: Engine,
  text: string,
  lang: string,
  style: Style,
  speed: number,
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
    new Float32Array([engine.steps]),
    [1],
  )

  // Denoising loop.
  for (let step = 0; step < engine.steps; step++) {
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
  }

  // Latent → waveform.
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
  voiceId: StudioVoiceId,
  lang: string,
  text: string,
  speed: number,
): Promise<ArrayBuffer> {
  const engine = await getEngine()
  const style = await getStyle(engine, voiceId)
  const chunks = chunkText(text, lang)
  const parts: Float32Array[] = []
  for (const chunk of chunks) {
    parts.push(await inferChunk(engine, chunk, lang, style, speed))
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
}

interface PreloadRequest {
  id: number
  type: 'preload'
  voiceId: StudioVoiceId
}

interface ResetRequest {
  id: number
  type: 'reset'
}

type Request = SynthesizeRequest | PreloadRequest | ResetRequest

// Requests are processed strictly one at a time: parallel denoising loops
// would fight over CPU/GPU without finishing any sentence sooner.
let queue: Promise<unknown> = Promise.resolve()

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data
  const task = async () => {
    if (request.type === 'reset') {
      enginePromise = null
      self.postMessage({ id: request.id, ok: true })
      return
    }
    if (request.type === 'preload') {
      try {
        const engine = await getEngine()
        await getStyle(engine, request.voiceId)
        self.postMessage({ id: request.id, ok: true })
      } catch (error) {
        self.postMessage({
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }
    try {
      const wav = await synthesize(
        request.voiceId,
        request.lang,
        request.text,
        request.speed,
      )
      // Transfer the buffer – no copy on the way back.
      self.postMessage({ id: request.id, ok: true, wav }, { transfer: [wav] })
    } catch (error) {
      self.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  queue = queue.then(task, task)
}
