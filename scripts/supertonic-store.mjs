/**
 * Der im Projekt eingecheckte Sprachpaket-Speicher (`models/supertonic/`).
 *
 * Die Sprachmodelle sind das Herz der App – ohne sie kann Booxnet nichts
 * vorlesen. Sie lagen bisher nur auf Hugging Face; verschwindet dieses
 * fremde Repository, ist die App wertlos. Deshalb liegen die Dateien
 * jetzt in Git: jeder Klon, jeder CI-Lauf und jedes Deployment bringt sie
 * mit, ohne dass zur Laufzeit irgendjemand Fremdes erreichbar sein muss.
 *
 * Git kann große Dateien speichern, GitHub weist Pushs ab 100 MB pro
 * Datei jedoch ab. Alles über CHUNK_BYTES wird darum in nummerierte
 * Teilstücke zerlegt; das Manifest hält fest, wie viele es sind und
 * welche SHA-256-Summe die zusammengesetzte Datei haben muss. Damit ist
 * eine unvollständige oder beschädigte Ablage beim Build sofort sichtbar
 * statt erst beim Nutzer als kaputte Sprachausgabe.
 *
 * Git LFS wäre der naheliegende Weg, scheidet aber aus: Es hat ein
 * eigenes, knappes Datenkontingent und macht einen einfachen `git clone`
 * ohne LFS-Client unbrauchbar – also genau die Abhängigkeit, die hier
 * abgeschafft werden soll.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** In Git eingecheckte Modelldateien (Quelle der Wahrheit). */
export const STORE_DIR = new URL('../models/supertonic', import.meta.url)
  .pathname
/** Beim Build daraus zusammengesetzt und mit ausgeliefert. */
export const PUBLIC_DIR = new URL('../public/supertonic', import.meta.url)
  .pathname
export const MANIFEST_PATH = join(STORE_DIR, 'manifest.json')

/**
 * 48 MiB pro Teilstück. GitHub lehnt Dateien ab 100 MB ganz ab und warnt
 * bereits ab 50 MB – mit 48 MiB bleibt auch die Warnung aus.
 */
export const CHUNK_BYTES = 48 * 1024 * 1024

/** Das gemeinsame Rechenmodell – der große Teil des Downloads. */
export const ENGINE_ASSETS = [
  'onnx/tts.json',
  'onnx/unicode_indexer.json',
  'onnx/duration_predictor.onnx',
  'onnx/text_encoder.onnx',
  'onnx/vector_estimator.onnx',
  'onnx/vocoder.onnx',
]

/** Die zehn Stimm-Vorlagen (je wenige hundert KB). */
export const VOICE_IDS = [
  'M1', 'M2', 'M3', 'M4', 'M5',
  'F1', 'F2', 'F3', 'F4', 'F5',
]

export const ASSETS = [
  ...ENGINE_ASSETS,
  ...VOICE_IDS.map((id) => `voice_styles/${id}.json`),
]

/**
 * Dateinamen einer Ablage. Eine Datei, die in ein Stück passt, liegt
 * unverändert unter ihrem Pfad – so bleiben die kleinen JSON-Dateien in
 * Git lesbar und vergleichbar. Erst größere Dateien werden nummeriert.
 */
export function partNames(path, parts) {
  if (parts < 1) throw new Error(`Ungültige Stückzahl für ${path}: ${parts}`)
  if (parts === 1) return [path]
  return Array.from(
    { length: parts },
    (_, index) => `${path}.part${String(index).padStart(3, '0')}`,
  )
}

/** Zerlegt Daten in Stücke von höchstens chunkBytes Länge. */
export function splitBuffer(data, chunkBytes = CHUNK_BYTES) {
  if (chunkBytes < 1) throw new Error('chunkBytes muss positiv sein')
  if (data.length === 0) return [data.subarray(0, 0)]
  const chunks = []
  for (let offset = 0; offset < data.length; offset += chunkBytes) {
    chunks.push(data.subarray(offset, Math.min(offset + chunkBytes, data.length)))
  }
  return chunks
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

/** Beschreibt eine Datei so, wie sie im Speicher abgelegt wird. */
export function describeAsset(path, data, chunkBytes = CHUNK_BYTES) {
  return {
    path,
    bytes: data.length,
    sha256: sha256(data),
    parts: splitBuffer(data, chunkBytes).length,
  }
}

export async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export async function writeManifest(manifest) {
  await mkdir(dirname(MANIFEST_PATH), { recursive: true })
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** Liest eine Datei aus dem Speicher und prüft ihre Prüfsumme. */
export async function readStoredAsset(entry, dir = STORE_DIR) {
  const parts = await Promise.all(
    partNames(entry.path, entry.parts).map((name) => readFile(join(dir, name))),
  )
  const data = parts.length === 1 ? parts[0] : Buffer.concat(parts)
  if (data.length !== entry.bytes) {
    throw new Error(
      `${entry.path}: ${data.length} Byte statt ${entry.bytes} – Ablage unvollständig.`,
    )
  }
  const digest = sha256(data)
  if (digest !== entry.sha256) {
    throw new Error(
      `${entry.path}: SHA-256 ${digest} statt ${entry.sha256} – Ablage beschädigt.`,
    )
  }
  return data
}

/** Schreibt eine Datei gestückelt in den Speicher. */
export async function writeStoredAsset(
  path,
  data,
  { dir = STORE_DIR, chunkBytes = CHUNK_BYTES } = {},
) {
  const chunks = splitBuffer(data, chunkBytes)
  const names = partNames(path, chunks.length)
  for (const [index, name] of names.entries()) {
    const target = join(dir, name)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, chunks[index])
  }
  return describeAsset(path, data, chunkBytes)
}

export function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
