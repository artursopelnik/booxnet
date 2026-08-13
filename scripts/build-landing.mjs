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
 *   dist/img/…, dist/icon.svg
 *
 * Aufruf: node scripts/build-landing.mjs <zielverzeichnis>
 */
import { copyFile, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath statt .pathname: Letzteres ist prozentkodiert und
// zerbricht an jedem Leerzeichen oder Umlaut im Pfad ("Mein%20Buero").
const ROOT = fileURLToPath(new URL('..', import.meta.url))
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

/**
 * hreflang-Angaben, damit Suchmaschinen die Fassungen einander zuordnen.
 *
 * Suchmaschinen verlangen vollstaendige Adressen samt Schema - relative
 * Angaben werden ignoriert, die Verknuepfung waere also wirkungslos.
 * Ohne bekannte Adresse (Bau-Argument SITE_URL) lassen wir die Angaben
 * deshalb ganz weg: nichts ist besser als etwas Unwirksames, das
 * aussieht, als waere es erledigt.
 *
 * x-default zeigt auf die Wurzel, nicht auf eine Sprache: Dort steht die
 * Aushandlung nach Accept-Language, und genau die ist die richtige
 * Antwort fuer "keine der genannten Sprachen".
 */
export function alternativen(sprachen, seitenUrl) {
  if (!seitenUrl) return ''
  const basis = seitenUrl.replace(/\/+$/, '')
  const zeilen = sprachen.map(
    (code) =>
      `<link rel="alternate" hreflang="${code}" href="${basis}/${code}/">`,
  )
  zeilen.push(`<link rel="alternate" hreflang="x-default" href="${basis}/">`)
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

/**
 * Verhindert, dass ein Vertipper die Quellen loescht.
 *
 * Das Ziel wird vor dem Schreiben restlos geleert. Ein Aufruf mit
 * "landing" statt "landing/dist" - ein Zeichen daneben - haette damit
 * template.html, i18n.json und img/ mitgenommen. Deshalb: Wo eine
 * Vorlage oder ein Woerterbuch liegt, wird nicht geloescht.
 */
export async function pruefeZiel(ziel) {
  const voll = resolve(ziel)
  if (voll === resolve(ROOT) || voll === resolve(LANDING)) {
    throw new Error(`Zielverzeichnis ${voll} ist ein Quellverzeichnis`)
  }
  for (const wache of ['template.html', 'i18n.json']) {
    const da = await stat(join(voll, wache)).then(() => true, () => false)
    if (da) {
      throw new Error(
        `${voll} enthaelt ${wache} und ist damit kein Zielverzeichnis`,
      )
    }
  }
  return voll
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

  ziel = await pruefeZiel(ziel)
  await rm(ziel, { recursive: true, force: true })
  await mkdir(ziel, { recursive: true })

  for (const code of sprachen) {
    const seite = füllen(vorlage, woerterbuch[code], {
      lang: code,
      alternates: alternativen(sprachen, process.env.SITE_URL),
      languages: sprachliste(woerterbuch, code),
    })
    const datei = join(ziel, code, 'index.html')
    await mkdir(dirname(datei), { recursive: true })
    await writeFile(datei, seite)
  }

  // Rechtstexte bleiben sprachneutral unter der Wurzel: Ein Impressum
  // ist ein deutsches Rechtsdokument, keine Werbebotschaft. Es zu
  // uebersetzen brachte kein Recht und viel Risiko.
  for (const datei of ['impressum.html', 'datenschutz.html', 'legal.css']) {
    await copyFile(join(LANDING, datei), join(ziel, datei))
  }
  await copyFile(join(ROOT, 'public', 'icon.svg'), join(ziel, 'icon.svg'))
  // Die Szenenbilder liegen sprachneutral unter /img/ - sie zeigen
  // Situationen, keine Schrift, und gelten damit fuer jede Fassung.
  await cp(join(LANDING, 'img'), join(ziel, 'img'), { recursive: true })

  return { sprachen, ziel }
}

// Nur ausfuehren, wenn direkt aufgerufen - der Test importiert die
// Funktionen oben. Voller Pfadvergleich statt Dateiname-Endung: Sonst
// startete ein fremdes Skript namens "landing.mjs" beim blossen Import
// den Build, samt Leeren des Zielverzeichnisses.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { sprachen, ziel } = await bauen()
  console.log(`✓ Werbeseite in ${sprachen.length} Sprachen: ${sprachen.join(', ')}`)
  console.log(`  nach ${ziel}`)
}
