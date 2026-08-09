#!/usr/bin/env node
/**
 * Setzt das eingecheckte Sprachpaket aus `models/supertonic/` nach
 * `public/supertonic/` zusammen, damit der Build es mit ausliefert.
 *
 * Ohne Netz, ohne fremde Quelle – die Stücke liegen im Repository. Jede
 * Datei wird beim Zusammensetzen gegen die SHA-256-Summe aus dem Manifest
 * geprüft: Ein halb übertragener oder von Git veränderter Block fällt
 * hier auf und nicht erst beim Nutzer als stummes Buch.
 *
 * Läuft automatisch vor `npm run dev` und `npm run build`.
 *
 * Fehlt die Ablage, bricht der Produktions-Build ab: Die App hat keinen
 * Ersatzweg mehr für die Modelle (das ist der Sinn der Sache), ein
 * Deployment ohne sie könnte also gar nichts vorlesen. Für einen bewusst
 * modellfreien Build gibt es --optional bzw. SUPERTONIC_OPTIONAL=1.
 */
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import {
  PUBLIC_DIR,
  formatMB,
  readManifest,
  readStoredAsset,
} from './supertonic-store.mjs'

// Im Dev-Server (--optional) soll ein fehlendes Sprachpaket nicht den
// Start blockieren – dort lässt sich alles außer der Sprachausgabe auch
// ohne die 400 MB entwickeln.
const optional =
  process.argv.includes('--optional') || process.env.SUPERTONIC_OPTIONAL === '1'

/** Alle Dateien unterhalb von dir, relativ und mit '/' getrennt. */
async function listFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files = []
  for (const entry of entries) {
    const relative = prefix ? posix.join(prefix, entry.name) : entry.name
    if (entry.isDirectory()) {
      files.push(...(await listFiles(join(dir, entry.name), relative)))
    } else {
      files.push(relative)
    }
  }
  return files
}

const manifest = await readManifest()
if (!manifest?.assets?.length) {
  const hinweis = [
    'Das Sprachpaket fehlt: models/supertonic/manifest.json ist nicht vorhanden.',
    '',
    'Einmalig füllen (braucht Netz zum Upstream):',
    '  node scripts/vendor-supertonic.mjs',
    'oder den Workflow "Sprachpaket einchecken" in GitHub Actions starten.',
    'Danach models/supertonic/ einchecken – ab dann läuft alles ohne Netz.',
  ].join('\n')
  if (optional) {
    console.warn(`⚠ ${hinweis}\n(Als optional gestartet – es geht ohne Sprachpaket weiter.)`)
    process.exit(0)
  }
  console.error(hinweis)
  process.exit(1)
}

// Reste einer früheren Modellfassung nicht mit ausliefern.
const expected = new Set(manifest.assets.map((entry) => entry.path))
for (const found of await listFiles(PUBLIC_DIR)) {
  if (!expected.has(found)) await rm(join(PUBLIC_DIR, found))
}

let written = 0
let total = 0
for (const entry of manifest.assets) {
  const target = join(PUBLIC_DIR, entry.path)
  total += entry.bytes
  // Passt die Größe, ist die Datei aus einem früheren Lauf noch gut –
  // 400 MB bei jedem `npm run dev` neu zu schreiben wäre Verschwendung.
  const current = await stat(target).catch(() => null)
  if (current?.size === entry.bytes) continue
  const data = await readStoredAsset(entry)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, data)
  written += 1
}

console.log(
  `✓ supertonic/: ${expected.size} Dateien (${formatMB(total)}), ${written} neu zusammengesetzt`,
)
