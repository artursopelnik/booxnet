import { beforeEach, describe, expect, it } from 'vitest'
import { claimBackGesture } from './useBackDismiss'

/**
 * Winziger Verlaufs-Ersatz: Es geht hier nicht um echte Navigation,
 * sondern um die Buchfuehrung – jeder gesetzte Eintrag muss genau einmal
 * wieder verschwinden. Bleibt einer liegen, tut ein Zurueck-Druck spaeter
 * sichtbar nichts; wird einer zu viel entfernt, verlaesst ein Blatt beim
 * Schliessen gleich die ganze Seite.
 */
class FakeHistory {
  eintraege: unknown[] = []
  state: unknown = { router: 'start' }
  private zuhoerer: (() => void)[] = []

  pushState(state: unknown): void {
    this.eintraege.push(state)
    this.state = state
  }

  back(): void {
    this.eintraege.pop()
    this.zuhoerer.forEach((fn) => fn())
  }

  addEventListener(typ: string, fn: () => void): void {
    if (typ === 'popstate') this.zuhoerer.push(fn)
  }

  removeEventListener(typ: string, fn: () => void): void {
    if (typ !== 'popstate') return
    const index = this.zuhoerer.indexOf(fn)
    if (index >= 0) this.zuhoerer.splice(index, 1)
  }

  /** Die Zurueck-Geste des Geraets. */
  geste(): void {
    this.back()
  }

  get zuhoererZahl(): number {
    return this.zuhoerer.length
  }
}

let verlauf: FakeHistory

beforeEach(() => {
  verlauf = new FakeHistory()
  globalThis.history = verlauf as unknown as History
  globalThis.window = {
    addEventListener: (typ: string, fn: () => void) =>
      verlauf.addEventListener(typ, fn),
    removeEventListener: (typ: string, fn: () => void) =>
      verlauf.removeEventListener(typ, fn),
  } as unknown as Window & typeof globalThis
})

describe('claimBackGesture', () => {
  it('legt einen eigenen Eintrag an, solange das Blatt offen ist', () => {
    claimBackGesture(() => {})
    expect(verlauf.eintraege).toHaveLength(1)
  })

  it('behält den Zustand des Routers und markiert ihn nur', () => {
    claimBackGesture(() => {})
    // Ein fremd geformter Eintrag brachte React Router aus dem Tritt.
    expect(verlauf.eintraege[0]).toEqual({
      router: 'start',
      booxnetOverlay: true,
    })
  })

  it('schliesst das Blatt bei der Zurueck-Geste', () => {
    let geschlossen = 0
    claimBackGesture(() => geschlossen++)
    verlauf.geste()
    expect(geschlossen).toBe(1)
    expect(verlauf.eintraege).toHaveLength(0)
  })

  // Der teure Fehler: Nach dem Schliessen per Knopf bliebe sonst ein
  // Eintrag liegen, und der naechste Zurueck-Druck taete sichtbar nichts.
  it('raeumt den Eintrag weg, wenn regulaer geschlossen wird', () => {
    const freigeben = claimBackGesture(() => {})
    freigeben()
    expect(verlauf.eintraege).toHaveLength(0)
  })

  // Der andere teure Fehler: Nach der Geste darf NICHT noch einmal
  // zurueckgesprungen werden - das verliesse die Seite gleich mit.
  it('springt nach der Geste nicht ein zweites Mal zurueck', () => {
    verlauf.pushState({ router: 'seite' })
    const freigeben = claimBackGesture(() => {})
    verlauf.geste()
    freigeben()
    expect(verlauf.eintraege).toHaveLength(1)
  })

  it('hinterlaesst keine Zuhoerer', () => {
    const freigeben = claimBackGesture(() => {})
    freigeben()
    expect(verlauf.zuhoererZahl).toBe(0)

    const zweites = claimBackGesture(() => {})
    verlauf.geste()
    zweites()
    expect(verlauf.zuhoererZahl).toBe(0)
  })

  // Liegen zwei Blaetter uebereinander, schliesst eine Geste genau EINES.
  // Reagierten beide, verschwaende auch das untere und ein Eintrag bliebe
  // als toter Zurueck-Druck liegen.
  it('schliesst bei zwei Blaettern nur das obere', () => {
    const geschlossen: string[] = []
    const erstes = claimBackGesture(() => geschlossen.push('unteres'))
    const zweites = claimBackGesture(() => geschlossen.push('oberes'))
    expect(verlauf.eintraege).toHaveLength(2)

    verlauf.geste()
    expect(geschlossen).toEqual(['oberes'])
    expect(verlauf.eintraege).toHaveLength(1)

    // Aufraeumen des oberen Blatts darf jetzt nichts mehr anfassen.
    zweites()
    expect(verlauf.eintraege).toHaveLength(1)

    // Und die naechste Geste trifft das untere.
    verlauf.geste()
    expect(geschlossen).toEqual(['oberes', 'unteres'])
    expect(verlauf.eintraege).toHaveLength(0)
    erstes()
    expect(verlauf.eintraege).toHaveLength(0)
  })
})
