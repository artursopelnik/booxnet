/**
 * Sentence-by-sentence read-aloud engine on top of the Supertonic studio
 * voices. Sentences are synthesized in a Web Worker (the UI never blocks),
 * prefetched ahead of playback and separated by natural pauses.
 *
 * Playback uses the Web Audio API with one shared AudioContext that is
 * resumed inside the user's tap. Unlike <audio>.play(), starting buffer
 * sources on a running context is never blocked by iOS Safari – this is
 * what keeps sentence N+1 playing without another tap.
 */
import { studioPrefetch, studioSynthesize } from './supertonic/client'
import type { StudioVoiceMeta } from './voices'

export interface SpeakerEvents {
  onSentence?: (index: number) => void
  onStateChange?: (state: SpeakerState) => void
  onDone?: () => void
  onError?: (message: string) => void
}

export type SpeakerState = 'idle' | 'loading' | 'playing' | 'paused'

/** One unit of speech plus the pause that follows it. */
export interface SentenceInput {
  text: string
  /** Pause after this sentence at 1× speed; defaults to SENTENCE_PAUSE_MS. */
  pauseAfter?: number
  /** Not worth reading aloud (page numbers, ornaments) – skipped. */
  skip?: boolean
}

const VOICE_KEY = 'vorleser.voice'
const RATE_KEY = 'vorleser.rate'
const PREFETCH_AHEAD = 3
/** Pause between sentences at 1× speed. */
const SENTENCE_PAUSE_MS = 350
/** Supertonic's recommended neutral speed. */
const BASE_SPEED = 1.05

/** Maps the user rate (0.5–2) to the engine's supported speed range. */
export function engineSpeed(rate: number): number {
  return Math.min(2, Math.max(0.7, Math.round(rate * BASE_SPEED * 100) / 100))
}

export function getSavedVoiceId(): string | null {
  const key = localStorage.getItem(VOICE_KEY)
  // Stored as "studio:<id>"; older system/neural keys fall through to null.
  return key?.startsWith('studio:') ? key.slice('studio:'.length) : null
}

export function saveVoiceId(id: string): void {
  localStorage.setItem(VOICE_KEY, `studio:${id}`)
}

export function getSavedRate(): number {
  const value = Number(localStorage.getItem(RATE_KEY))
  return value >= 0.5 && value <= 2 ? value : 1
}

export function saveRate(rate: number): void {
  localStorage.setItem(RATE_KEY, String(rate))
}

/** Builds the "Hallo, ich bin Alex." preview sentence. */
export function previewTextFor(voice: StudioVoiceMeta): string {
  return `Hallo, ich bin ${voice.name}. So klinge ich, wenn ich dir dein Buch vorlese.`
}

/* ---------------------------------------------------------------- audio */

let sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    sharedCtx = new Ctor()
  }
  return sharedCtx
}

/**
 * Must be called synchronously inside a user gesture once: resumes the
 * context and plays a one-sample silent buffer so iOS marks it as
 * user-activated.
 */
function unlockAudioContext(): void {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }
  const buffer = ctx.createBuffer(1, 1, 22050)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start(0)
}

async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const data = await blob.arrayBuffer()
  return getAudioContext().decodeAudioData(data)
}

/* -------------------------------------------------------------- preview */

let previewSource: AudioBufferSourceNode | null = null

function stopPreview(): void {
  if (previewSource) {
    previewSource.onended = null
    try {
      previewSource.stop()
    } catch {
      // Already stopped.
    }
    previewSource = null
  }
}

/**
 * Speaks a short personalized sample sentence with the given voice.
 * Must be called from a user gesture (tap on the voice row).
 */
export async function previewVoice(voice: StudioVoiceMeta): Promise<void> {
  unlockAudioContext()
  stopPreview()
  const blob = await studioSynthesize(
    voice.id,
    'de',
    previewTextFor(voice),
    BASE_SPEED,
  )
  const buffer = await decodeBlob(blob)
  stopPreview()
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  previewSource = source
  source.start()
  await new Promise<void>((resolve) => {
    source.onended = () => resolve()
  })
}

/* -------------------------------------------------------------- speaker */

export class Speaker {
  private sentences: string[] = []
  private pauses: number[] = []
  private skips: boolean[] = []
  private index = 0
  private voice: StudioVoiceMeta | null = null
  private rate = 1
  /** Detected language of the current book. */
  private langHint = 'na'
  private state: SpeakerState = 'idle'
  /** Guards against stale async callbacks after pause/skip/stop. */
  private generation = 0
  private source: AudioBufferSourceNode | null = null
  /** Index the paused source belongs to, for mid-sentence resume. */
  private sourceIndex = -1
  private pauseTimer: ReturnType<typeof setTimeout> | null = null
  private events: SpeakerEvents

  constructor(events: SpeakerEvents = {}) {
    this.events = events
  }

  setSentences(items: SentenceInput[]): void {
    this.sentences = items.map((item) => item.text)
    this.pauses = items.map((item) => item.pauseAfter ?? SENTENCE_PAUSE_MS)
    this.skips = items.map((item) => item.skip ?? false)
    this.stopSource()
  }

  setLangHint(lang: string): void {
    this.langHint = lang
  }

