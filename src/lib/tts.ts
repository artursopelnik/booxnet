/**
 * Sentence-by-sentence read-aloud engine on top of the Supertonic studio
 * voices. Sentences are synthesized in a Web Worker (the UI never blocks),
 * played through an <audio> element, prefetched ahead of playback, and
 * separated by a natural pause so the reading breathes at sentence ends.
 *
 * Speed is passed to the engine natively (it stretches phoneme durations)
 * instead of speeding up the audio afterwards – no chipmunk artifacts.
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
}

const VOICE_KEY = 'vorleser.voice'
const RATE_KEY = 'vorleser.rate'
const PREFETCH_AHEAD = 2
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

/**
 * iOS Safari only allows audio started from a user gesture. Because our
 * audio arrives after an async synthesis step, we "unlock" a persistent
 * <audio> element with a silent clip synchronously inside the tap and then
 * reuse that same element for every sentence – once unlocked, it may keep
 * playing programmatically.
 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA=='

function unlockAudio(element: HTMLAudioElement): void {
  element.muted = true
  element.src = SILENT_WAV
  void element.play().catch(() => {})
  element.muted = false
}

function setBlobSrc(element: HTMLAudioElement, blob: Blob): void {
  if (element.src.startsWith('blob:')) {
    URL.revokeObjectURL(element.src)
  }
  element.src = URL.createObjectURL(blob)
}

let previewAudio: HTMLAudioElement | null = null
let previewUnlocked = false

function stopPreview(): void {
  if (previewAudio && !previewAudio.paused) {
    previewAudio.pause()
  }
}

/**
 * Speaks a short personalized sample sentence with the given voice.
 * Must be called from a user gesture (tap on the voice row).
 */
export async function previewVoice(voice: StudioVoiceMeta): Promise<void> {
  stopPreview()
  previewAudio ??= new Audio()
  if (!previewUnlocked) {
    unlockAudio(previewAudio)
    previewUnlocked = true
  }
  const blob = await studioSynthesize(
    voice.id,
    'de',
    previewTextFor(voice),
    BASE_SPEED,
  )
  stopPreview()
  setBlobSrc(previewAudio, blob)
  await previewAudio.play()
}

export class Speaker {
  private sentences: string[] = []
  private pauses: number[] = []
  private index = 0
  private voice: StudioVoiceMeta | null = null
  private rate = 1
  /** Detected language of the current book; German until detection ran. */
  private langHint = 'de'
  private state: SpeakerState = 'idle'
  /** Guards against stale async callbacks after pause/skip/stop. */
  private generation = 0
  /** One persistent element, unlocked once via user gesture (iOS Safari). */
  private audioEl: HTMLAudioElement | null = null
  private unlocked = false
  /** Index the paused audio belongs to, for seamless mid-sentence resume. */
  private audioIndex = -1
  private pauseTimer: ReturnType<typeof setTimeout> | null = null
  private events: SpeakerEvents

  constructor(events: SpeakerEvents = {}) {
    this.events = events
  }

  setSentences(items: SentenceInput[]): void {
    this.sentences = items.map((item) => item.text)
    this.pauses = items.map((item) => item.pauseAfter ?? SENTENCE_PAUSE_MS)
    this.discardAudio()
  }

  setLangHint(lang: string): void {
    this.langHint = lang
  }

  setVoice(voice: StudioVoiceMeta | null): void {
    const changed = this.voice?.id !== voice?.id
    this.voice = voice
    if (changed) {
      this.discardAudio()
      if (this.state === 'playing' || this.state === 'loading') {
        this.play(this.index)
      }
    }
  }

  setRate(rate: number): void {
    if (this.rate === rate) return
    this.rate = rate
    // Speed is baked into the synthesis, so the current sentence restarts
    // with the new tempo when playing.
    if (this.state === 'playing' || this.state === 'loading') {
      this.play(this.index)
    } else {
      this.discardAudio()
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

    // Unlock synchronously inside the user gesture – the actual sentence
    // audio arrives only after async synthesis, which iOS would block.
    const element = this.ensureAudioElement()
    if (!this.unlocked) {
      unlockAudio(element)
      this.unlocked = true
    }

    // Resume paused audio mid-sentence.
    if (
      this.state === 'paused' &&
      this.audioIndex === this.index &&
      element.src.startsWith('blob:')
    ) {
      this.setState('playing')
      void element.play().catch(() => this.speakCurrent())
      return
    }

    this.stopAudio()
    this.setState('loading')
    void this.speakCurrent()
  }

  pause(): void {
    if (this.state !== 'playing' && this.state !== 'loading') return
    this.generation++
    this.clearPauseTimer()
    this.audioEl?.pause()
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
      this.discardAudio()
    }
  }

  stop(): void {
    this.generation++
    this.clearPauseTimer()
    this.discardAudio()
    this.setState('idle')
  }

  private clearPauseTimer(): void {
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer)
      this.pauseTimer = null
    }
  }

  private ensureAudioElement(): HTMLAudioElement {
    if (!this.audioEl) {
      this.audioEl = new Audio()
      this.audioEl.preload = 'auto'
    }
    return this.audioEl
  }

  /** Stops playback but keeps the (unlocked) element for reuse. */
  private stopAudio(): void {
    if (this.audioEl) {
      this.audioEl.pause()
    }
    this.audioIndex = -1
  }

  private discardAudio(): void {
    this.stopAudio()
    if (this.audioEl?.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.audioEl.src)
      this.audioEl.removeAttribute('src')
    }
  }

  private setState(state: SpeakerState): void {
    if (this.state === state) return
    this.state = state
    this.events.onStateChange?.(state)
  }

  private advance(generation: number): void {
    if (generation !== this.generation) return
    if (this.state !== 'playing' && this.state !== 'loading') return
    if (this.index >= this.sentences.length - 1) {
      this.discardAudio()
      this.setState('idle')
      this.events.onDone?.()
      return
    }
    // Natural pause at the sentence end: per-sentence length (longer at
    // paragraph/page breaks), scaled with the tempo, with a little jitter
    // so the rhythm doesn't feel metronomic.
    const base = this.pauses[this.index] ?? SENTENCE_PAUSE_MS
    const jitter = 0.85 + Math.random() * 0.3
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null
      if (generation !== this.generation) return
      if (this.state !== 'playing' && this.state !== 'loading') return
      this.index++
      void this.speakCurrent()
    }, (base * jitter) / this.rate)
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
    const speed = engineSpeed(this.rate)

    this.setState('loading')
    let blob: Blob
    try {
      blob = await studioSynthesize(voice.id, this.langHint, text, speed)
    } catch {
      if (generation !== this.generation) return
      this.events.onError?.(
        'Die Stimme konnte nicht geladen werden. Prüfe deine Internetverbindung oder lade das Sprachmodell erneut herunter.',
      )
      this.setState('paused')
      return
    }
    if (generation !== this.generation) return

    const element = this.ensureAudioElement()
    element.pause()
    element.onended = () => this.advance(generation)
    element.onerror = () => {
      if (generation === this.generation) this.advance(generation)
    }
    setBlobSrc(element, blob)
    this.audioIndex = this.index
    this.setState('playing')
    try {
      await element.play()
    } catch {
      if (generation !== this.generation) return
      this.setState('paused')
      return
    }

    studioPrefetch(
      voice.id,
      this.langHint,
      this.sentences.slice(this.index + 1, this.index + 1 + PREFETCH_AHEAD),
      speed,
    )
  }
}
