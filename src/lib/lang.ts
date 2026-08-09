import { getUiLang } from './i18n'
import { STUDIO_LANGS } from './voices'

/**
 * Language detection for the studio engine.
 *
 * Non-Latin scripts are recognized directly (high precision, zero cost);
 * Latin-script languages use tiny stopword lists. The app currently targets
 * German readers, so unclear text falls back to 'de' – German pronunciation
 * rules beat Supertonic's language-agnostic guess ('na') for our audience.
 */
/**
 * Sprache, wenn der Text kein klares Signal gibt. Folgt der
 * Oberflächensprache: Wer die App auf Englisch bedient, liest eher
 * englische Bücher – deutsche Aussprache wäre dort die schlechtere
 * Vermutung. Nur Sprachen, die das Modell auch sprechen kann.
 */
function fallbackLang(): string {
  const ui = getUiLang()
  return (STUDIO_LANGS as readonly string[]).includes(ui) ? ui : 'de'
}
const STOPWORDS: Record<string, string[]> = {
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'auf', 'für', 'sich', 'auch', 'werden', 'aber'],
  en: ['the', 'and', 'is', 'not', 'with', 'that', 'this', 'for', 'are', 'was', 'have', 'from', 'they', 'which', 'been'],
  fr: ['le', 'la', 'les', 'et', 'est', 'pas', 'une', 'des', 'que', 'dans', 'pour', 'avec', 'sur', 'mais', 'sont'],
  es: ['el', 'la', 'los', 'las', 'es', 'no', 'una', 'que', 'en', 'para', 'con', 'por', 'pero', 'como', 'más'],
  it: ['il', 'la', 'che', 'è', 'non', 'una', 'per', 'con', 'del', 'della', 'sono', 'anche', 'come', 'più', 'gli'],
  nl: ['de', 'het', 'een', 'en', 'is', 'niet', 'van', 'dat', 'voor', 'met', 'zijn', 'maar', 'ook', 'naar', 'wordt'],
  pt: ['o', 'a', 'os', 'as', 'é', 'não', 'uma', 'que', 'em', 'para', 'com', 'por', 'mais', 'como', 'foi'],
  pl: ['nie', 'się', 'jest', 'na', 'do', 'że', 'jak', 'ale', 'przez', 'być', 'tego', 'tylko', 'oraz', 'już', 'może'],
  tr: ['bir', 've', 'bu', 'için', 'ile', 'olarak', 'daha', 'gibi', 'ancak', 'değil', 'olan', 'çok', 'sonra', 'kadar', 'ise'],
  sv: ['och', 'att', 'det', 'som', 'en', 'är', 'på', 'för', 'med', 'inte', 'har', 'till', 'den', 'av', 'om'],
  da: ['og', 'at', 'det', 'er', 'en', 'til', 'på', 'med', 'ikke', 'der', 'som', 'har', 'den', 'af', 'for'],
  fi: ['ja', 'on', 'ei', 'että', 'se', 'oli', 'kun', 'niin', 'myös', 'mutta', 'ovat', 'jos', 'hän', 'tai', 'vain'],
  cs: ['je', 'se', 'na', 'že', 'to', 'ale', 'jako', 'pro', 'nebo', 'byl', 'jsou', 'který', 'také', 'jen', 'při'],
  ro: ['și', 'de', 'la', 'în', 'este', 'nu', 'care', 'pentru', 'sau', 'sunt', 'mai', 'din', 'fost', 'dar', 'cum'],
  hu: ['és', 'az', 'egy', 'nem', 'hogy', 'is', 'van', 'volt', 'de', 'mint', 'csak', 'már', 'meg', 'ha', 'ki'],
}

/** Script ranges that identify a language (or family) directly. */
function detectByScript(sample: string): string | null {
  // Kana is uniquely Japanese; Han alone could be Chinese (unsupported).
  if (/[぀-ヿ]/.test(sample)) return 'ja'
  if (/[가-힯]/.test(sample)) return 'ko'
  if (/[؀-ۿ]/.test(sample)) return 'ar'
  if (/[Ͱ-Ͽ]/.test(sample)) return 'el'
  if (/[ऀ-ॿ]/.test(sample)) return 'hi'
  if (/[Ѐ-ӿ]/.test(sample)) {
    // Ukrainian-specific letters distinguish it from Russian/Bulgarian.
    return /[іїєґ]/i.test(sample) ? 'uk' : 'ru'
  }
  return null
}

export function detectStudioLang(text: string): string {
  const sample = text.slice(0, 4000)

  const byScript = detectByScript(sample)
  if (byScript) {
    return (STUDIO_LANGS as readonly string[]).includes(byScript)
      ? byScript
      : fallbackLang()
  }

  const words = sample
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
  if (words.length < 10) return fallbackLang()

  let bestLang = fallbackLang()
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
  // Require a clear signal, otherwise assume German.
  if (bestScore / words.length < 0.04) return fallbackLang()
  return (STUDIO_LANGS as readonly string[]).includes(bestLang)
    ? bestLang
    : fallbackLang()
}

/** Sprachname in der Oberflächensprache, für die Auswahl im Reader. */
export function langLabel(lang: string): string {
  try {
    return (
      new Intl.DisplayNames([getUiLang()], { type: 'language' }).of(lang) ??
      lang
    )
  } catch {
    return lang
  }
}
