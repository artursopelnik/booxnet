/**
 * Sentence-by-sentence read-aloud engine on top of the Supertonic studio
 * voices. Sentences are synthesized in a Web Worker (the UI never blocks),
 * prefetched ahead of playback and separated by natural pauses.
 *
 * Die Ausgabe laeuft ueber ein Medien-Element (siehe audioOutput.ts),
 * damit das Vorlesen im Hintergrund weiterlaeuft und auf dem
 * Sperrbildschirm steuerbar ist. Nur das kurze Probehoeren in der
 * Stimmen-Auswahl nutzt weiterhin Web Audio – es laeuft ohnehin nur im
 * Vordergrund und darf die Medien-Anmeldung des Buchs nicht ueberschreiben.
 */
import {
  studioSynthesize,
  TTS_CANCELLED_ERROR,
  TTS_TIMEOUT_ERROR,
} from './supertonic/client'
import {
  hasPausedAudio,
  pauseAudioOutput,
  playAudioBlob,
  resumeAudioOutput,
  setMediaSessionState,
  setupMediaSession,
  stopAudioOutput,
  unlockAudioOutput,
  updateMediaSessionInfo,
  withTrailingSilence,
} from './audioOutput'
import { hasAsset, readAsset, writeAsset } from './supertonic/opfs'
import { readNumberSetting, readSetting, writeSetting } from './storage'
import {
  hasCachedSentence,
  readCachedSentence,
  writeCachedSentence,
} from './supertonic/sentenceCache'
import type { StudioVoiceId, StudioVoiceMeta } from './voices'

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
// Tiefer Puffer: Auch wenn das Gerät zwischendurch langsamer rechnet
// (z. B. thermisch gedrosselt nach längerem Hören) oder mehrere kurze
// Sätze schnell hintereinander abgespielt werden, reißt der Vorrat nicht
// ab. Kostet nur wenige MB Arbeitsspeicher (~0,5 MB pro Satz).
const PREFETCH_AHEAD = 8
/**
 * Wie oft ein verdraengter Satz erneut angefordert wird, bevor die App
 * aufgibt und den Nutzer fragt. Drei Anlaeufe decken schnelles Tippen ab,
 * ohne dass eine Dauerverdraengung zur Endlosschleife wird.
 */
const MAX_DISPLACEMENT_RETRIES = 3
/** Pause between sentences at 1× speed. */
const SENTENCE_PAUSE_MS = 350
/** Supertonic's recommended neutral speed. */
const BASE_SPEED = 1.05

/**
 * Legt die kommenden Sätze dauerhaft im Speicher ab, damit der nächste
 * App-Start sofort losspielen kann, statt auf die Engine zu warten.
 * Bereits abgelegte Sätze werden übersprungen – die kosten dann gar
 * keine Rechenzeit mehr. Fire-and-forget.
 *
 * Bewusst nacheinander statt alles auf einmal einzureihen: Der Worker
 * rechnet ohnehin seriell, und ohne Rückstau muss ein Play-Druck weniger
 * verdrängen. Ein neuer Aufruf (Tempo- oder Stimmwechsel, neue Position)
 * beendet den vorigen Durchlauf, damit keine veralteten Sätze nachlaufen.
 */
let prefetchGeneration = 0

export function prefetchSentences(
  voiceId: StudioVoiceId,
  lang: string,
  texts: string[],
  speed: number,
): void {
  const generation = ++prefetchGeneration
  void (async () => {
    for (const text of texts) {
      if (generation !== prefetchGeneration) return
      try {
        if (await hasCachedSentence(voiceId, lang, speed, text)) continue
        const blob = await studioSynthesize(voiceId, lang, text, speed, false)
        // Bewusst OHNE Generations-Prüfung: Ein fertig gerechneter Satz
        // ist gültig, auch wenn inzwischen ein neuer Durchlauf begonnen
        // hat (bei jedem Satzwechsel der Fall). Ihn wegzuwerfen hieße,
        // die Rechenzeit zu verschenken und den Speicher leer zu lassen.
        await writeCachedSentence(
          voiceId,
          lang,
          speed,
          text,
          await blob.arrayBuffer(),
        )
      } catch {
        // Verdrängt oder fehlgeschlagen: Der Satz wird beim Abspielen
        // notfalls neu gerechnet.
      }
    }
  })()
}

