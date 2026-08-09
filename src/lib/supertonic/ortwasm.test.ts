import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ortWasmFiles, ortWasmPrefix } from './ortwasm'

describe('Herkunft der Laufzeitdateien', () => {
  it('laedt ausschliesslich same-origin', () => {
    const prefix = ortWasmPrefix()
    expect(prefix.startsWith('/')).toBe(true)
    expect(prefix).not.toMatch(/^https?:/)
  })

  it('legt die Dateien unter die Versionsnummer', () => {
    // Ohne Version im Pfad koennte ein Upgrade auf einen alten
    // Cache-Eintrag treffen – die Dateien sind als unveraenderlich
    // ausgeliefert (public/_headers).
    expect(ortWasmPrefix()).toMatch(/\/ort\/[^/]+\/$/)
  })

  it('fordert nur die reine WASM-Variante an', () => {
    // Kein WebGPU (jsep): Das brachte Speicherabstuerze auf iPhones.
    expect(ortWasmFiles()).toEqual([
      'ort-wasm-simd-threaded.wasm',
      'ort-wasm-simd-threaded.mjs',
    ])
  })
})

/**
 * Der Grundsatz aus der Sprachmodell-Umstellung, als Test statt als
 * Kommentar: Nichts, was die App zum Laufen braucht, darf zur Laufzeit
 * von einem fremden Server kommen. Ein solcher Rueckfall faellt genau
 * dann aus, wenn man ihn braucht – und bis dahin faellt gar nicht auf,
 * dass die eigene Auslieferung kaputt ist.
 */
describe('Keine fremden Quellen im Laufzeitpfad', () => {
  const QUELLEN = [
    'src/lib/supertonic/ortwasm.ts',
    'src/lib/supertonic/assets.ts',
    'src/lib/supertonic/worker.ts',
    'src/lib/supertonic/client.ts',
  ]

  it.each(QUELLEN)('%s nennt keinen fremden Host', (datei) => {
    const inhalt = readFileSync(datei, 'utf8')
    // Nur echte Abrufe zaehlen, nicht Prosa in Kommentaren: gesucht sind
    // vollstaendige URLs.
    const urls = inhalt.match(/https?:\/\/[\w.-]+/g) ?? []
    expect(urls).toEqual([])
  })
})
