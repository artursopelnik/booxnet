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

let element: HTMLAudioElement | null = null
let objectUrl: string | null = null
let unlocked = false

function audio(): HTMLAudioElement {
  if (!element) {
    element = new Audio()
    element.preload = 'auto'
  }
  return element
}

/**
 * Muss EINMAL synchron in der Nutzergeste laufen: Erst danach darf das
 * Element von sich aus abspielen. Ohne das bliebe jeder spätere
 * play()-Aufruf – etwa beim Satzwechsel – von iOS blockiert.
 */
export function unlockAudioOutput(): void {
  if (unlocked) return
  unlocked = true
  const player = audio()
  player.src = SILENT_WAV
  void player.play().catch(() => {
    // Kein Ton möglich (z. B. Geste zu spät) – der nächste Play-Druck
    // versucht es erneut.
    unlocked = false
  })
}

/** Spielt einen fertig gerechneten Satz; `onEnded` folgt am Satzende. */
export async function playAudioBlob(
  blob: Blob,
  onEnded: () => void,
): Promise<void> {
  const player = audio()
  player.onended = null
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(blob)
  player.src = objectUrl
  player.onended = onEnded
  await player.play()
}

export function pauseAudioOutput(): void {
  element?.pause()
}

/** Setzt an derselben Stelle im Satz fort. */
export async function resumeAudioOutput(): Promise<void> {
  if (element) await element.play()
}

export function stopAudioOutput(): void {
  if (!element) return
  element.onended = null
  element.pause()
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
}

/** True, wenn ein Satz angefangen, aber noch nicht zu Ende gespielt ist. */
export function hasPausedAudio(): boolean {
  return (
    element !== null &&
    element.paused &&
    element.currentTime > 0 &&
    !element.ended
  )
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
