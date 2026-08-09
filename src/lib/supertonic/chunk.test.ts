import { describe, expect, it } from 'vitest'
import { chunkText } from './chunk'

/** Baut einen Satz aus Wortgruppen, die durch Kommas getrennt sind. */
function langerSatz(teile: number, wortProTeil = 12): string {
  const gruppen = Array.from({ length: teile }, (_, i) =>
    Array.from({ length: wortProTeil }, (_, w) => `wort${i}${w}`).join(' '),
  )
  return `${gruppen.join(', ')}.`
}

describe('chunkText', () => {
  it('lässt kurze Sätze unangetastet', () => {
    const satz = 'Ein ganz normaler Satz.'
    expect(chunkText(satz, 'de')).toEqual([satz])
  })

  it('teilt lange Sätze in mehrere Stücke', () => {
    const satz = langerSatz(6)
    expect(satz.length).toBeGreaterThan(300)
    expect(chunkText(satz, 'de').length).toBeGreaterThan(1)
  })

  // Der Kern: An einer Wortgrenze mitten in einer Wortgruppe klingt die
  // Naht unnatürlich, an einem Komma nicht.
  it('teilt an Satzzeichen, nicht mitten in der Wortgruppe', () => {
    const stuecke = chunkText(langerSatz(6), 'de')
    for (const stueck of stuecke.slice(0, -1)) {
      expect(stueck.trimEnd().slice(-1)).toMatch(/[,;:–—]/)
    }
  })

  it('hält die Längengrenze ein', () => {
    for (const stueck of chunkText(langerSatz(10), 'de')) {
      expect(stueck.length).toBeLessThanOrEqual(300)
    }
  })

  it('verliert keinen Text', () => {
    const satz = langerSatz(8)
    const zusammen = chunkText(satz, 'de').join(' ')
    expect(zusammen.replace(/\s+/g, ' ')).toBe(satz.replace(/\s+/g, ' '))
  })

  // Ein Nebensatz kann auch allein schon zu lang sein – dann bleibt nur
  // die Wortgrenze, aber der Rest des Satzes leidet nicht darunter.
  it('fällt bei übergroßen Teilsätzen auf Wortgrenzen zurück', () => {
    const langerTeil = Array.from({ length: 80 }, (_, i) => `wort${i}`).join(' ')
    const stuecke = chunkText(`${langerTeil}, kurzer Schluss.`, 'de')
    expect(stuecke.length).toBeGreaterThan(1)
    for (const stueck of stuecke) {
      expect(stueck.length).toBeLessThanOrEqual(300)
    }
  })

  it('nutzt für Japanisch und Koreanisch die kürzere Grenze', () => {
    const satz = langerSatz(4)
    expect(satz.length).toBeGreaterThan(120)
    for (const stueck of chunkText(satz, 'ja')) {
      expect(stueck.length).toBeLessThanOrEqual(120)
    }
  })

  it('kommt mit Semikolon und Gedankenstrich zurecht', () => {
    const satz = langerSatz(3, 10).replace(/,/g, ';')
    const stuecke = chunkText(satz, 'de')
    if (stuecke.length > 1) {
      expect(stuecke[0].trimEnd().slice(-1)).toBe(';')
    }
  })
})
