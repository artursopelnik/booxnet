import { describe, expect, it } from 'vitest'
import { withTrailingSilence } from './audioOutput'

const SAMPLE_RATE = 44100

/** Baut ein minimales Mono-WAV mit `samples` 16-Bit-Werten. */
function makeWav(samples: number[]): Blob {
  const dataSize = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true) // Mono
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, dataSize, true)
  samples.forEach((value, i) => view.setInt16(44 + i * 2, value, true))
  return new Blob([buffer], { type: 'audio/wav' })
}

async function read(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer())
}

describe('withTrailingSilence', () => {
  it('verlängert die Datei um genau die gewünschte Stille', async () => {
    const original = makeWav([1, 2, 3, 4])
    const result = await withTrailingSilence(original, 0.5)
    const erwartet = Math.floor(0.5 * SAMPLE_RATE) * 2
    expect(result.size).toBe(original.size + erwartet)
  })

  it('schreibt die beiden Größenangaben im Kopf mit', async () => {
    const result = await withTrailingSilence(makeWav([1, 2, 3, 4]), 0.25)
    const view = await read(result)
    const dataSize = view.getUint32(40, true)
    // Datenfeld und Gesamtgröße müssen zur echten Dateigröße passen –
    // sonst spielen Browser die Datei gar nicht oder schneiden sie ab.
    expect(dataSize).toBe(result.size - 44)
    expect(view.getUint32(4, true)).toBe(result.size - 8)
  })

  it('lässt den ursprünglichen Ton unverändert und hängt Nullen an', async () => {
    const result = await withTrailingSilence(makeWav([7, -7, 32000]), 0.001)
    const view = await read(result)
    expect(view.getInt16(44, true)).toBe(7)
    expect(view.getInt16(46, true)).toBe(-7)
    expect(view.getInt16(48, true)).toBe(32000)
    expect(view.getInt16(50, true)).toBe(0)
    expect(view.getInt16(result.size - 2, true)).toBe(0)
  })

  it('behält Kopfangaben wie Abtastrate und Kanäle bei', async () => {
    const view = await read(await withTrailingSilence(makeWav([1]), 0.1))
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint16(34, true)).toBe(16)
  })

  it('gibt ohne Pause dieselbe Datei zurück', async () => {
    const original = makeWav([1, 2])
    expect(await withTrailingSilence(original, 0)).toBe(original)
    expect(await withTrailingSilence(original, -1)).toBe(original)
  })

  // Lieber unverändert durchreichen als einen kaputten Kopf schreiben.
  it('lässt Daten in Ruhe, die kein WAV sind', async () => {
    const fremd = new Blob([new Uint8Array(100)], { type: 'audio/mpeg' })
    expect(await withTrailingSilence(fremd, 0.5)).toBe(fremd)
    const winzig = new Blob([new Uint8Array(10)])
    expect(await withTrailingSilence(winzig, 0.5)).toBe(winzig)
  })
})
