import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ASSETS,
  CHUNK_BYTES,
  describeAsset,
  partNames,
  readStoredAsset,
  sha256,
  splitBuffer,
  writeStoredAsset,
} from './supertonic-store.mjs'

describe('Sprachpaket-Ablage', () => {
  it('bleibt unter GitHubs 100-MB-Grenze pro Datei', () => {
    expect(CHUNK_BYTES).toBeLessThan(100 * 1000 * 1000)
  })

  it('legt kleine Dateien unverändert unter ihrem Pfad ab', () => {
    expect(partNames('voice_styles/M1.json', 1)).toEqual([
      'voice_styles/M1.json',
    ])
  })

  it('nummeriert die Stücke großer Dateien sortierbar', () => {
    expect(partNames('onnx/vocoder.onnx', 3)).toEqual([
      'onnx/vocoder.onnx.part000',
      'onnx/vocoder.onnx.part001',
      'onnx/vocoder.onnx.part002',
    ])
  })

  it('setzt zerlegte Daten Byte für Byte wieder zusammen', () => {
    const data = Buffer.from(
      Array.from({ length: 5000 }, (_, index) => index % 256),
    )
    const chunks = splitBuffer(data, 512)
    expect(chunks).toHaveLength(10)
    expect(chunks.at(-1)).toHaveLength(5000 - 9 * 512)
    expect(Buffer.concat(chunks).equals(data)).toBe(true)
  })

  it('erzeugt genau ein Stück, wenn die Datei hineinpasst', () => {
    expect(splitBuffer(Buffer.alloc(512), 512)).toHaveLength(1)
    expect(splitBuffer(Buffer.alloc(513), 512)).toHaveLength(2)
  })

  it('beschreibt eine Datei mit Größe, Prüfsumme und Stückzahl', () => {
    const data = Buffer.alloc(1500, 7)
    const entry = describeAsset('onnx/text_encoder.onnx', data, 512)
    expect(entry).toEqual({
      path: 'onnx/text_encoder.onnx',
      bytes: 1500,
      sha256: sha256(data),
      parts: 3,
    })
    expect(partNames(entry.path, entry.parts)).toHaveLength(3)
  })

  it('merkt jede Veränderung an der Prüfsumme', () => {
    const original = Buffer.alloc(64, 1)
    const verändert = Buffer.alloc(64, 1)
    verändert[63] = 2
    expect(sha256(original)).not.toBe(sha256(verändert))
  })

  it('führt das Rechenmodell und alle zehn Stimmen', () => {
    expect(ASSETS.filter((path) => path.startsWith('voice_styles/'))).toHaveLength(10)
    expect(ASSETS).toContain('onnx/vocoder.onnx')
    expect(new Set(ASSETS).size).toBe(ASSETS.length)
  })
})

describe('Ablegen und Zurücklesen', () => {
  let dir

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'supertonic-store-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('liefert eine große Datei unverändert zurück', async () => {
    const data = Buffer.from(
      Array.from({ length: 4096 }, (_, index) => (index * 31) % 256),
    )
    const entry = await writeStoredAsset('onnx/vocoder.onnx', data, {
      dir,
      chunkBytes: 700,
    })
    expect(entry.parts).toBe(6)
    const zurück = await readStoredAsset(entry, dir)
    expect(zurück.equals(data)).toBe(true)
  })

  it('erkennt ein beschädigtes Stück, statt es auszuliefern', async () => {
    const data = Buffer.alloc(2048, 3)
    const entry = await writeStoredAsset('onnx/text_encoder.onnx', data, {
      dir,
      chunkBytes: 1024,
    })
    // Ein Stück gleicher Länge, aber anderem Inhalt: Nur die Prüfsumme
    // kann das noch bemerken.
    await writeFile(join(dir, 'onnx/text_encoder.onnx.part001'), Buffer.alloc(1024, 9))
    await expect(readStoredAsset(entry, dir)).rejects.toThrow(/SHA-256/)
  })

  it('erkennt ein fehlendes Stück an der Größe', async () => {
    const data = Buffer.alloc(2048, 3)
    const entry = await writeStoredAsset('onnx/duration_predictor.onnx', data, {
      dir,
      chunkBytes: 1024,
    })
    await writeFile(
      join(dir, 'onnx/duration_predictor.onnx.part001'),
      Buffer.alloc(10, 3),
    )
    await expect(readStoredAsset(entry, dir)).rejects.toThrow(/unvollständig/)
  })
})
