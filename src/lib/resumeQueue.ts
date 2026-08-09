/**
 * Die nächsten Sätze des zuletzt gelesenen Buchs – damit die Bibliothek
 * schon vorrechnen kann, bevor das Buch überhaupt offen ist.
 *
 * Das Problem, das dieses Modul löst: Der Vorabruf im Reader hängt an
 * der fertigen Satzstruktur und startet damit erst, wenn das Buch offen
 * ist. Wer dann sofort auf Play drückt, wartet die volle Rechenzeit ab –
 * bei einem zehnsekündigen Satz auf einem Handy zehn Sekunden, denn die
 * Synthese läuft dort etwa in Echtzeit. Solange das Buch langsam
 * aufbereitet wurde, fiel das nicht auf: Die Wartezeit steckte im
 * Fortschrittsbalken. Seit die Aufbereitung schnell ist, steht sie nackt
 * hinter dem Play-Knopf.
 *
 * Der Ausweg ist die Zeit davor. Zwischen App-Start und Play-Druck liegt
 * die Bibliothek, und dort passiert bisher nichts außer dem Anwärmen der
 * Engine. Nur weiß die Bibliothek nichts vom Text: Sie lädt aus
 * Speichergründen bewusst nur die Buchdaten ohne Seiten (siehe db.ts).
 * Das ganze Buch dort nachzuladen und seine Satzstruktur aufzubauen wäre
 * teuer für ein Buch, das vielleicht gar nicht geöffnet wird.
 *
 * Deshalb legt der Reader beim Verlassen die nächsten Sätze als reinen
 * Text ab – ein paar hundert Byte. Genau einmal je Lesesitzung, nicht
 * bei jedem Satzwechsel: Der Zeitpunkt zum Merken ist der, an dem
 * feststeht, wo es weitergeht.
 *
 * Bewusst nur für EIN Buch. Ein Vorrat über alle Bücher würde mit der
 * Bibliothek wachsen, und vorgerechnet werden kann ohnehin nur, was als
 * Nächstes drankommt.
 */
import { readSetting, writeSetting } from './storage'

const KEY = 'booxnet.resume'

/** Höchstens so viele Sätze merken – mehr schafft die Bibliothek nicht. */
const MAX_TEXTS = 3

export interface ResumePoint {
  bookId: string
  /** Sprache, mit der die Sätze zu rechnen sind (Erkennung oder Wahl). */
  lang: string
  /** Die nächsten sprechbaren Sätze ab der Leseposition. */
  texts: string[]
}

/** Merkt sich, wo es weitergeht. Ersetzt den vorigen Eintrag. */
export function saveResumePoint(point: ResumePoint): void {
  const texts = point.texts.slice(0, MAX_TEXTS)
  if (texts.length === 0) return
  writeSetting(KEY, JSON.stringify({ ...point, texts }))
}

/**
 * Der gemerkte Punkt, oder null. Prüft die Form: Der Eintrag stammt aus
 * dem Speicher des Browsers und kann von einer älteren Fassung der App
 * oder von Hand verändert sein.
 */
export function readResumePoint(): ResumePoint | null {
  const raw = readSetting(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ResumePoint
    if (typeof parsed?.bookId !== 'string' || !parsed.bookId) return null
    if (typeof parsed.lang !== 'string' || !parsed.lang) return null
    if (!Array.isArray(parsed.texts)) return null
    const texts = parsed.texts
      .filter((text): text is string => typeof text === 'string' && text !== '')
      .slice(0, MAX_TEXTS)
    if (texts.length === 0) return null
    return { bookId: parsed.bookId, lang: parsed.lang, texts }
  } catch {
    return null
  }
}
