#!/usr/bin/env node
/**
 * Holt die Supertonic-3-Modelle EINMALIG vom Upstream und legt sie
 * gestückelt in `models/supertonic/` ab, damit sie in Git eingecheckt
 * werden können.
 *
 * Das ist der einzige Ort im ganzen Projekt, der noch eine fremde Quelle
 * kennt – und er läuft weder beim Build noch in der App, sondern nur von
 * Hand bzw. über den Workflow `.github/workflows/vendor-supertonic.yml`.
 * Sobald das Ergebnis eingecheckt ist, funktioniert alles Weitere ohne
 * Hugging Face: Klonen, Bauen, Ausliefern, Abspielen.
 *
 * Der Upstream ist bewusst überschreibbar (SUPERTONIC_SOURCE), damit die
 * Modelle sich auch aus einer privaten Kopie oder von einer lokalen
 * Datei holen lassen, falls Hugging Face bereits abgeschaltet ist.
 *
 * Aufruf:
 *   node scripts/vendor-supertonic.mjs            # fehlende Dateien holen
 *   node scripts/vendor-supertonic.mjs --force    # alles neu holen
 */
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ASSETS,
  CHUNK_BYTES,
  MANIFEST_PATH,
  STORE_DIR,
  formatMB,
  partNames,
  readManifest,
  writeManifest,
  writeStoredAsset,
} from './supertonic-store.mjs'

// Bewusst mit || statt ??: Der Workflow reicht eine nicht ausgefüllte
// Eingabe als leeren String durch, und der soll den Upstream bedeuten.
const SOURCE =
  process.env.SUPERTONIC_SOURCE?.trim() ||
  'https://huggingface.co/Supertone/supertonic-3/resolve/main'
const force = process.argv.includes('--force')

/** Lädt eine Datei – über HTTP(S) oder aus einem lokalen Verzeichnis. */
async function fetchSource(asset) {
  if (/^https?:\/\//.test(SOURCE)) {
    const response = await fetch(`${SOURCE}/${asset}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} für ${asset}`)
    }
    return Buffer.from(await response.arrayBuffer())
  }
  return readFile(join(SOURCE, asset))
}

/** Räumt die bisherige Ablage einer Datei ab, bevor sie neu entsteht. */
async function removeStored(entry) {
  for (const name of partNames(entry.path, entry.parts)) {
    await rm(join(STORE_DIR, name), { force: true })
  }
}

const previous = await readManifest()
const previousByPath = new Map(
  (previous?.assets ?? []).map((entry) => [entry.path, entry]),
)

const assets = []
let failed = 0

for (const asset of ASSETS) {
  const known = previousByPath.get(asset)
  if (known && !force) {
    try {
      // Nur prüfen, ob die Stücke wirklich da sind – das Zusammensetzen
      // samt Prüfsumme übernimmt der Build.
      await Promise.all(
        partNames(asset, known.parts).map((name) =>
          readFile(join(STORE_DIR, name)).then(() => {}),
        ),
      )
      console.log(`✓ ${asset} (bereits eingecheckt, ${formatMB(known.bytes)})`)
      assets.push(known)
      continue
    } catch {
      console.log(`… ${asset} unvollständig – wird neu geholt`)
    }
  }

  process.stdout.write(`↓ ${asset} … `)
  try {
    const data = await fetchSource(asset)
    if (known) await removeStored(known)
    const entry = await writeStoredAsset(asset, data)
    console.log(`${formatMB(entry.bytes)} in ${entry.parts} Stück(en)`)
    assets.push(entry)
  } catch (error) {
    console.error(`FEHLER: ${error.message}`)
    failed += 1
  }
}

if (failed > 0) {
  console.error(
    `\n${failed} Datei(en) konnten nicht geholt werden – Manifest bleibt unverändert.`,
  )
  process.exit(1)
}

await writeManifest({
  source: SOURCE,
  license: 'OpenRAIL-M (siehe vendor/supertonic/NOTICE.md)',
  chunkBytes: CHUNK_BYTES,
  assets,
})

const total = assets.reduce((sum, entry) => sum + entry.bytes, 0)
console.log(`\nFertig: ${assets.length} Dateien, ${formatMB(total)}.`)
console.log(`Manifest: ${MANIFEST_PATH}`)
console.log('Jetzt einchecken – ab dann braucht niemand mehr den Upstream.')
