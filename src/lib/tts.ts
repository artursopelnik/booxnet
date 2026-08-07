/**
 * Thin controller around the Web Speech API (speechSynthesis).
 *
 * Speaks sentence by sentence: short utterances avoid the Chromium bug where
 * long utterances silently stop, and give us a natural highlight/resume unit.
 */

export interface SpeakerEvents {
  onSentence?: (index: number) => void
  onStateChange?: (state: SpeakerState) => void
  onDone?: () => void
}

export type SpeakerState = 'idle' | 'playing' | 'paused'

const VOICE_KEY = 'vorleser.voiceURI'
const RATE_KEY = 'vorleser.rate'

/** Resolves with the available voices; waits for `voiceschanged` if needed. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
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

export function getSavedVoiceURI(): string | null {
  return localStorage.getItem(VOICE_KEY)
}

export function saveVoiceURI(uri: string): void {
  localStorage.setItem(VOICE_KEY, uri)
}

export function getSavedRate(): number {
  const value = Number(localStorage.getItem(RATE_KEY))
  return value >= 0.5 && value <= 2 ? value : 1
}

export function saveRate(rate: number): void {
  localStorage.setItem(RATE_KEY, String(rate))
}

/** Speaks a single sample sentence, e.g. to preview a voice. */
export function previewVoice(voice: SpeechSynthesisVoice): void {
  const synth = window.speechSynthesis
  synth.cancel()
  const sample = voice.lang.toLowerCase().startsWith('de')
    ? 'Hallo! So klinge ich, wenn ich dir dein Buch vorlese.'
    : 'Hello! This is how I sound when I read your book to you.'
  const utterance = new SpeechSynthesisUtterance(sample)
  utterance.voice = voice
  utterance.lang = voice.lang
  synth.speak(utterance)
}

export class Speaker {
  private sentences: string[] = []
  private index = 0
  private voice: SpeechSynthesisVoice | null = null
  private rate = 1
  private state: SpeakerState = 'idle'
  /** Guards against stale onend callbacks after cancel(). */
  private generation = 0
  private events: SpeakerEvents

  constructor(events: SpeakerEvents = {}) {
    this.events = events
  }

  setSentences(sentences: string[]): void {
    this.sentences = sentences
  }

  setVoice(voice: SpeechSynthesisVoice | null): void {
    this.voice = voice
    if (this.state === 'playing') this.play(this.index)
  }

  setRate(rate: number): void {
    this.rate = rate
    if (this.state === 'playing') this.play(this.index)
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
    window.speechSynthesis.cancel()
    this.generation++
    this.setState('playing')
    this.speakCurrent()
  }

  pause(): void {
    if (this.state !== 'playing') return
    // cancel() instead of pause(): resume() is unreliable across engines,
    // and restarting the current sentence is a better experience anyway.
    this.generation++
    window.speechSynthesis.cancel()
    this.setState('paused')
  }

  toggle(): void {
    if (this.state === 'playing') this.pause()
    else this.play()
  }

  skip(delta: number): void {
    const target = Math.min(
      Math.max(this.index + delta, 0),
      this.sentences.length - 1,
    )
    this.index = target
    this.events.onSentence?.(target)
    if (this.state === 'playing') this.play(target)
  }

  jumpTo(index: number): void {
    this.index = Math.min(Math.max(index, 0), this.sentences.length - 1)
    this.events.onSentence?.(this.index)
    if (this.state === 'playing') this.play(this.index)
  }

  stop(): void {
    this.generation++
    window.speechSynthesis.cancel()
    this.setState('idle')
  }

  private setState(state: SpeakerState): void {
    this.state = state
    this.events.onStateChange?.(state)
  }

  private speakCurrent(): void {
    const generation = this.generation
    const text = this.sentences[this.index]
    if (text === undefined) {
      this.setState('idle')
      this.events.onDone?.()
      return
    }
    this.events.onSentence?.(this.index)

    const utterance = new SpeechSynthesisUtterance(text)
    if (this.voice) {
      utterance.voice = this.voice
      utterance.lang = this.voice.lang
    }
    utterance.rate = this.rate

    const advance = () => {
      if (generation !== this.generation || this.state !== 'playing') return
      if (this.index >= this.sentences.length - 1) {
        this.setState('idle')
        this.events.onDone?.()
        return
      }
      this.index++
      this.speakCurrent()
    }
    utterance.onend = advance
    utterance.onerror = (event) => {
      // 'interrupted'/'canceled' arrive after cancel(); the generation
      // check in advance() filters those. Real errors skip the sentence.
      if (event.error === 'interrupted' || event.error === 'canceled') return
      advance()
    }
    window.speechSynthesis.speak(utterance)
  }
}
