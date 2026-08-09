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
      expect(stats.yields).toBeGreaterThan(0)
      // Die Rechenzeit ist ein Teil der Gesamtzeit, nie mehr.
      expect(stats.busySeconds).toBeGreaterThan(0)
      expect(stats.busySeconds).toBeLessThanOrEqual(stats.totalSeconds + 1e-6)
    } finally {
      horcher.stop()
    }
  })

  it('zaehlt die Wartezeit zur Gesamtdauer, nicht zur Rechenzeit', async () => {
    const horcher = letzterWert()
    try {
      // Genug Seiten fuer mehrere Unterbrechungen: Jede davon kostet
      // Wartezeit, waehrend die Rechenarbeit gleich klein bleibt.
      await buildBookStructure(
        Array.from({ length: 300 }, () => 'Kurz.'),
        { cancelled: false },
      )
      const stats = horcher.get()!
      expect(stats.yields).toBeGreaterThanOrEqual(12)
      expect(stats.totalSeconds).toBeGreaterThanOrEqual(stats.busySeconds)
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
