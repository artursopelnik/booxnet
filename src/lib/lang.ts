import { STUDIO_LANGS } from './voices'

/**
 * Stopword-based language detection for the studio engine. Deliberately
 * tiny: it only needs to pick the right Supertonic language tag; 'na'
 * (language-agnostic) is the safe fallback for everything unclear.
 */
const STOPWORDS: Record<string, string[]> = {
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'auf', 'für', 'sich', 'auch', 'werden', 'aber'],
  en: ['the', 'and', 'is', 'not', 'with', 'that', 'this', 'for', 'are', 'was', 'have', 'from', 'they', 'which', 'been'],
  fr: ['le', 'la', 'les', 'et', 'est', 'pas', 'une', 'des', 'que', 'dans', 'pour', 'avec', 'sur', 'mais', 'sont'],
  es: ['el', 'la', 'los', 'las', 'es', 'no', 'una', 'que', 'en', 'para', 'con', 'por', 'pero', 'como', 'más'],
  it: ['il', 'la', 'che', 'è', 'non', 'una', 'per', 'con', 'del', 'della', 'sono', 'anche', 'come', 'più', 'gli'],
  nl: ['de', 'het', 'een', 'en', 'is', 'niet', 'van', 'dat', 'voor', 'met', 'zijn', 'maar', 'ook', 'naar', 'wordt'],
  pt: ['o', 'a', 'os', 'as', 'é', 'não', 'uma', 'que', 'em', 'para', 'com', 'por', 'mais', 'como', 'foi'],
}

export function detectStudioLang(text: string): string {
  const words = text
    .toLowerCase()
    .slice(0, 4000)
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
  if (words.length < 10) return 'na'

  let bestLang = 'na'
  let bestScore = 0
  for (const [lang, stopwords] of Object.entries(STOPWORDS)) {
    const set = new Set(stopwords)
    let score = 0
    for (const word of words) {
      if (set.has(word)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestLang = lang
    }
  }
  // Require a clear signal, otherwise let the model decide.
  if (bestScore / words.length < 0.04) return 'na'
  return (STUDIO_LANGS as readonly string[]).includes(bestLang)
    ? bestLang
    : 'na'
}
