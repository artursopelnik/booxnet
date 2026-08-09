/**
 * Common abbreviations that end in a period but do NOT end a sentence.
 * A split after one of these would produce an unnatural mid-sentence pause.
 */
const ABBREVIATION_END =
  /(?:\b(?:z|bzw|bspw|ca|Dr|Prof|Nr|Nrn|St|Str|Abs|Art|Abb|Kap|Bd|Hrsg|Aufl|inkl|zzgl|evtl|ggf|usw|usf|etc|vgl|sog|u|o|Mr|Mrs|Ms|Jr|Sr|vs|approx|Inc|Ltd|Co)\.|\b[A-ZÄÖÜ]\.)\s*$/

/** Merges fragments that were split after an abbreviation or are too short. */
function mergeFalseSplits(parts: string[]): string[] {
  const result: string[] = []
  for (const part of parts) {
    const previous = result[result.length - 1]
    if (
      previous !== undefined &&
      (ABBREVIATION_END.test(previous) || previous.length < 4)
    ) {
      result[result.length - 1] = `${previous} ${part}`
    } else {
      result.push(part)
    }
  }
  return result
}

/**
 * Typografische Ligaturen, die PDFs als EIN Zeichen speichern. Bleiben
 * sie stehen, steht im Lesetext "eﬀektiv" statt "effektiv", und die
 * Stimme stolpert darüber.
 */
const LIGATURES: Record<string, string> = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'ft',
  '\uFB06': 'st',
}

/**
 * Unsichtbarer Müll aus der PDF-Extraktion: Steuerzeichen (ohne Zeilen-
 * umbruch und Tabulator), das Ersatzzeichen für nicht dekodierbare
 * Bytes, weiche Trennstriche, Breiten-Null-Zeichen und der Bereich für
 * private Zeichen – dorthin bilden PDFs mit eingebetteten Teil-Schriften
 * ihre Glyphen gerne ab.
 */
const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B-\u200D\uFEFF\uFFFD\uE000-\uF8FF]/g

/**
 * Reste aus den Verwaltungstabellen einer PDF, die gelegentlich in den
 * Text durchschlagen – etwa "00000D" oder "0000000000". Erkennbar an der
 * Kette führender Nullen: In echtem Text kommt so etwas praktisch nicht
 * vor, Jahreszahlen und normale Zahlen bleiben deshalb unberührt.
 */
const XREF_JUNK = /\b0{3,}[0-9A-Fa-f]{0,4}\b/g

/**
 * Räumt auf, was beim Auslesen einer PDF oder EPUB an Zeichenmüll
 * entsteht. Läuft vor der Satztrennung, wirkt also auf den angezeigten
 * Text UND auf das, was die Stimme spricht – und auch auf Bücher, die
 * schon vor dieser Bereinigung importiert wurden.
 *
 * Nicht reparierbar ist eine kaputte Schrift-Zuordnung in der PDF
 * selbst: Steht dort "unwillkiirlich", weil das Umlaut-Zeichen auf zwei
 * i abgebildet wurde, kommt genau das bei uns an. Das ließe sich nur
 * raten, und Raten würde richtige Wörter zerstören.
 */
export function cleanExtractedText(text: string): string {
  // Zuerst zusammensetzen: Manche PDFs speichern "ü" als "u" plus
  // freistehendes Trema. NFC macht daraus wieder einen Buchstaben.
  let clean = text.normalize('NFC')
  for (const [glyph, replacement] of Object.entries(LIGATURES)) {
    clean = clean.replaceAll(glyph, replacement)
  }
  clean = clean.replace(INVISIBLE, '')
  clean = clean.replace(XREF_JUNK, ' ')
  return clean
}

/**
 * Einmal auf Modulebene erzeugt statt pro Seite: Ein Segmenter ist ein
 * schwergewichtiges ICU-Objekt, und ein Buch hat hunderte Seiten.
 */
const SENTENCE_SEGMENTER =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
    : null

/**
 * Splits plain text into sentences, preferring Intl.Segmenter when available.
 *
 * Leerzeilen trennen zuerst: Ein Satz laeuft nie ueber eine Absatzgrenze.
 * Ohne diesen Schritt verschmolz eine Ueberschrift – die endet ja ohne
 * Punkt – mit dem ersten Satz darunter zu einem einzigen langen Satz
 * ("Warum wir schlecht zuhoeren Wer zuhoert, wartet meistens ..."). Bei
 * eingefuegten Artikeln ist genau das der Normalfall.
 *
 * EINZELNE Zeilenumbrueche bleiben bewusst blosser Leerraum: In PDFs
 * bricht jede Zeile um, mitten im Satz.
 */