/** Maps the user rate (0.5–2) to the engine's supported speed range. */
export function engineSpeed(rate: number): number {
  return Math.min(2, Math.max(0.7, Math.round(rate * BASE_SPEED * 100) / 100))
}

export function getSavedVoiceId(): string | null {
  const key = readSetting(VOICE_KEY)
  // Stored as "studio:<id>"; older system/neural keys fall through to null.
  return key?.startsWith('studio:') ? key.slice('studio:'.length) : null
}

export function saveVoiceId(id: string): void {
  writeSetting(VOICE_KEY, `studio:${id}`)
}

export function getSavedRate(): number {
  return readNumberSetting(RATE_KEY, 0.5, 2, 1)
}

export function saveRate(rate: number): void {
  writeSetting(RATE_KEY, String(rate))
}

/** Builds the "Hallo, ich bin Alex." preview sentence. */
export function previewTextFor(voice: StudioVoiceMeta): string {
  return `Hallo, ich bin ${voice.name}. So klinge ich, wenn ich dir dein Buch vorlese.`
}

/**
 * Fertig gerenderte Begrüßungen liegen dauerhaft in OPFS (neben den
 * Modellen, werden mit "Sprachmodell löschen" zusammen entfernt) – das
 * Probehören spielt dann sofort ab statt erst zu rechnen. Bei Änderungen
 * am Vorschautext, an Stimmennamen oder an der Vorschau-Qualität die
 * Version hochzählen, damit alte Dateien verfallen.
 * v3: F2 heißt Martina statt Michaela.
 */
const PREVIEW_CACHE_VERSION = 'v3'

/**
 * Die Begrüßung wird nur einmal gerechnet und dauerhaft gespeichert, die
 * Rechenzeit fällt also kein zweites Mal an. Deshalb steht hier ein
 * eigener Wert, auch wenn er derzeit dem des Vorlesens entspricht: Wird
 * die Qualität des Vorlesens aus Tempogründen gesenkt, soll die
 * Vorstellung davon unberührt bleiben.
 */
const PREVIEW_SYNTH_STEPS = 6

function previewAssetPath(voice: StudioVoiceMeta): string {
  return `previews/${PREVIEW_CACHE_VERSION}-${voice.id}.wav`
}

async function renderPreview(
  voice: StudioVoiceMeta,
  priority: boolean,
): Promise<Blob> {
  const blob = await studioSynthesize(
    voice.id,
    'de',
    previewTextFor(voice),
    BASE_SPEED,
    priority,
    PREVIEW_SYNTH_STEPS,
    'preview',
  )
  // Persistieren best-effort – das Abspielen wartet nicht darauf.
  void blob
    .arrayBuffer()
    .then((buffer) => writeAsset(previewAssetPath(voice), buffer))
    .catch(() => {})
  return blob
}

let previewsWarming = false

/**
 * Rendert fehlende Begrüßungen im Hintergrund in den OPFS-Cache, z. B.
 * direkt nach dem Sprachpaket-Download oder beim Öffnen der
 * Stimmen-Auswahl. Fire-and-forget; läuft hinter aktiver Wiedergabe in
 * der Warteschlange und holt Abgebrochenes beim nächsten Aufruf nach.
 */
