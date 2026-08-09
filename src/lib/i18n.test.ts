import { beforeEach, describe, expect, it } from 'vitest'
import { getUiLang, setUiLang, t, UI_LANGUAGES } from './i18n'

beforeEach(() => {
  setUiLang('de')
})

describe('Übersetzungen', () => {
  it('gibt den Text in der gewählten Sprache zurück', () => {
    expect(t('common.cancel')).toBe('Abbrechen')
    setUiLang('en')
    expect(t('common.cancel')).toBe('Cancel')
  })

  it('setzt Platzhalter ein', () => {
    expect(t('reader.rate', { rate: 1.5 })).toContain('1.5')
    setUiLang('en')
    expect(t('library.actionsFor', { title: 'Moby Dick' })).toBe(
      'Actions for Moby Dick',
    )
  })

  it('lässt unbekannte Platzhalter stehen, statt sie zu leeren', () => {
    expect(t('library.actionsFor', {})).toContain('{title}')
  })

  it('merkt sich die Wahl', () => {
    setUiLang('en')
    expect(getUiLang()).toBe('en')
    expect(localStorage.getItem('booxnet.uiLang')).toBe('en')
  })

  it('bietet jede Sprache genau einmal an', () => {
    const codes = UI_LANGUAGES.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  // Fehlt eine Übersetzung, meldet das schon der Übersetzer beim Bauen –
  // dieser Test hält zusätzlich fest, dass keine Sprache leere Texte hat.
  it('hat für jeden Schlüssel in jeder Sprache einen Text', () => {
    for (const { code } of UI_LANGUAGES) {
      setUiLang(code)
      expect(t('common.cancel').length).toBeGreaterThan(0)
      expect(t('speech.failed').length).toBeGreaterThan(20)
      expect(t('voices.deleteBody', { mb: 400 })).toContain('400')
    }
  })
})
