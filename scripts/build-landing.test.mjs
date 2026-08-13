import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  alternativen,
  auflösen,
  füllen,
  sprachliste,
  STANDARD,
} from './build-landing.mjs'

const woerterbuch = JSON.parse(
  readFileSync(new URL('../landing/i18n.json', import.meta.url), 'utf8'),
)
const vorlage = readFileSync(
  new URL('../landing/template.html', import.meta.url),
  'utf8',
)
const sprachen = Object.keys(woerterbuch)

/** Alle Pfade eines Objekts, die auf einen Text zeigen. */
function pfade(objekt, praefix = '') {
  const raus = []
  for (const [schluessel, wert] of Object.entries(objekt)) {
    const pfad = praefix ? `${praefix}.${schluessel}` : schluessel
    if (wert && typeof wert === 'object') raus.push(...pfade(wert, pfad))
    else raus.push(pfad)
  }
  return raus
}

describe('Sprachen der Werbeseite', () => {
  // Die Seite wirbt fuer die App. Bietet sie eine Sprache an, die die
  // App nicht kann, fuehrt sie Besucher in eine Oberflaeche, die sie
  // nicht lesen koennen - und umgekehrt bleibt Reichweite liegen.
  it('führt dieselben Sprachen wie die App', () => {
    const quelle = readFileSync(
      new URL('../src/lib/i18n.ts', import.meta.url),
      'utf8',
    )
    // Ab "= [" schneiden, nicht ab dem Namen: Die Typangabe davor
    // enthaelt selbst ein "]" ("{ code: UiLang; name: string }[]").
    const start = quelle.indexOf('= [', quelle.indexOf('export const UI_LANGUAGES'))
    const block = quelle.slice(start, quelle.indexOf('\n]', start))
    const appSprachen = [...block.matchAll(/code: '(\w+)'/g)].map((m) => m[1])
    expect(sprachen.sort()).toEqual(appSprachen.sort())
  })

  it('kennt die Vorgabesprache', () => {
    expect(sprachen).toContain(STANDARD)
  })

  it('nennt jede Sprache in ihrer eigenen Schreibweise', () => {
    const namen = sprachen.map((code) => woerterbuch[code].name)
    for (const name of namen) expect(name.length).toBeGreaterThan(0)
    expect(new Set(namen).size).toBe(namen.length)
  })
})

describe('Vollständigkeit der Übersetzungen', () => {
  const erwartet = pfade(woerterbuch[STANDARD]).sort()

  it.each(sprachen)('%s hat jeden Textbaustein', (code) => {
    expect(pfade(woerterbuch[code]).sort()).toEqual(erwartet)
  })

  it.each(sprachen)('%s hat keinen leeren Text', (code) => {
    for (const pfad of erwartet) {
      expect(String(auflösen(woerterbuch[code], pfad)).trim().length)
        .toBeGreaterThan(0)
    }
  })

  // Sonst faellt eine vergessene Uebersetzung nicht auf, weil die Seite
  // ja "irgendwas" anzeigt - naemlich Deutsch.
  it.each(sprachen.filter((c) => c !== STANDARD))(
    '%s ist wirklich übersetzt, keine Kopie',
    (code) => {
      const gleich = erwartet.filter(
        (pfad) =>
          auflösen(woerterbuch[code], pfad) ===
          auflösen(woerterbuch[STANDARD], pfad),
      )
      // Gleich sein DUERFEN nur: der Sprachname selbst und die
      // Bildpfade - die Szenenbilder zeigen Situationen ohne Schrift und
      // gelten sprachneutral. Alles andere waere eine vergessene
      // Uebersetzung, die niemandem auffiele, weil die Seite ja
      // "irgendwas" anzeigt.
      const erlaubt = (pfad) => pfad === 'name' || pfad.endsWith('.img')
      expect(gleich.filter((pfad) => !erlaubt(pfad))).toEqual([])
    },
  )
})

describe('Zusammensetzen', () => {
  it('füllt jeden Platzhalter der Vorlage', () => {
    for (const code of sprachen) {
      const seite = füllen(vorlage, woerterbuch[code], {
        lang: code,
        alternates: alternativen(sprachen),
        languages: sprachliste(woerterbuch, code),
      })
      expect(seite).not.toMatch(/\{\{/)
    }
  })

  it('bricht bei einem unbekannten Baustein ab, statt ihn zu leeren', () => {
    // Eine Seite mit stillschweigend fehlendem Text sieht fertig aus
    // und ist es nicht.
    expect(() => füllen('<p>{{gibtsnicht}}</p>', woerterbuch.de)).toThrow(
      /Unbekannter Textbaustein/,
    )
  })

  it('entschärft spitze Klammern und Anführungszeichen', () => {
    const seite = füllen('<p>{{x}}</p>', { x: '<script>"böse"' })
    expect(seite).toBe('<p>&lt;script&gt;&quot;böse&quot;</p>')
  })

  it('verweist auf jede Sprachfassung und auf eine Vorgabe', () => {
    const html = alternativen(sprachen)
    for (const code of sprachen) {
      expect(html).toContain(`hreflang="${code}" href="/${code}/"`)
    }
    expect(html).toContain(`hreflang="x-default" href="/${STANDARD}/"`)
  })

  it('markiert die aktuelle Sprache in der Auswahl', () => {
    const html = sprachliste(woerterbuch, 'fr')
    expect(html).toContain('href="/fr/" aria-current="true"')
    expect(html.match(/aria-current/g)).toHaveLength(1)
    // Jede Sprache traegt ihr eigenes lang-Attribut, damit ein
    // Screenreader "Français" nicht deutsch ausspricht.
    for (const code of sprachen) expect(html).toContain(`lang="${code}"`)
  })
})
