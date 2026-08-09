import { beforeEach, describe, expect, it } from 'vitest'
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  getFontScale,
  getHighlightStyle,
  saveFontScale,
  saveHighlightStyle,
} from './readerPrefs'

beforeEach(() => {
  localStorage.clear()
})

describe('Schriftgröße', () => {
  it('startet bei 100 Prozent', () => {
    expect(getFontScale()).toBe(100)
  })

  it('gibt einen gespeicherten Wert zurück', () => {
    saveFontScale(130)
    expect(getFontScale()).toBe(130)
  })

  it('nimmt die Randwerte an', () => {
    saveFontScale(FONT_SCALE_MIN)
    expect(getFontScale()).toBe(FONT_SCALE_MIN)
    saveFontScale(FONT_SCALE_MAX)
    expect(getFontScale()).toBe(FONT_SCALE_MAX)
  })

  // Ein manipulierter oder veralteter Eintrag darf die Anzeige nicht
  // unlesbar machen.
  it('verwirft Werte außerhalb des Bereichs und Unsinn', () => {
    saveFontScale(5000)
    expect(getFontScale()).toBe(100)
    saveFontScale(10)
    expect(getFontScale()).toBe(100)
    localStorage.setItem('booxnet.fontScale', 'riesig')
    expect(getFontScale()).toBe(100)
  })
})

describe('Markierungsstil', () => {
  it('startet mit der Markierung', () => {
    expect(getHighlightStyle()).toBe('mark')
  })

  it('gibt gespeicherte Stile zurück', () => {
    saveHighlightStyle('underline')
    expect(getHighlightStyle()).toBe('underline')
    saveHighlightStyle('invert')
    expect(getHighlightStyle()).toBe('invert')
  })

  it('verwirft unbekannte Werte', () => {
    localStorage.setItem('booxnet.highlight', 'blinkend')
    expect(getHighlightStyle()).toBe('mark')
  })
})
