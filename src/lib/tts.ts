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

let previewAudio: HTMLAudioElement | null = null

function stopPreview(): void {
  if (previewAudio) {
    previewAudio.pause()
    URL.revokeObjectURL(previewAudio.src)
    previewAudio = null
  }
}

/** Speaks a short personalized sample sentence with the given voice. */
export async function previewVoice(voice: StudioVoiceMeta): Promise<void> {
  stopPreview()
  const blob = await studioSynthesize(
    voice.id,
    'de',
    previewTextFor(voice),
    BASE_SPEED,
  )
  stopPreview()
  const audio = new Audio(URL.createObjectURL(blob))
  previewAudio = audio
  audio.onended = () => URL.revokeObjectURL(audio.src)
  await audio.play()
}

export class Speaker {
  private sentences: string[] = []
  private index = 0
  private voice: StudioVoiceMeta | null = null
  private rate = 1
  /** Detected language of the current book. */
  private langHint = 'na'
  private state: SpeakerState = 'idle'
  /** Guards against stale async callbacks after pause/skip/stop. */
  private generation = 0
  private audio: HTMLAudioElement | null = null
  /** Index the paused audio belongs to, for seamless mid-sentence resume. */
  private audioIndex = -1
  private pauseTimer: ReturnType<typeof setTimeout> | null = null
  private events: SpeakerEvents

  constructor(events: SpeakerEvents = {}) {
    this.events = events
  }

  setSentences(sentences: string[]): void {
    this.sentences = sentences
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

    // Resume paused audio mid-sentence.
    if (
      this.state === 'paused' &&
      this.audio &&
      this.audioIndex === this.index
    ) {
      this.setState('playing')
      void this.audio.play().catch(() => this.speakCurrent())
      return
    }

    this.discardAudio()
    this.setState('loading')
    void this.speakCurrent()
  }

  pause(): void {
    if (this.state !== 'playing' && this.state !== 'loading') return
    this.generation++
    this.clearPauseTimer()
    this.audio?.pause()
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

  private discardAudio(): void {
    if (this.audio) {
      this.audio.pause()
      URL.revokeObjectURL(this.audio.src)
      this.audio = null
    }
    this.audioIndex = -1
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
    // Natural breathing pause at the sentence end, scaled with the tempo.
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null
      if (generation !== this.generation) return
      if (this.state !== 'playing' && this.state !== 'loading') return
      this.index++
      void this.speakCurrent()
    }, SENTENCE_PAUSE_MS / this.rate)
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

    this.discardAudio()
    const audio = new Audio(URL.createObjectURL(blob))
    audio.onended = () => this.advance(generation)
    audio.onerror = () => this.advance(generation)
    this.audio = audio
    this.audioIndex = this.index
    this.setState('playing')
    try {
      await audio.play()
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
