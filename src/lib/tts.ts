/**
 * Sentence-by-sentence read-aloud engine with two backends:
 *
 * - 'system': Web Speech API (speechSynthesis). Short utterances avoid the
 *   Chromium bug where long utterances silently stop.
 * - 'neural': Piper voices via WASM (see neural.ts). Sentences are
 *   synthesized to WAV blobs and played through an <audio> element, with
 *   lookahead prefetch so playback stays gapless.
 */
import { prefetch, synthesize } from './neural'
import { studioPrefetch, studioSynthesize } from './supertonic/engine'
import type { AppVoice } from './voices'

export interface SpeakerEvents {
  onSentence?: (index: number) => void
  onStateChange?: (state: SpeakerState) => void
  onDone?: () => void
  onError?: (message: string) => void
}

export type SpeakerState = 'idle' | 'loading' | 'playing' | 'paused'

const VOICE_KEY = 'vorleser.voice'
const LEGACY_VOICE_KEY = 'vorleser.voiceURI'
const RATE_KEY = 'vorleser.rate'
const PREFETCH_AHEAD = 2

/** Resolves with the available system voices; waits for `voiceschanged`. */
export function loadSystemVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis
  const voices = synth.getVoices()
  if (voices.length > 0) return Promise.resolve(voices)
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve(synth.getVoices())
    }
    synth.addEventListener('voiceschanged', finish, { once: true })
    // Some browsers never fire voiceschanged – don't hang forever.
    setTimeout(finish, 1500)
  })
}

export function getSavedVoiceKey(): string | null {
  const key = localStorage.getItem(VOICE_KEY)
  if (key) return key
  const legacy = localStorage.getItem(LEGACY_VOICE_KEY)
  return legacy ? `system:${legacy}` : null
}

export function saveVoiceKey(key: string): void {
  localStorage.setItem(VOICE_KEY, key)
}

export function getSavedRate(): number {
  const value = Number(localStorage.getItem(RATE_KEY))
  return value >= 0.5 && value <= 2 ? value : 1
}

export function saveRate(rate: number): void {
  localStorage.setItem(RATE_KEY, String(rate))
}