export function warmVoicePreviews(voices: StudioVoiceMeta[]): void {
  if (previewsWarming) return
  previewsWarming = true
  void (async () => {
    try {
      for (const voice of voices) {
        try {
          if (await hasAsset(previewAssetPath(voice))) continue
          await renderPreview(voice, false)
        } catch (error) {
          // Verdrängt durch einen Play-Druck: Der Nutzer braucht die
          // Engine JETZT – ganz aufhören statt die Warteschlange sofort
          // wieder mit langen Renderings zu füllen. Nächster Anlauf beim
          // nächsten Öffnen der Stimmen-Auswahl.
          if (error instanceof Error && error.name === TTS_CANCELLED_ERROR) {
            return
          }
          // Anderer Fehler: nächste Stimme versuchen.
        }
      }
    } finally {
      previewsWarming = false
    }
  })()
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
 * Bewusst DIREKTE Web-Audio-Ausgabe: Der Umweg über MediaStream +
 * <audio>-Element (um den iOS-Lautlos-Schalter wie eine Hörbuch-App zu
 * umgehen) erzeugte beim Pausieren/Fortsetzen und Stimmenwechsel ein
 * hängendes Stotter-Geräusch, das erst ein App-Neustart beendete.
 * Konsequenz: Bei stummgeschaltetem iPhone bleibt die Stimme lautlos –
 * die Willkommensseite weist darauf hin (Stummschalter aus oder
 * Kopfhörer nutzen); erkennen lässt sich der Schalter aus dem Web nicht.
 *
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
  // Fertig gespeicherte Begrüßung spielt sofort – ohne Engine-Rechnung.
  const cached = await readAsset(previewAssetPath(voice)).catch(() => null)
  const blob = cached
    ? new Blob([cached], { type: 'audio/wav' })
    : await renderPreview(voice, true)
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
  /** Detected language of the current book; German until detection ran. */
  private langHint = 'de'
  private state: SpeakerState = 'idle'
  /** Guards against stale async callbacks after pause/skip/stop. */
  private generation = 0
  /** Satz, zu dem das angehaltene Medien-Element gehoert. */
  private pausedIndex = -1
  private pauseTimer: ReturnType<typeof setTimeout> | null = null
  private events: SpeakerEvents
  /** Fuer die Anzeige auf dem Sperrbildschirm. */
  private title = ''
  private cover: string | undefined

  constructor(events: SpeakerEvents = {}) {
    this.events = events
    setupMediaSession({
      onPlay: () => this.play(),
      onPause: () => this.pause(),
      onNext: () => this.skip(1),
      onPrevious: () => this.skip(-1),
    })
  }

  /** Buchangaben fuer den Sperrbildschirm. */
  setBookInfo(title: string, cover?: string): void {
    this.title = title
    this.cover = cover
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
    // Das Tempo ist in die Synthese eingebacken. Den laufenden Satz neu zu
    // berechnen hieße aber: Wiedergabe stoppt und der Nutzer wartet
    // sekundenlang auf die Neuberechnung. Deshalb spielt der aktuelle Satz
    // hörbar weiter und das neue Tempo greift ab dem nächsten Satz – die
    // kommenden Sätze werden sofort im neuen Tempo vorausberechnet.
    if (this.state === 'loading') {
      // Noch nichts hörbar – direkt im neuen Tempo starten.
      this.play(this.index)
    } else if (this.state === 'playing' && this.voice) {
      prefetchSentences(
        this.voice.id,
        this.langHint,
        this.upcoming(PREFETCH_AHEAD),
        engineSpeed(rate),
      )
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
    // Muss synchron in der Geste passieren, sonst blockiert iOS jedes
    // spaetere Abspielen.
    unlockAudioOutput()
    if (this.voice) {
      updateMediaSessionInfo(this.title, this.voice.name, this.cover)
    }

    // Mitten im Satz angehalten: einfach weiterlaufen lassen. Das
    // Medien-Element merkt sich die Stelle selbst.
    if (this.state === 'paused' && this.pausedIndex === this.index &&
        hasPausedAudio()) {
      this.setState('playing')
      setMediaSessionState('playing')
      void resumeAudioOutput().catch(() => {
        // Konnte nicht fortsetzen – Satz neu abspielen.
        void this.speakCurrent()
      })
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
    pauseAudioOutput()
    this.pausedIndex = this.index
    this.setState('paused')
    setMediaSessionState('paused')
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
    setMediaSessionState('none')
  }

  private clearPauseTimer(): void {
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer)
      this.pauseTimer = null
    }
  }

  private stopSource(): void {
    stopAudioOutput()
    this.pausedIndex = -1
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
      setMediaSessionState('none')
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

  /**
   * Die Sprechpause steckt bereits als Stille am Ende der Audiodatei
   * (siehe silenceAfter), deshalb geht es hier ohne Verzoegerung weiter.
   * Ein Zeitgeber an dieser Stelle wuerde im Hintergrund gedrosselt und
   * das Medien-Element still stehen lassen – dann gaebe das
   * Betriebssystem die Tonsitzung frei und die Wiedergabe endet.
   */
  private advance(generation: number): void {
    this.scheduleNext(generation, 0)
  }

  /**
   * Laenge der Pause nach dem aktuellen Satz in Sekunden: laenger an
   * Absatz- und Seitengrenzen, mit dem Tempo skaliert und leicht
   * schwankend, damit der Rhythmus nicht wie ein Metronom wirkt.
   */
  private silenceAfter(): number {
    const base = this.pauses[this.index] ?? SENTENCE_PAUSE_MS
    const jitter = 0.85 + Math.random() * 0.3
    return (base * jitter) / this.rate / 1000
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

  /**
   * `attempt` zaehlt Wiederholungen nach einer Verdraengung: Ein
   * Play-Druck verdraengt laufende Berechnungen, und derselbe Satz wird
   * danach neu angefordert. Ohne Obergrenze koennte sich das bei
   * schnellen Stimm-/Tempowechseln endlos im Kreis drehen.
   */
  private async speakCurrent(attempt = 0): Promise<void> {
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
    let audio: Blob
    try {
      // Erst der dauerhafte Speicher: Liegt der Satz dort schon fertig,
      // spielt er sofort – ohne auf das Laden der Engine zu warten. Genau
      // das macht den Kaltstart unsichtbar.
      const stored = await readCachedSentence(
        voice.id,
        this.langHint,
        speed,
        text,
      )
      if (generation !== this.generation) return
      // Immer volle Qualität – auch wenn der Nutzer aktiv wartet. War der
      // Satz schon vorausberechnet, greift ohnehin der Cache.
      const blob = stored
        ? new Blob([stored], { type: 'audio/wav' })
        : await studioSynthesize(voice.id, this.langHint, text, speed, true)
      if (generation !== this.generation) return
      // Sprechpause direkt anhaengen statt sie spaeter abzuwarten – so
      // laeuft das Medien-Element durch und behaelt im Hintergrund die
      // Tonsitzung.
      audio = await withTrailingSilence(blob, this.silenceAfter())
    } catch (error) {
      if (generation !== this.generation) return
      // Verdrängt, obwohl weiterhin gewollt (gleiche Generation): erneut
      // anfordern statt für immer im Ladezustand hängen zu bleiben.
      if (error instanceof Error && error.name === TTS_CANCELLED_ERROR) {
        if (attempt < MAX_DISPLACEMENT_RETRIES) {
          void this.speakCurrent(attempt + 1)
          return
        }
        this.events.onError?.(
          'Die Wiedergabe wurde mehrfach unterbrochen. Tippe erneut auf Play.',
        )
        this.setState('paused')
        return
      }
      // Die Synthese läuft komplett lokal – ein Timeout heißt "Gerät zu
      // langsam / beschäftigt", nie "Internet weg". Nur wenn wirklich
      // etwas fehlt oder kaputt ist, hilft ein erneuter Modell-Download.
      const timedOut =
        error instanceof Error && error.name === TTS_TIMEOUT_ERROR
      this.events.onError?.(
        timedOut
          ? 'Dein Gerät hat für diesen Satz ungewöhnlich lange gebraucht. Tippe erneut auf Play, es geht an derselben Stelle weiter.'
          : 'Die Stimme konnte nicht erzeugt werden. Falls das wiederholt passiert, lade das Sprachmodell in der Stimmen-Auswahl erneut herunter.',
      )
      this.setState('paused')
      return
    }
    if (generation !== this.generation) return

    this.stopSource()
    try {
      await playAudioBlob(audio, () => this.advance(generation))
    } catch {
      // iOS verweigert das Abspielen, wenn die Entsperrung in der Geste
      // nicht geklappt hat. Ehrlich melden statt stumm haengen zu bleiben.
      if (generation !== this.generation) return
      this.events.onError?.(
        'Die Wiedergabe konnte nicht starten. Tippe noch einmal auf Play.',
      )
      this.setState('paused')
      return
    }
    if (generation !== this.generation) return
    this.pausedIndex = this.index
    this.setState('playing')
    setMediaSessionState('playing')

    prefetchSentences(
      voice.id,
      this.langHint,
      this.upcoming(PREFETCH_AHEAD),
      speed,
    )
  }
}
