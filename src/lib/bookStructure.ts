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
import { setBuildStats } from './buildStats'
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

/*
 * KEINE Ausdrucks-Zeichen im Text!
 *
 * Es lag nahe, Pausen über Supertonics <breath> zu erzwingen – die
 * Projektseite führt zehn solcher Zeichen als Funktion. Die öffentlichen
 * ONNX-Dateien lösen sie aber nicht ein: Der Tokenizer bildet in
 * worker.ts JEDES Zeichen einzeln über unicode_indexer ab, es gibt keine
 * Erkennung mehrstelliger Zeichenfolgen. „<breath>" kommt deshalb als
 * die acht Zeichen an, die es ist – und wird vorgelesen. Im Buch war an
 * jedem Komma ein „brit" zu hören.
 *
 * Dass die Sprachauszeichnung <de>…</de> funktioniert, ist kein
 * Gegenbeweis: Auf die ist das Modell trainiert. Für alles andere gilt:
 * Was in den Text geschrieben wird, wird gesprochen. Pausen gehören
 * darum in pauseAfter zwischen die Sätze, nicht in den Text hinein.
 */

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
  // Rechenzeit und vergangene Zeit getrennt mitschreiben – nur der
  // Vergleich der beiden verrät, ob eine zähe Aufbereitung an der Arbeit
  // hier liegt oder daran, dass das Gerät nebenher beschäftigt ist
  // (siehe buildStats.ts). Die Messung selbst kostet zwei Zeitabfragen
  // je Unterbrechung, also einige Dutzend im ganzen Buch.
  const started = performance.now()
  let busy = 0
  let yields = 0
  let sliceStart = started
  async function pause(): Promise<void> {
    busy += performance.now() - sliceStart
    yields++
    await yieldToBrowser()
    sliceStart = performance.now()
  }

  const sentences: SentenceRef[] = []
  for (let page = 0; page < pageTexts.length; page++) {
    appendPageSentences(sentences, pageTexts[page], page)
    if ((page + 1) % CHUNK === 0) {
      // Erste Hälfte des Fortschritts: die Satztrennung.
      onProgress?.((0.5 * (page + 1)) / pageTexts.length)
      await pause()
      if (token.cancelled) return null
    }
  }

  const groups = new Map<number, PageSentence[]>()
  const pagesOfSentence = new Map<number, number[]>()
  const speakItems: SentenceInput[] = []

  for (let index = 0; index < sentences.length; index++) {
    const sentence = sentences[index]
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
    const endsPage = next !== undefined && next.page !== endPage
    const clean = sanitizeForSpeech(sentence.text)
    const speakable = isSpeakable(clean)
    speakItems.push({
      text: clean,
      pauseAfter: endsPage ? 750 : pauseForEnding(sentence.text),
      skip: !speakable,
    })

    if ((index + 1) % CHUNK === 0) {
      onProgress?.(0.5 + (0.5 * (index + 1)) / sentences.length)
      await pause()
      if (token.cancelled) return null
    }
  }

  onProgress?.(1)
  const ended = performance.now()
  setBuildStats({
    sentences: sentences.length,
    totalSeconds: (ended - started) / 1000,
    busySeconds: (busy + (ended - sliceStart)) / 1000,
    yields,
  })
  return {
    sentences,
    pages: [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pageIndex, entries]) => ({ pageIndex, sentences: entries })),
    pagesOfSentence,
    speakItems,
  }
}