export function splitSentences(text: string): string[] {
  const absaetze = text.split(/\n[^\S\n]*\n\s*/)
  if (absaetze.length > 1) return absaetze.flatMap(splitSentences)
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  let parts: string[]
  if (SENTENCE_SEGMENTER) {
    parts = Array.from(SENTENCE_SEGMENTER.segment(clean), (s) =>
      s.segment.trim(),
    )
  } else {
    parts = (
      clean.match(/[^.!?。！？]+[.!?。！？]+["')\]」』]*\s*|[^.!?。！？]+$/g) ?? [
        clean,
      ]
    ).map((s) => s.trim())
  }
  return mergeFalseSplits(parts.filter(Boolean))
}

/**
 * Strips characters the voice would stumble over (PDF artifacts, ornaments,
 * stray symbols) while keeping letters, digits and natural punctuation.
 */
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/[^\p{L}\p{N}\s.,;:!?'"()\[\]«»„“”‚‘’\-–—…%€$&+°#*\/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whether a fragment is worth reading aloud. Pure page numbers, separator
 * ornaments ("* * *") and symbol runs are skipped automatically.
 */
export function isSpeakable(text: string): boolean {
  // Bewusst eine Schleife mit Frueh-Abbruch statt match(): Letzteres legt
  // fuer JEDEN Buchstaben ein eigenes String-Objekt an, nur um zu zaehlen
  // - bei einem Buch mit 15.000 Saetzen rund eine Million Wegwerf-Objekte
  // (gemessen ~9x langsamer).
  const LETTER = /\p{L}/u
  let letters = 0
  for (const character of text) {
    if (LETTER.test(character) && ++letters >= 2) return true
  }
  return false
}

export interface SentenceSegment {
  /** Page index this part of the sentence appears on. */
  page: number
  text: string
}

export interface SentenceRef {
  /** Page index the sentence STARTS on. */
  page: number
  /** Full sentence text across all segments. */
  text: string
  /** Per-page parts – more than one when the sentence crosses a page. */
  segments: SentenceSegment[]
}

/** Sentence-final punctuation (optionally followed by closing quotes). */
const TERMINAL_END = /[.!?…。！？]["')\]»«„“”‚‘’]*$/

/**
 * Flattens per-page text into a global, ordered sentence list. A sentence
 * that is cut off by a page break ("… auf dem Saffiansofa. Er" | "drehte
 * seinen fülligen Leib …") is merged with its continuation on the next
 * page into ONE sentence with two segments – it is spoken in one go
 * without the page-break pause and highlighted on both pages. Merging is
 * deliberately conservative: only when the previous page ends without
 * sentence-final punctuation, contains real words and the continuation
 * starts lowercase (typical for a torn sentence, unlike headings).
 */
export function toSentences(pages: string[]): SentenceRef[] {
  const result: SentenceRef[] = []
  pages.forEach((pageText, page) => appendPageSentences(result, pageText, page))
  return result
}

/**
 * Haengt die Saetze EINER Seite an eine bestehende Liste an. Getrennt
 * herausgezogen, damit die Struktur eines grossen Buchs seitenweise
 * aufgebaut werden kann, ohne die Oberflaeche fuer eine Sekunde
 * einzufrieren (siehe bookStructure.ts) – die Zusammenfuehrung ueber
 * Seitengrenzen braucht dafuer nur den jeweils letzten Satz.
 */
export function appendPageSentences(
  result: SentenceRef[],
  pageText: string,
  page: number,
): void {
  splitSentences(cleanExtractedText(pageText)).forEach((text, index) => {
    const previous = result[result.length - 1]
    const continuesPrevious =
      index === 0 &&
      previous !== undefined &&
      previous.segments[previous.segments.length - 1].page === page - 1 &&
      !TERMINAL_END.test(previous.text) &&
      isSpeakable(previous.text) &&
      /^\p{Ll}/u.test(text)
    if (continuesPrevious) {
      previous.text = `${previous.text} ${text}`
      previous.segments.push({ page, text })
    } else {
      result.push({ page, text, segments: [{ page, text }] })
    }
  })
}
