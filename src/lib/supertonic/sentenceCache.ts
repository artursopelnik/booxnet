/**
 * Dauerhafter Satz-Cache in OPFS.
 *
 * Das Laden der Sprach-Engine ist fast reine Lesearbeit: Die ~400 MB
 * Modelldaten vom Flash-Speicher zu holen dauert beim App-Kaltstart
 * zehn Sekunden bis Minuten (gemessen: warm 1,8 s, kalt 40–50 s). Damit
 * der erste Druck auf Abspielen davon nichts mehr merkt, liegen die
 * nächsten Sätze ab der Leseposition als fertige WAV-Dateien bereit –
 * genau wie die Stimmen-Begrüßungen. Sie spielen sofort, während die
 * Engine im Hintergrund lädt; bis der Vorrat durch ist, ist sie fertig.
 *
 * Der Schlüssel deckt Stimme, Sprache, Tempo und Text ab: Ein Wechsel
 * einer dieser Größen trifft einfach andere Dateien, die alten laufen
 * über die Mengenbegrenzung aus. "Sprachmodell löschen" entfernt den
 * Cache mit (er liegt im selben OPFS-Verzeichnis).
 */
import { assetSize, pruneAssets, readAsset, writeAsset } from './opfs'

const PREFIX = 'sentences/'

/**
 * Höchstzahl gespeicherter Sätze. Ein Satz sind bei 44,1 kHz/16 Bit rund
 * 0,9 MB pro 10 Sekunden Ton, macht in Summe grob 20 MB – vertretbar
 * neben den 400 MB Modelldaten und genug, um die längste gemessene
 * Kaltstart-Ladezeit mit Ton zu überbrücken.
 */
const MAX_ENTRIES = 24

/**
 * Kurzer Streuwert des Schlüssels als Dateiname. Web-Crypto liefert das
 * kollisionsfreie Ergebnis; fehlt es (unsicherer Kontext), tut es ein
 * einfacher FNV-1a-Wert samt Textlänge – bei zwei Dutzend Einträgen ist
 * eine Verwechslung damit praktisch ausgeschlossen.
 */
async function digest(input: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(input)
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(hash).slice(0, 12))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return `f${(hash >>> 0).toString(16)}-${input.length.toString(16)}`
  }
}

async function pathFor(
  voiceId: string,
  lang: string,
  speed: number,
  text: string,
): Promise<string> {
  return `${PREFIX}${await digest(`${voiceId} ${lang} ${speed} ${text}`)}.wav`
}

/** Fertig gerechneter Satz aus dem Speicher, oder null. */
export async function readCachedSentence(
  voiceId: string,
  lang: string,
  speed: number,
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    return await readAsset(await pathFor(voiceId, lang, speed, text))
  } catch {
    return null
  }
}

export async function hasCachedSentence(
  voiceId: string,
  lang: string,
  speed: number,
  text: string,
): Promise<boolean> {
  try {
    return (await assetSize(await pathFor(voiceId, lang, speed, text))) > 0
  } catch {
    return false
  }
}

/** Legt einen gerechneten Satz ab und räumt den ältesten Überhang weg. */
export async function writeCachedSentence(
  voiceId: string,
  lang: string,
  speed: number,
  text: string,
  data: ArrayBuffer,
): Promise<void> {
  try {
    await writeAsset(await pathFor(voiceId, lang, speed, text), data)
    await pruneAssets(PREFIX, MAX_ENTRIES)
  } catch {
    // Kein Platz oder kein Speicher: Das Vorlesen rechnet dann eben neu.
  }
}