  setVoice(voice: StudioVoiceMeta | null): void {
    const changed = this.voice?.id !== voice?.id
    this.voice = voice
    if (changed && (this.state === 'playing' || this.state === 'loading')) {
      this.play(this.index)
    }
  }

  setRate(rate: number): void {
    if (this.rate === rate) return
    this.rate = rate
    // Speed is baked into the synthesis, so the current sentence restarts
    // with the new tempo when playing.
    if (this.state === 'playing' || this.state === 'loading') {
      this.play(this.index)
    }
  }

  getState(): SpeakerState {
    return this.state
  }

  getIndex(): number {
    return this.index
  }

  play(from?: number): void {
    if (this.sentences.length === 0 || !this.voice) return
    if (from !== undefined) {
      this.index = Math.min(Math.max(from, 0), this.sentences.length - 1)
    }
    this.generation++
    this.clearPauseTimer()
    // Inside the user gesture: resume/unlock the context.
    unlockAudioContext()

    // Resume paused audio mid-sentence.
    if (
      this.state === 'paused' &&
      this.source &&
      this.sourceIndex === this.index
    ) {
      this.setState('playing')
      void getAudioContext().resume()
      return
    }

    this.stopSource()
    this.setState('loading')
    void this.speakCurrent()
  }

  pause(): void {
    if (this.state !== 'playing' && this.state !== 'loading') return
    this.generation++
    this.clearPauseTimer()
    // Suspending freezes the current source so play() can resume it.
    void getAudioContext().suspend()
    this.setState('paused')
  }

  toggle(): void {
    if (this.state === 'playing' || this.state === 'loading') this.pause()
    else this.play()
  }

  skip(delta: number): void {
    this.jumpTo(this.index + delta)
  }

  jumpTo(index: number): void {
    this.index = Math.min(Math.max(index, 0), this.sentences.length - 1)
    this.events.onSentence?.(this.index)
    if (this.state === 'playing' || this.state === 'loading') {
      this.play(this.index)
    } else {
      this.stopSource()
    }
  }

  stop(): void {
    this.generation++
    this.clearPauseTimer()
    this.stopSource()
    this.setState('idle')
  }

  private clearPauseTimer(): void {
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer)
      this.pauseTimer = null
    }
  }

  private stopSource(): void {
    if (this.source) {
      this.source.onended = null
      try {
        this.source.stop()
      } catch {
        // Already stopped.
      }
      this.source = null
    }
    this.sourceIndex = -1
    // A suspended context would silently swallow the next start().
    const ctx = sharedCtx
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume()
    }
  }

  private setState(state: SpeakerState): void {
    if (this.state === state) return
    this.state = state
    this.events.onStateChange?.(state)
  }

  private scheduleNext(generation: number, delayMs: number): void {
    if (generation !== this.generation) return
    if (this.state !== 'playing' && this.state !== 'loading') return
    if (this.index >= this.sentences.length - 1) {
      this.stopSource()
      this.setState('idle')
      this.events.onDone?.()
      return
    }
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null
      if (generation !== this.generation) return
      if (this.state !== 'playing' && this.state !== 'loading') return
      this.index++
      void this.speakCurrent()
    }, delayMs)
  }

  private advance(generation: number): void {
    // Natural pause at the sentence end: per-sentence length (longer at
    // paragraph/page breaks), scaled with the tempo, with a little jitter
    // so the rhythm doesn't feel metronomic.
    const base = this.pauses[this.index] ?? SENTENCE_PAUSE_MS
    const jitter = 0.85 + Math.random() * 0.3
    this.scheduleNext(generation, (base * jitter) / this.rate)
  }

  /** Upcoming sentences worth synthesizing, for the prefetch warm-up. */
  private upcoming(count: number): string[] {
    const result: string[] = []
    for (let i = this.index + 1; i < this.sentences.length; i++) {
      if (this.skips[i]) continue
      result.push(this.sentences[i])
      if (result.length >= count) break
    }
    return result
  }

  private async speakCurrent(): Promise<void> {
    const voice = this.voice
    const text = this.sentences[this.index]
    if (!voice || text === undefined) {
      this.setState('idle')
      this.events.onDone?.()
      return
    }
    this.events.onSentence?.(this.index)
    const generation = this.generation

    // Page numbers, ornaments etc. are skipped near-instantly.
    if (this.skips[this.index]) {
      this.setState('playing')
      this.scheduleNext(generation, 60)
      return
    }

    const speed = engineSpeed(this.rate)
    this.setState('loading')
    let buffer: AudioBuffer
    try {
      const blob = await studioSynthesize(
        voice.id,
        this.langHint,
        text,
        speed,
      )
      if (generation !== this.generation) return
      buffer = await decodeBlob(blob)
    } catch {
      if (generation !== this.generation) return
      this.events.onError?.(
        'Die Stimme konnte nicht geladen werden. Prüfe deine Internetverbindung oder lade das Sprachmodell erneut herunter.',
      )
      this.setState('paused')
      return
    }
    if (generation !== this.generation) return

    this.stopSource()
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        // start() below still works once the context recovers.
      }
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.onended = () => this.advance(generation)
    this.source = source
    this.sourceIndex = this.index
    this.setState('playing')
    source.start()

    studioPrefetch(voice.id, this.langHint, this.upcoming(PREFETCH_AHEAD), speed)
  }
}
