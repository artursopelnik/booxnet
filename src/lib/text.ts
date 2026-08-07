/** Splits plain text into sentences, preferring Intl.Segmenter when available. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
    return Array.from(segmenter.segment(clean), (s) => s.segment.trim()).filter(
      Boolean,
    )
  }
  const matches = clean.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g)
  return (matches ?? [clean]).map((s) => s.trim()).filter(Boolean)
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
