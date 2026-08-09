import { describe, expect, it } from 'vitest'
import { buildBookStructure } from './bookStructure'
import { subscribeBuildStats, type BuildStats } from './buildStats'

/** Fängt den zuletzt gemeldeten Messwert ab. */
function letzterWert(): { get: () => BuildStats | null; stop: () => void } {
  let stand: BuildStats | null = null
  const stop = subscribeBuildStats((value) => {
    stand = value
  })
  return { get: () => stand, stop }
}

describe('Messwerte der Aufbereitung', () => {
  it('meldet Satzzahl, Gesamtdauer und Rechenzeit', async () => {
    const horcher = letzterWert()
    try {
      await buildBookStructure(
        Array.from({ length: 60 }, () => 'Ein Satz. Noch ein Satz.'),
        { cancelled: false },
      )
      const stats = horcher.get()!
      expect(stats.sentences).toBe(120)
      // Ein kurzes Buch braucht gar keine Pause - das ist der Normalfall
      // und kein Fehler.
      expect(stats.yields).toBe(0)
      // Die Rechenzeit ist ein Teil der Gesamtzeit, nie mehr.
      expect(stats.busySeconds).toBeGreaterThan(0)
      expect(stats.busySeconds).toBeLessThanOrEqual(stats.totalSeconds + 1e-6)
    } finally {
      horcher.stop()
    }
  })

  // Der eigentliche Befund aus der Messung auf einem echten Geraet: Ein
  // Buch mit 21.567 Saetzen kam auf 933 Pausen und zahlte dafuer 7,0 s,
  // fuer 0,3 s Rechenarbeit. Pausen gehoeren an die Rechenzeit gebunden,
  // nicht an die Laenge des Buchs - sonst bezahlt jedes dicke Buch fuer
  // Unterbrechungen, die niemand braucht.
  it('haelt die Pausen an der Rechenzeit fest, nicht an der Buchlaenge', async () => {
    const horcher = letzterWert()
    try {
      const seite = 'Ein Satz. Noch ein Satz. Und ein dritter Satz. '.repeat(8)
      await buildBookStructure(
        Array.from({ length: 1200 }, () => seite),
        { cancelled: false },
      )
      const stats = horcher.get()!
      expect(stats.sentences).toBeGreaterThan(20000)
      // Stur alle 25 Eintraege waeren es ueber 900 gewesen.
      expect(stats.yields).toBeLessThan(100)
      // Und die Pausen duerfen die Rechenarbeit nicht mehr dominieren.
      expect(stats.totalSeconds).toBeLessThan(stats.busySeconds * 3 + 0.2)
    } finally {
      horcher.stop()
    }
  })

  it('meldet nichts, wenn der Aufbau abgebrochen wurde', async () => {
    const horcher = letzterWert()
    try {
      const token = { cancelled: false }
      const vorher = horcher.get()
      const pending = buildBookStructure(
        Array.from({ length: 200 }, () => 'Ein Satz.'),
        token,
      )
      token.cancelled = true
      expect(await pending).toBeNull()
      expect(horcher.get()).toBe(vorher)
    } finally {
      horcher.stop()
    }
  })

  it('meldet jedem Zuhoerer sofort den letzten Stand', async () => {
    await buildBookStructure(['Ein Satz.'], { cancelled: false })
    let sofort: BuildStats | null = null
    const stop = subscribeBuildStats((value) => {
      sofort = value
    })
    stop()
    expect(sofort).not.toBeNull()
  })
})
