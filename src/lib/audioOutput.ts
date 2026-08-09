/**
 * Tonausgabe des Vorlesens über ein echtes Medien-Element.
 *
 * Der Grund ist die Wiedergabe im Hintergrund. Reine Web-Audio-Ausgabe
 * gilt Betriebssystemen NICHT als Medienwiedergabe: Wechselt der Nutzer
 * zum Startbildschirm, frieren Zeitgeber und Skript ein. Der gerade
 * eingeplante Satz spielt zu Ende, danach kommt nichts mehr nach – genau
 * das Verhalten, über das gestolpert wurde. Ein <audio>-Element bekommt
 * dagegen eine Hintergrund-Tonsitzung, hält die Seite am Leben und
 * erscheint mit der Media-Session-Anmeldung auf dem Sperrbildschirm.
 *
 * Bewusst über fertige Audiodateien (Blob-Verweise) statt über einen
 * MediaStream: Der Stream-Umweg wurde hier früher schon versucht und
 * erzeugte in Safari ein hängendes Stotter-Geräusch, das erst ein
 * Neustart beendete.
 */

/** Winziges, stilles WAV – entsperrt das Element innerhalb der Geste. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

interface Channel {
  element: HTMLAudioElement | null
  objectUrl: string | null
  unlocked: boolean
}

function makeChannel(): Channel {
  return { element: null, objectUrl: null, unlocked: false }
}

/**
 * Zwei getrennte Elemente, mit Absicht.
 *
 * Das Vorlesen merkt sich die Stelle im laufenden Satz, damit "Pause" und
 * "Weiter" mittendrin funktionieren. Liefe die Stimmen-Vorstellung über
 * dasselbe Element, überschriebe sie diese Stelle – "Weiter" spielte
 * danach die Begrüßung statt des Buchs.
 *
 * Die Vorstellung lief früher über Web Audio. Das war der stillere Fehler:
 * Sobald das Vorlesen die Tonsitzung des Geräts übernommen hatte, ging der
 * Web-Audio-Kontext auf iOS in einen unterbrochenen Zustand, aus dem ihn
 * ein blosses resume() nicht mehr holte. Die Vorstellung spielte dann
 * lautlos und meldete auch kein Ende – der Ladekringel drehte endlos und
 * jeder weitere Antipper prallte am deaktivierten Knopf ab.
 */
const read = makeChannel()
const preview = makeChannel()

function audio(channel: Channel): HTMLAudioElement {
  if (!channel.element) {
    channel.element = new Audio()
    channel.element.preload = 'auto'
  }
  return channel.element
}

/**
 * Muss EINMAL synchron in der Nutzergeste laufen: Erst danach darf das
 * Element von sich aus abspielen. Ohne das bliebe jeder spätere
 * play()-Aufruf – etwa beim Satzwechsel – von iOS blockiert.
 */
function unlock(channel: Channel): void {
  if (channel.unlocked) return
  channel.unlocked = true
  const player = audio(channel)
  player.src = SILENT_WAV
  void player.play().catch(() => {
    // Kein Ton möglich (z. B. Geste zu spät) – der nächste Druck
    // versucht es erneut.
    channel.unlocked = false
  })
}

/** Hängt einen Blob ins Element und räumt den vorigen Verweis weg. */
function attach(channel: Channel, blob: Blob): HTMLAudioElement {
  const player = audio(channel)
  player.onended = null
  player.onerror = null
  if (channel.objectUrl) URL.revokeObjectURL(channel.objectUrl)
  channel.objectUrl = URL.createObjectURL(blob)
  player.src = channel.objectUrl
  return player
}

function release(channel: Channel): void {
  const player = channel.element
  if (!player) return
  player.onended = null
  player.onerror = null
  player.pause()
  if (channel.objectUrl) {
    URL.revokeObjectURL(channel.objectUrl)
    channel.objectUrl = null
  }
}

export function unlockAudioOutput(): void {
  unlock(read)
}

/** Spielt einen fertig gerechneten Satz; `onEnded` folgt am Satzende. */
export async function playAudioBlob(
  blob: Blob,
  onEnded: () => void,
): Promise<void> {
  const player = attach(read, blob)
  player.onended = onEnded
  await player.play()
}

export function pauseAudioOutput(): void {
  read.element?.pause()
}

/** Setzt an derselben Stelle im Satz fort. */
export async function resumeAudioOutput(): Promise<void> {
  if (read.element) await read.element.play()
}

export function stopAudioOutput(): void {
  release(read)
}

/** True, wenn ein Satz angefangen, aber noch nicht zu Ende gespielt ist. */
export function hasPausedAudio(): boolean {
  const player = read.element
  return (
    player !== null &&
    player.paused &&
    player.currentTime > 0 &&
    !player.ended
  )
}

/* --------------------------------------------------- Stimmen-Vorstellung */

export function unlockPreviewOutput(): void {
  unlock(preview)
}

