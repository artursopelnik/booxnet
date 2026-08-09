import { beforeEach, describe, expect, it } from 'vitest'
import { readResumePoint, saveResumePoint } from './resumeQueue'
import { upcomingSpeakTexts } from './bookStructure'

beforeEach(() => {
  localStorage.clear()
})

describe('Wiedereinstieg merken', () => {
  it('gibt zurück, was gemerkt wurde', () => {
    saveResumePoint({ bookId: 'b1', lang: 'de', texts: ['Erster.', 'Zweiter.'] })
    expect(readResumePoint()).toEqual({
      bookId: 'b1',
      lang: 'de',
      texts: ['Erster.', 'Zweiter.'],
    })
  })

  it('merkt sich nur ein Buch – das zuletzt gelesene', () => {
    saveResumePoint({ bookId: 'b1', lang: 'de', texts: ['Erster.'] })
    saveResumePoint({ bookId: 'b2', lang: 'en', texts: ['First.'] })
    expect(readResumePoint()?.bookId).toBe('b2')
  })

  it('begrenzt den Vorrat, statt das halbe Buch zu merken', () => {
    saveResumePoint({
      bookId: 'b1',
      lang: 'de',
      texts: ['a', 'b', 'c', 'd', 'e', 'f'],
    })
    expect(readResumePoint()!.texts).toHaveLength(3)
  })

  it('merkt nichts, wenn es nichts zu sprechen gibt', () => {
    saveResumePoint({ bookId: 'b1', lang: 'de', texts: [] })
    expect(readResumePoint()).toBeNull()
  })

  it('liefert null, wenn noch nie gelesen wurde', () => {
    expect(readResumePoint()).toBeNull()
  })

  // Der Eintrag liegt im Speicher des Browsers: Er kann von einer
  // aelteren Fassung der App stammen oder von Hand veraendert sein. Ein
  // kaputter Eintrag darf die Bibliothek nicht mitreissen.
  it.each([
    ['kein JSON', 'nicht json'],
    ['leeres Objekt', '{}'],
    ['ohne Buch', '{"lang":"de","texts":["a"]}'],
    ['ohne Sprache', '{"bookId":"b1","texts":["a"]}'],
    ['Texte kein Feld', '{"bookId":"b1","lang":"de","texts":"a"}'],
    ['nur leere Texte', '{"bookId":"b1","lang":"de","texts":["",""]}'],
  ])('verwirft einen beschädigten Eintrag (%s)', (_name, raw) => {
    localStorage.setItem('booxnet.resume', raw)
    expect(readResumePoint()).toBeNull()
  })

  it('siebt einzelne unbrauchbare Texte aus, statt alles zu verwerfen', () => {
    localStorage.setItem(
      'booxnet.resume',
      '{"bookId":"b1","lang":"de","texts":["Guter Satz.",null,""]}',
    )
    expect(readResumePoint()!.texts).toEqual(['Guter Satz.'])
  })
})

describe('Nächste sprechbare Sätze', () => {
  const items = [
    { text: 'Eins.', pauseAfter: 0, skip: false },
    { text: '42', pauseAfter: 0, skip: true },
    { text: 'Zwei.', pauseAfter: 0, skip: false },
    { text: 'Drei.', pauseAfter: 0, skip: false },
  ]

  it('überspringt, was nie klingt', () => {
    // Sonst belegte eine Seitenzahl einen Vorabruf-Platz.
    expect(upcomingSpeakTexts(items, 0, 2)).toEqual(['Eins.', 'Zwei.'])
  })

  it('beginnt an der Leseposition, nicht am Buchanfang', () => {
    expect(upcomingSpeakTexts(items, 2, 5)).toEqual(['Zwei.', 'Drei.'])
  })

  it('liefert nie mehr als verlangt', () => {
    expect(upcomingSpeakTexts(items, 0, 1)).toEqual(['Eins.'])
    expect(upcomingSpeakTexts(items, 0, 0)).toEqual([])
  })

  it('kommt mit einer Position hinter dem Buchende zurecht', () => {
    expect(upcomingSpeakTexts(items, 99, 3)).toEqual([])
    expect(upcomingSpeakTexts([], 0, 3)).toEqual([])
  })

  it('behandelt eine negative Position wie den Anfang', () => {
    expect(upcomingSpeakTexts(items, -5, 1)).toEqual(['Eins.'])
  })
})
