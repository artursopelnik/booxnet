/**
 * Die Lese- und Sprechstruktur eines Buchs, stückweise aufgebaut.
 *
 * Aus den reinen Seitentexten entsteht alles, was der Reader braucht:
 * die fortlaufende Satzliste (Sätze über Seitengrenzen zusammengeführt),
 * die Zuordnung Satz → Seite für Markierung und Bildlauf, und die
 * bereinigten Sprechabschnitte samt Atempausen.
 *
 * Der Aufbau kostet bei einem 400-Seiten-Buch auf einem Handy grob eine
 * halbe bis ganze Sekunde. Liefe er in einem Rutsch, stünde der
 * Bildschirm genau so lange still – deshalb arbeitet er seitenweise in
 * Portionen und gibt zwischendurch die Kontrolle an den Browser zurück.
 * Die Oberfläche bleibt bedienbar und kann den Fortschritt zeigen.
 */
import type { SentenceInput } from './tts'
import {
  appendPageSentences,
  isSpeakable,
  sanitizeForSpeech,
  type SentenceRef,
} from './text'

/** Ein Satzsegment auf einer bestimmten Seite. */
export interface PageSentence {
  index: number
  text: string
  /** False bei der Fortsetzung eines seitenübergreifenden Satzes. */
  start: boolean
}

export interface PageGroup {
  pageIndex: number
  sentences: PageSentence[]
}

export interface BookStructure {
  sentences: SentenceRef[]
  /** Seiten mit Inhalt, in Lesereihenfolge. */
  pages: PageGroup[]
  /** Satzindex → Seiten, auf denen er steht (meist genau eine). */
  pagesOfSentence: Map<number, number[]>
  /** Was die Stimme spricht, ein Eintrag je Satz. */
  speakItems: SentenceInput[]
}

/**
 * So viele Seiten bzw. Sätze werden am Stück verarbeitet, bevor der
 * Browser wieder zum Zug kommt. Klein genug, dass keine Portion
 * spürbar blockiert; groß genug, dass die Pausen nicht die Rechenzeit
 * dominieren.
 */
const CHUNK = 25

/** Abbruchmarke: Wird das Buch gewechselt, hört der Aufbau sofort auf. */
export interface BuildToken {
  cancelled: boolean
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Setzt an Kommas ein Atem-Zeichen.
 *
 * Das Modell verschluckt Kommas oft hörbar: "Doch er denkt nicht ans
 * Aufgeben, macht weiter." kommt ohne jede Pause heraus. Das Komma
 * selbst geht dabei nicht verloren – es erreicht die Synthese unversehrt
 * –, das Modell setzt es nur nicht um.
 *
 * <breath> ist eines der zehn Ausdrucks-Zeichen von Supertonic 3 und
 * wird in der App bereits an Seitenanfängen verwendet. Entscheidend ist,
 * dass es INNERHALB derselben Berechnung steht: Den Satz am Komma zu
 * teilen und beide Hälften getrennt zu vertonen würde zwar auch eine
 * Pause erzeugen, aber die Betonung an der Nahtstelle zerreißen – genau
 * das Problem, das die Teilung langer Sätze schon hat.
 *
 * Bewusst zurückhaltend: Ein Atemzug nach jedem Komma klänge kurzatmig.
 * Er kommt nur, wenn davor ein echter Teilsatz steht und danach mehr
 * folgt als ein angehängtes Wort.
 */
const BREATH_MIN_BEFORE = 20
const BREATH_MIN_AFTER = 8

function markCommaPauses(text: string): string {
  let result = ''
  let lastCut = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ',' || text[i + 1] !== ' ') continue
    if (i - lastCut < BREATH_MIN_BEFORE) continue
    if (text.length - (i + 2) < BREATH_MIN_AFTER) continue
    result += `${text.slice(lastCut, i + 2)}<breath> `
    lastCut = i + 2
  }
  return result + text.slice(lastCut)
}

/** Punctuation-aware pause: questions/exclamations breathe a bit longer,
 * colons and semicolons connect more tightly to what follows. */
function pauseForEnding(text: string): number {
  const end = text.trim().slice(-1)
  if (end === '?' || end === '!' || end === '…' || end === '！' || end === '？')
    return 480
  if (end === ':' || end === ';') return 280
  return 350
}

/**
 * Baut die Struktur auf. `onProgress` bekommt Werte von 0 bis 1.
 * Liefert null, wenn der Aufbau zwischendurch abgebrochen wurde.
 */
export async function buildBookStructure(
  pageTexts: string[],
  token: BuildToken,
  onProgress?: (value: number) => void,
): Promise<BookStructure | null> {
  const sentences: SentenceRef[] = []
  for (let page = 0; page < pageTexts.length; page++) {
    appendPageSentences(sentences, pageTexts[page], page)
    if ((page + 1) % CHUNK === 0) {
      // Erste Hälfte des Fortschritts: die Satztrennung.
      onProgress?.((0.5 * (page + 1)) / pageTexts.length)
      await yieldToBrowser()
      if (token.cancelled) return null
    }
  }

  const groups = new Map<number, PageSentence[]>()
  const pagesOfSentence = new Map<number, number[]>()
  const speakItems: SentenceInput[] = []

  for (let index = 0; index < sentences.length; index++) {
    const sentence = sentences[index]
    const previous = sentences[index - 1]
    const next = sentences[index + 1]

    for (const [segmentIndex, segment] of sentence.segments.entries()) {
      const group = groups.get(segment.page)
      const entry = { index, text: segment.text, start: segmentIndex === 0 }
      if (group) group.push(entry)
      else groups.set(segment.page, [entry])

      const known = pagesOfSentence.get(index)
      if (known === undefined) pagesOfSentence.set(index, [segment.page])
      else if (!known.includes(segment.page)) known.push(segment.page)
    }

    // Ein seitenübergreifender Satz endet auf der Seite seines letzten
    // Segments – Atem und Seitenwechsel-Pause richten sich danach.
    const endPage = sentence.segments[sentence.segments.length - 1].page
    const previousEndPage =
      previous?.segments[previous.segments.length - 1].page
    const startsPage =
      previousEndPage !== undefined && previousEndPage !== sentence.page
    const endsPage = next !== undefined && next.page !== endPage
    const clean = sanitizeForSpeech(sentence.text)
    const speakable = isSpeakable(clean)
    // Reihenfolge zaehlt: Erst bereinigen (die Bereinigung wuerde die
    // spitzen Klammern der Ausdrucks-Zeichen entfernen), dann markieren.
    const spoken = speakable ? markCommaPauses(clean) : clean
    speakItems.push({
      text: startsPage && speakable ? `<breath> ${spoken}` : spoken,
      pauseAfter: endsPage ? 750 : pauseForEnding(sentence.text),
      skip: !speakable,
    })

    if ((index + 1) % CHUNK === 0) {
      onProgress?.(0.5 + (0.5 * (index + 1)) / sentences.length)
      await yieldToBrowser()
      if (token.cancelled) return null
    }
  }

  onProgress?.(1)
  return {
    sentences,
    pages: [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pageIndex, entries]) => ({ pageIndex, sentences: entries })),
    pagesOfSentence,
    speakItems,
  }
}