/**
 * Beendet die laufende Vorstellung. Bewusst NICHT über das pause-Ereignis:
 * pause() auf einem bereits stehenden Element löst gar kein Ereignis aus,
 * ein wartendes Versprechen bliebe dann für immer hängen.
 */
let finishPreview: ((error?: Error) => void) | null = null

export function stopPreviewOutput(): void {
  finishPreview?.()
  release(preview)
}

/**
 * Spielt eine Stimmen-Vorstellung und wartet, bis sie durch ist.
 *
 * Das Versprechen löst sich in JEDEM Fall auf – am Ende, beim Abbruch von
 * aussen, bei einer Unterbrechung durch das Betriebssystem und im Fehler-
 * fall. Ein hängendes Versprechen wäre hier besonders teuer: Die Stimmen-
 * Auswahl sperrt währenddessen alle Probehör-Knöpfe, ein einziges
 * verschlucktes Ende legte also die ganze Liste lahm.
 */
export function playPreviewBlob(blob: Blob): Promise<void> {
  // Eine noch wartende Vorstellung gilt ab jetzt als beendet.
  finishPreview?.()
  const player = attach(preview, blob)
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      if (finishPreview === finish) finishPreview = null
      player.onended = null
      player.onerror = null
      player.onpause = null
      if (error) reject(error)
      else resolve()
    }
    finishPreview = finish
    player.onended = () => finish()
    // Am natürlichen Ende feuert kein pause-Ereignis; hier landet nur eine
    // Unterbrechung von aussen (Anruf, andere App). Kein Fehler.
    player.onpause = () => finish()
    player.onerror = () =>
      finish(new Error('Die Tondatei ließ sich nicht abspielen.'))
    player.play().catch((error: unknown) => {
      finish(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

/* ------------------------------------------------------ Sprechpausen */

/**
 * Hängt Stille an eine WAV-Datei an.
 *
 * Die Pause zwischen zwei Sätzen lief früher über einen JavaScript-
 * Zeitgeber. Im Hintergrund werden solche Zeitgeber gedrosselt, und das
 * Medien-Element stünde in der Zwischenzeit still – das Betriebssystem
 * würde die Tonsitzung freigeben. Steckt die Pause in der Datei, spielt
 * das Element durchgehend und der Satzwechsel dauert Millisekunden.
 *
 * Arbeitet direkt auf den Bytes (44-Byte-Kopf, danach 16-Bit-Werte),
 * ohne Dekodieren und Neukodieren.
 */
export async function withTrailingSilence(
  blob: Blob,
  seconds: number,
): Promise<Blob> {
  if (seconds <= 0) return blob
  const buffer = await blob.arrayBuffer()
  if (buffer.byteLength < 44) return blob
  const view = new DataView(buffer)
  // "RIFF" und "WAVE" – bei allem anderen lieber unverändert lassen.
  if (view.getUint32(0, false) !== 0x52494646) return blob
  const sampleRate = view.getUint32(24, true)
  const channels = view.getUint16(22, true) || 1
  if (!sampleRate) return blob

  const silenceBytes =
    Math.floor(seconds * sampleRate) * channels * 2
  const dataSize = view.getUint32(40, true) + silenceBytes
  const head = buffer.slice(0, 44)
  const headView = new DataView(head)
  headView.setUint32(4, 36 + dataSize, true)
  headView.setUint32(40, dataSize, true)
  return new Blob([head, buffer.slice(44), new Uint8Array(silenceBytes)], {
    type: 'audio/wav',
  })
}

/* ---------------------------------------------------- Media Session */

export interface MediaSessionHandlers {
  onPlay: () => void
  onPause: () => void
  onNext: () => void
  onPrevious: () => void
}

/**
 * Meldet die Wiedergabe beim Betriebssystem an: Titel auf dem
 * Sperrbildschirm, Steuerung über Kopfhörer-Tasten und Kontrollzentrum.
 */
export function setupMediaSession(handlers: MediaSessionHandlers): void {
  const session = navigator.mediaSession
  if (!session) return
  try {
    session.setActionHandler('play', handlers.onPlay)
    session.setActionHandler('pause', handlers.onPause)
    session.setActionHandler('nexttrack', handlers.onNext)
    session.setActionHandler('previoustrack', handlers.onPrevious)
  } catch {
    // Einzelne Aktionen kennt nicht jeder Browser – kein Beinbruch.
  }
}

export function updateMediaSessionInfo(
  title: string,
  voiceName: string,
  cover?: string,
): void {
  const session = navigator.mediaSession
  if (!session || typeof MediaMetadata === 'undefined') return
  try {
    session.metadata = new MediaMetadata({
      title,
      artist: `Vorgelesen von ${voiceName}`,
      album: 'Booxnet',
      artwork: cover ? [{ src: cover }] : undefined,
    })
  } catch {
    // Metadaten sind Zierde, kein Muss.
  }
}

export function setMediaSessionState(state: 'playing' | 'paused' | 'none'): void {
  const session = navigator.mediaSession
  if (!session) return
  try {
    session.playbackState = state
  } catch {
    // Nicht überall unterstützt.
  }
}
