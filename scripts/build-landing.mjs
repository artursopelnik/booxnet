#!/usr/bin/env node
/**
 * Erzeugt die Werbeseite in allen Sprachen aus EINER Vorlage.
 *
 * Bei einer Sprache war eine einzelne HTML-Datei das Richtige: nichts zu
 * bauen, nichts, das kaputtgehen kann. Bei sechs Sprachen dreht sich das
 * um — sechs handgepflegte Kopien derselben Seite driften auseinander,
 * und der Fehler faellt erst auf, wenn ihn jemand liest, der genau diese
 * Sprache spricht.
 *
 * Deshalb: landing/template.html plus landing/i18n.json, hier
 * zusammengesetzt. Reines Node ohne Abhaengigkeiten, gut hundert Zeilen
 * — das ist keine Toolchain, das ist eine Textersetzung.
 *
 * Ergebnis:
 *   dist/de/index.html, dist/en/index.html, …
 *   dist/impressum.html, dist/datenschutz.html   (sprachneutral, deutsch)
 *   dist/icon.svg
 *
 * Aufruf: node scripts/build-landing.mjs <zielverzeichnis>
 */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const LANDING = join(ROOT, 'landing')
const ZIEL = process.argv[2] ?? join(LANDING, 'dist')

/** Die erste Sprache ist die Vorgabe für Besucher ohne passende Wahl. */
export const STANDARD = 'de'

/** Nur diese Zeichen muessen in Textinhalten entschaerft werden. */
function escape(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Holt einen Wert ueber einen Pfad wie "faq.items.2.q". */
export function auflösen(daten, pfad) {
  return pfad
    .split('.')
    .reduce((wert, teil) => (wert == null ? undefined : wert[teil]), daten)
}

/**
 * Setzt {{pfad}} ein. Ein unbekannter Pfad ist ein Fehler und kein
 * leerer String: Eine Seite mit stillschweigend fehlendem Text sieht
 * fertig aus und ist es nicht.
 */
export function füllen(vorlage, daten, zusatz = {}) {
  return vorlage.replace(/\{\{([\w.]+)\}\}/g, (_, pfad) => {
    if (pfad in zusatz) return zusatz[pfad]
    const wert = auflösen(daten, pfad)
    if (wert === undefined) {
      throw new Error(`Unbekannter Textbaustein: ${pfad}`)
    }
    if (typeof wert !== 'string') {
      throw new Error(`Textbaustein ${pfad} ist kein Text`)
    }
    return escape(wert)
  })
}

/** hreflang-Angaben, damit Suchmaschinen die Fassungen zuordnen. */
export function alternativen(sprachen, standard = STANDARD) {
  const zeilen = sprachen.map(
    (code) => `<link rel="alternate" hreflang="${code}" href="/${code}/">`,
  )
  zeilen.push(`<link rel="alternate" hreflang="x-default" href="/${standard}/">`)
  return zeilen.join('\n')
}

/** Die Liste der Sprachen als echte Links. */
export function sprachliste(woerterbuch, aktuell) {
  return Object.entries(woerterbuch)
    .map(([code, texte]) => {
      const name = escape(texte.name)
      return code === aktuell
        ? `<li><a href="/${code}/" aria-current="true" lang="${code}">${name}</a></li>`
        : `<li><a href="/${code}/" lang="${code}">${name}</a></li>`
    })
    .join('')
}

export async function bauen(ziel = ZIEL) {
  const vorlage = await readFile(join(LANDING, 'template.html'), 'utf8')
  const woerterbuch = JSON.parse(
    await readFile(join(LANDING, 'i18n.json'), 'utf8'),
  )
  const sprachen = Object.keys(woerterbuch)
  if (!sprachen.includes(STANDARD)) {
    throw new Error(`Vorgabesprache ${STANDARD} fehlt im Woerterbuch`)
  }

  await rm(ziel, { recursive: true, force: true })
  await mkdir(ziel, { recursive: true })

  for (const code of sprachen) {
    const seite = füllen(vorlage, woerterbuch[code], {
      lang: code,
      alternates: alternativen(sprachen),
      languages: sprachliste(woerterbuch, code),
    })
    const datei = join(ziel, code, 'index.html')
    await mkdir(dirname(datei), { recursive: true })
    await writeFile(datei, seite)
  }

  // Rechtstexte bleiben sprachneutral unter der Wurzel: Ein Impressum
  // ist ein deutsches Rechtsdokument, keine Werbebotschaft. Es zu
  // uebersetzen brachte kein Recht und viel Risiko.
  for (const datei of ['impressum.html', 'datenschutz.html']) {
    await copyFile(join(LANDING, datei), join(ziel, datei))
  }
  await copyFile(join(ROOT, 'public', 'icon.svg'), join(ziel, 'icon.svg'))

  return { sprachen, ziel }
}

// Nur ausfuehren, wenn direkt aufgerufen - der Test importiert die
// Funktionen oben.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { sprachen, ziel } = await bauen()
  console.log(`✓ Werbeseite in ${sprachen.length} Sprachen: ${sprachen.join(', ')}`)
  console.log(`  nach ${ziel}`)
}
