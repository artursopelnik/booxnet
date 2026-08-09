import { beforeEach, describe, expect, it } from 'vitest'
import { setUiLang } from './i18n'
import { detectStudioLang, langLabel } from './lang'

// Der Rückfall folgt der Oberflächensprache; für diese Tests fest auf
// Deutsch, damit sie unabhängig von der Browser-Sprache laufen.
beforeEach(() => {
  setUiLang('de')
})

describe('detectStudioLang', () => {
  it('erkennt Deutsch an den häufigsten Wörtern', () => {
    const text =
      'Der Mann und die Frau sind nicht mit dem Zug gefahren, aber sie ' +
      'haben sich für das Buch entschieden und auch dafür bezahlt.'
    expect(detectStudioLang(text)).toBe('de')
  })

  it('erkennt Englisch', () => {
    const text =
      'The man and the woman are not with the train, but they have ' +
      'decided for this book and that is what they have been reading.'
    expect(detectStudioLang(text)).toBe('en')
  })

  it('erkennt Französisch', () => {
    const text =
      "Le livre et la lecture ne sont pas des choses que l'on peut " +
      'séparer, mais dans les faits une histoire pour tous avec des mots.'
    expect(detectStudioLang(text)).toBe('fr')
  })

  // Schriftsysteme sind eindeutig und werden ohne Wortlisten erkannt.
  it('erkennt nicht-lateinische Schriften direkt', () => {
    expect(detectStudioLang('これは日本語のテキストです')).toBe('ja')
    expect(detectStudioLang('이것은 한국어 문장입니다')).toBe('ko')
    expect(detectStudioLang('Αυτό είναι ελληνικό κείμενο')).toBe('el')
    expect(detectStudioLang('هذا نص عربي')).toBe('ar')
  })

  it('unterscheidet Ukrainisch von Russisch an eigenen Buchstaben', () => {
    expect(detectStudioLang('Це українська мова з їхніми літерами')).toBe('uk')
    expect(detectStudioLang('Это русский текст без особых букв')).toBe('ru')
  })

  // Zielgruppe sind deutsche Leser: Im Zweifel deutsche Aussprache.
  it('fällt bei zu wenig Text auf Deutsch zurück', () => {
    expect(detectStudioLang('The book')).toBe('de')
    expect(detectStudioLang('')).toBe('de')
  })

  it('fällt bei unklarem Signal auf Deutsch zurück', () => {
    const namen =
      'Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett ' +
      'Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango'
    expect(detectStudioLang(namen)).toBe('de')
  })

  it('wertet nur den Textanfang aus, bleibt also bei langen Büchern schnell', () => {
    const deutsch = 'Der Mann und die Frau sind nicht mit dem Zug gefahren. '
    const englisch = 'The man and the woman are not with the train. '
    // Erst 4000 Zeichen Deutsch, danach viel Englisch – der Anfang zählt.
    const text = deutsch.repeat(120) + englisch.repeat(400)
    expect(text.length).toBeGreaterThan(4000)
    expect(detectStudioLang(text)).toBe('de')
  })
})

describe('langLabel', () => {
  // Die Sprachnamen folgen der Oberflächensprache, nicht dem Buch.
  it('gibt die Namen in der Oberflächensprache zurück', () => {
    setUiLang('de')
    expect(langLabel('de')).toBe('Deutsch')
    expect(langLabel('en')).toBe('Englisch')
    setUiLang('en')
    expect(langLabel('de')).toBe('German')
    expect(langLabel('en')).toBe('English')
  })

  it('gibt unbekannte Kürzel unverändert zurück, statt zu scheitern', () => {
    expect(langLabel('zzz')).toBe('zzz')
  })
})
