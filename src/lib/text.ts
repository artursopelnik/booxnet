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

/** Splits plain text into sentences, preferring Intl.Segmenter when available. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  let parts: string[]
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
    parts = Array.from(segmenter.segment(clean), (s) => s.segment.trim())
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
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  return letters >= 2
}

export interface SentenceRef {
  /** Page index the sentence belongs to. */
  page: number
  text: string
}

/** Flattens per-page text into a global, ordered sentence list. */
export function toSentences(pages: string[]): SentenceRef[] {
  const result: SentenceRef[] = []
  pages.forEach((pageText, page) => {
    for (const text of splitSentences(pageText)) {
      result.push({ page, text })
    }
  })
  return result
}