/** First name of a voice, for the personalized preview sentence. */
function firstName(voice: AppVoice): string {
  return voice.name.split(/[\s(·]/)[0] || voice.name
}

/** Builds the "Hallo, ich bin Thorsten." preview sentence per language. */
export function previewTextFor(voice: AppVoice): string {
  const name = firstName(voice)
  // Studio voices are multilingual – greet in the app language.
  const lang = voice.lang === 'multi' ? 'de' : voice.lang.toLowerCase()
  if (lang.startsWith('de'))
    return `Hallo, ich bin ${name}. So klinge ich, wenn ich dir dein Buch vorlese.`
  if (lang.startsWith('fr'))
    return `Bonjour, je suis ${name}. Voici ma voix quand je te fais la lecture.`
  if (lang.startsWith('es'))
    return `¡Hola! Soy ${name}. Así sueno cuando te leo tu libro.`
  if (lang.startsWith('it'))
    return `Ciao, sono ${name}. Questa è la mia voce quando ti leggo il tuo libro.`
  return `Hi, I'm ${name}. This is how I sound when I read your book to you.`
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
export async function previewVoice(voice: AppVoice): Promise<void> {
  window.speechSynthesis.cancel()
  stopPreview()
  const sample = previewTextFor(voice)
  if (voice.kind === 'system') {
    const utterance = new SpeechSynthesisUtterance(sample)
    utterance.voice = voice.systemVoice
    utterance.lang = voice.lang
    window.speechSynthesis.speak(utterance)
    return
  }
  const blob =
    voice.kind === 'neural'
      ? await synthesize(voice.meta.id, sample)
      : await studioSynthesize(voice.meta.id, 'de', sample)
  stopPreview()
  const audio = new Audio(URL.createObjectURL(blob))
  previewAudio = audio
  audio.onended = () => URL.revokeObjectURL(audio.src)
  await audio.play()
}

export class Speaker {
  private sentences: string[] = []
  private index = 0
  private voice: AppVoice | null = null
  private rate = 1
  /** Detected language of the current book, used by the studio engine. */
  private langHint = 'na'
  private state: SpeakerState = 'idle'
  /** Guards against stale async callbacks after cancel/skip/stop. */
  private generation = 0
  private audio: HTMLAudioElement | null = null
  /** Index the paused neural audio belongs to, for seamless resume. */
  private audioIndex = -1
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

  setVoice(voice: AppVoice | null): void {
    const changed = this.voice?.key !== voice?.key
    this.voice = voice
    if (changed) {
      this.discardAudio()
      if (this.state === 'playing' || this.state === 'loading') {
        this.play(this.index)
      }
    }
  }

  setRate(rate: number): void {
    this.rate = rate
    if (this.audio) {
      // Neural audio adjusts live, no restart needed.
      this.audio.playbackRate = rate
    } else if (this.state === 'playing') {
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
    if (this.sentences.length === 0) return
    if (from !== undefined) {
      this.index = Math.min(Math.max(from, 0), this.sentences.length - 1)
    }
    this.generation++
    window.speechSynthesis.cancel()

    // Resume paused neural audio mid-sentence.
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
    const isBlobVoice = this.voice !== null && this.voice.kind !== 'system'
    this.setState(isBlobVoice ? 'loading' : 'playing')
    this.speakCurrent()
  }

  pause(): void {
    if (this.state !== 'playing' && this.state !== 'loading') return
    this.generation++
    window.speechSynthesis.cancel()
    if (this.audio) {
      this.audio.pause()
    }
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
    window.speechSynthesis.cancel()
    this.discardAudio()
    this.setState('idle')
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
    this.index++
    this.speakCurrent()
  }

  private speakCurrent(): void {
    const text = this.sentences[this.index]
    if (text === undefined) {
      this.setState('idle')
      this.events.onDone?.()
      return
    }
    this.events.onSentence?.(this.index)
    if (this.voice && this.voice.kind !== 'system') {
      void this.speakBlob(text)
    } else {
      this.speakSystem(text)
    }
  }

  private speakSystem(text: string): void {
    const generation = this.generation
    this.setState('playing')
    const utterance = new SpeechSynthesisUtterance(text)
    if (this.voice?.kind === 'system') {
      utterance.voice = this.voice.systemVoice
      utterance.lang = this.voice.lang
    }
    utterance.rate = this.rate
    utterance.onend = () => this.advance(generation)
    utterance.onerror = (event) => {
      // 'interrupted'/'canceled' arrive after cancel(); the generation
      // check in advance() filters those. Real errors skip the sentence.
      if (event.error === 'interrupted' || event.error === 'canceled') return
      this.advance(generation)
    }
    window.speechSynthesis.speak(utterance)
  }

  private synthesizeFor(voice: AppVoice, text: string): Promise<Blob> {
    if (voice.kind === 'neural') return synthesize(voice.meta.id, text)
    if (voice.kind === 'studio')
      return studioSynthesize(voice.meta.id, this.langHint, text)
    return Promise.reject(new Error('system voices do not synthesize blobs'))
  }

  private prefetchFor(voice: AppVoice, sentences: string[]): void {
    if (voice.kind === 'neural') prefetch(voice.meta.id, sentences)
    else if (voice.kind === 'studio')
      studioPrefetch(voice.meta.id, this.langHint, sentences)
  }

  private async speakBlob(text: string): Promise<void> {
    if (!this.voice || this.voice.kind === 'system') return
    const voice = this.voice
    const generation = this.generation
    this.setState('loading')
    let blob: Blob
    try {
      blob = await this.synthesizeFor(voice, text)
    } catch {
      if (generation !== this.generation) return
      this.events.onError?.(
        'Die Stimme konnte nicht geladen werden. Prüfe deine Internetverbindung oder lade das Stimmpaket erneut herunter.',
      )
      this.setState('paused')
      return
    }
    if (generation !== this.generation) return

    this.discardAudio()
    const audio = new Audio(URL.createObjectURL(blob))
    audio.playbackRate = this.rate
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

    this.prefetchFor(
      voice,
      this.sentences.slice(this.index + 1, this.index + 1 + PREFETCH_AHEAD),
    )
  }
}
