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
 * So oft wird nachgesehen, ob es Zeit für eine Pause ist. Nur ein
 * Stichprobenraster – ob wirklich abgegeben wird, entscheidet SLICE_MS.
 */
const CHUNK = 25

/**
 * Höchstens so lange am Stück rechnen, dann den Browser ranlassen.
 *
 * Vorher wurde stur nach je 25 Einträgen abgegeben. Das klang sparsam,
 * war es aber nicht: Ein Buch mit 21.567 Sätzen kam so auf 933 Pausen.
 * Jede kostet die Mindestverzögerung von setTimeout (rund 4 ms, unter
 * Last mehr) UND eine Fortschrittsmeldung, die die Leseansicht neu
 * zeichnen lässt. Gemessen auf einem echten Gerät: 7,3 s insgesamt für
 * 0,3 s Rechenarbeit – die Pausen kosteten das Dreiundzwanzigfache
 * dessen, wofür sie da waren.
 *
 * Nach der Zeit statt nach der Stückzahl abzugeben dreht das um: Die
 * Zahl der Pausen hängt jetzt an der Rechenzeit, nicht an der Länge des
 * Buchs. 12 ms liegen unter einem Bildschirmaufbau bei 60 Hz, die
 * Oberfläche bleibt also flüssig – aber ein dickes Buch zahlt keine
 * Sekunden mehr für Pausen, die niemand braucht.
 */
const SLICE_MS = 12

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
  /**
   * Gibt ab, wenn die laufende Portion lang genug war – sonst sofort
   * zurück. Die Fortschrittsmeldung hängt bewusst mit dran: Sie zeichnet
   * die Leseansicht neu und wäre einzeln genauso teuer wie die Pause.
   */
  async function pauseIfDue(progress: number): Promise<void> {
    const now = performance.now()
    if (now - sliceStart < SLICE_MS) return
    busy += now - sliceStart
    yields++
    onProgress?.(progress)
    await yieldToBrowser()
    sliceStart = performance.now()
  }

  const sentences: SentenceRef[] = []
  for (let page = 0; page < pageTexts.length; page++) {
    appendPageSentences(sentences, pageTexts[page], page)
    if ((page + 1) % CHUNK === 0) {
      // Erste Hälfte des Fortschritts: die Satztrennung.
      await pauseIfDue((0.5 * (page + 1)) / pageTexts.length)
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
      await pauseIfDue(0.5 + (0.5 * (index + 1)) / sentences.length)
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
