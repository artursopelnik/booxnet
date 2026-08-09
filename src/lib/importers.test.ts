import { describe, expect, it } from 'vitest'
import { bookFromText, titleFromText } from './importers'
import { toSentences } from './text'

describe('titleFromText', () => {
  // Die erste Zeile ist fast immer die Ueberschrift eines Artikels oder
  // der Betreff einer Nachricht - besser als jedes generische Ersatzwort.
  it('nimmt die erste Zeile als Titel', () => {
    expect(titleFromText('Der Nachtzug\n\nEs war kalt.', 'Ersatz')).toBe(
      'Der Nachtzug',
    )
  })

  it('überspringt führende Leerzeilen', () => {
    expect(titleFromText('\n\n  Überschrift  \nText', 'Ersatz')).toBe(
      'Überschrift',
    )
  })

  it('nimmt das Ersatzwort, wenn gar nichts dasteht', () => {
    expect(titleFromText('   \n\n  ', 'Eingefügter Text')).toBe(
      'Eingefügter Text',
    )
    expect(titleFromText('', 'Eingefügter Text')).toBe('Eingefügter Text')
  })

  it('lässt Markdown-Rauten weg', () => {
    expect(titleFromText('## Kapitel eins\nText', 'Ersatz')).toBe('Kapitel eins')
  })

  // Beginnt der Text direkt mit einem Absatz, wird an der Wortgrenze
  // gekuerzt - sonst stuende im Regal ein mitten im Wort abgeschnittener
  // Satzanfang.
  it('kürzt lange erste Zeilen an der Wortgrenze', () => {
    const lang =
      'Raimund Gregorius stand auf der Brücke und sah dem Wasser zu, es war kalt und der Regen hatte aufgehört.'
    const titel = titleFromText(lang, 'Ersatz')
    expect(titel.length).toBeLessThanOrEqual(71)
    expect(titel.endsWith('…')).toBe(true)
    expect(titel).not.toMatch(/\s…$/)
    // An einer Wortgrenze getrennt: kein angebrochenes Wort davor.
    expect(lang.startsWith(titel.slice(0, -1))).toBe(true)
    expect(lang[titel.length - 1]).toBe(' ')
  })

  it('kürzt auch ohne jede Wortgrenze', () => {
    const titel = titleFromText('A'.repeat(200), 'Ersatz')
    expect(titel).toBe(`${'A'.repeat(70)}…`)
  })
})

describe('bookFromText', () => {
  it('macht aus Absätzen ein lesbares Buch', () => {
    const buch = bookFromText('Erster Satz. Zweiter Satz.', 'Titel')
    expect(buch.title).toBe('Titel')
    expect(buch.unit).toBe('section')
    expect(buch.pages).toEqual(['Erster Satz. Zweiter Satz.'])
    expect(buch.sentenceCount).toBe(2)
    expect(buch.position).toBe(0)
  })

  it('wirft störende Markdown-Zeichen raus', () => {
    const buch = bookFromText(
      '# Überschrift\n\nEin [Link](https://example.com) im Text.\n\n---\n\nEnde.',
      'Titel',
    )
    const text = buch.pages.join('\n')
    expect(text).not.toContain('#')
    expect(text).not.toContain('https://example.com')
    expect(text).toContain('Ein Link im Text.')
    expect(text).not.toMatch(/^-{3,}$/m)
  })

  // Lange Texte muessen in Abschnitte zerfallen, sonst greift das
  // haeppchenweise Rendern des Readers nicht mehr.
  it('zerlegt lange Texte in mehrere Abschnitte', () => {
    const absatz = `${'Ein Satz mit Inhalt. '.repeat(100)}\n\n`
    const buch = bookFromText(absatz.repeat(6), 'Titel')
    expect(buch.pages.length).toBeGreaterThan(1)
    expect(buch.pageCount).toBe(buch.pages.length)
  })

  it('meldet leeren Text mit null Sätzen, statt ein leeres Buch anzulegen', () => {
    expect(bookFromText('   \n\n  ', 'Titel').sentenceCount).toBe(0)
  })

  // Eine Ueberschrift endet ohne Punkt. Ohne Absatzgrenze verschmolz sie
  // mit dem ersten Satz darunter zu einem einzigen langen Satz - bei
  // eingefuegten Artikeln der Normalfall.
  it('verschmilzt die Überschrift nicht mit dem ersten Satz', () => {
    const buch = bookFromText(
      'Warum wir schlecht zuhören\n\nWer zuhört, wartet nur. Das ist so.',
      'Titel',
    )
    const saetze = toSentences(buch.pages).map((s) => s.text)
    expect(saetze[0]).toBe('Warum wir schlecht zuhören')
    expect(saetze[1]).toBe('Wer zuhört, wartet nur.')
  })

  // Gegenprobe: In PDFs bricht jede Zeile mitten im Satz um. Einzelne
  // Umbrueche duerfen deshalb NICHT trennen.
  it('trennt nicht an einfachen Zeilenumbrüchen', () => {
    const buch = bookFromText('Ein Satz, der hier\numbricht und weitergeht.', 'T')
    const saetze = toSentences(buch.pages).map((s) => s.text)
    expect(saetze).toHaveLength(1)
    expect(saetze[0]).toBe('Ein Satz, der hier umbricht und weitergeht.')
  })

  it('vergibt für jeden Text eine eigene Kennung', () => {
    const a = bookFromText('Text.', 'A')
    const b = bookFromText('Text.', 'B')
    expect(a.id).not.toBe(b.id)
  })
})
