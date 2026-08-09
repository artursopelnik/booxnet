import { describe, expect, it } from 'vitest'
import { buildBookStructure, type BuildToken } from './bookStructure'

const running: BuildToken = { cancelled: false }

describe('buildBookStructure', () => {
  it('liefert Sätze, Seiten und Sprechabschnitte', async () => {
    const built = await buildBookStructure(
      ['Erster Satz. Zweiter Satz.', 'Dritter Satz.'],
      { cancelled: false },
    )
    expect(built).not.toBeNull()
    expect(built!.sentences).toHaveLength(3)
    expect(built!.speakItems).toHaveLength(3)
    expect(built!.pages.map((page) => page.pageIndex)).toEqual([0, 1])
  })

  it('markiert einen seitenübergreifenden Satz auf beiden Seiten', async () => {
    const built = await buildBookStructure(
      ['Er saß auf dem Sofa und', 'drehte sich um.'],
      { cancelled: false },
    )
    expect(built!.sentences).toHaveLength(1)
    // Damit die Markierung nicht an der Seitengrenze abreißt.
    expect(built!.pagesOfSentence.get(0)).toEqual([0, 1])
    expect(built!.pages).toHaveLength(2)
    expect(built!.pages[1].sentences[0].start).toBe(false)
  })

  it('lässt leere Seiten aus der Seitenliste heraus', async () => {
    const built = await buildBookStructure(['Ein Satz.', '   ', 'Noch einer.'], {
      cancelled: false,
    })
    expect(built!.pages.map((page) => page.pageIndex)).toEqual([0, 2])
  })

  it('überspringt Fragmente ohne echte Wörter', async () => {
    const built = await buildBookStructure(['42', 'Ein richtiger Satz.'], {
      cancelled: false,
    })
    expect(built!.speakItems[0].skip).toBe(true)
    expect(built!.speakItems[1].skip).toBe(false)
  })

  it('setzt am Seitenanfang ein Atemzeichen', async () => {
    const built = await buildBookStructure(
      ['Ein ganzer Satz.', 'Ein neuer Satz auf der zweiten Seite.'],
      { cancelled: false },
    )
    expect(built!.speakItems[1].text.startsWith('<breath> ')).toBe(true)
    // Der erste Satz des Buchs braucht keinen Atemzug davor.
    expect(built!.speakItems[0].text.startsWith('<breath>')).toBe(false)
  })

  it('pausiert am Seitenwechsel länger als innerhalb der Seite', async () => {
    const built = await buildBookStructure(
      ['Erster Satz. Zweiter Satz.', 'Dritter Satz.'],
      { cancelled: false },
    )
    // Satz 2 endet die Seite, Satz 1 nicht.
    expect(built!.speakItems[1].pauseAfter).toBeGreaterThan(
      built!.speakItems[0].pauseAfter!,
    )
  })

  it('bereinigt Zierzeichen für die Stimme, lässt den Lesetext aber stehen', async () => {
    const built = await buildBookStructure(['Ein ♥ Satz mit Zierrat.'], {
      cancelled: false,
    })
    expect(built!.speakItems[0].text).toBe('Ein Satz mit Zierrat.')
    expect(built!.sentences[0].text).toContain('♥')
  })

  it('meldet Fortschritt bis 1', async () => {
    const werte: number[] = []
    await buildBookStructure(
      Array.from({ length: 60 }, (_, i) => `Seite ${i} mit einem Satz.`),
      { cancelled: false },
      (value) => werte.push(value),
    )
    expect(werte.length).toBeGreaterThan(1)
    expect(werte[werte.length - 1]).toBe(1)
    // Monoton steigend, damit der Balken nie zurückspringt.
    for (let i = 1; i < werte.length; i++) {
      expect(werte[i]).toBeGreaterThanOrEqual(werte[i - 1])
    }
  })

  // Wer schnell zwischen Büchern wechselt, soll nicht auf den Aufbau des
  // vorigen warten – der bricht ab und liefert nichts.
  it('bricht ab, wenn die Marke gesetzt wird', async () => {
    const token: BuildToken = { cancelled: false }
    const pending = buildBookStructure(
      Array.from({ length: 200 }, (_, i) => `Seite ${i} mit einem Satz.`),
      token,
    )
    token.cancelled = true
    expect(await pending).toBeNull()
  })

  it('kommt mit einem leeren Buch zurecht', async () => {
    const built = await buildBookStructure([], running)
    expect(built!.sentences).toEqual([])
    expect(built!.pages).toEqual([])
    expect(built!.speakItems).toEqual([])
  })
})
