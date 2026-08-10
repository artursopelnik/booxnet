import { beforeEach, describe, expect, it } from 'vitest'
import {
  engineSpeed,
  getSavedRate,
  isEmphatic,
  speechSpeed,
  getSavedVoiceId,
  previewTextFor,
  saveRate,
  saveVoiceId,
} from './tts'

beforeEach(() => {
  localStorage.clear()
})

describe('engineSpeed', () => {
  it('bildet Normaltempo auf die neutrale Motor-Geschwindigkeit ab', () => {
    expect(engineSpeed(1)).toBe(1.05)
  })

  it('bleibt im Bereich, den der Motor unterstützt', () => {
    // Unter 0,7 und über 2 kann der Motor nicht sprechen.
    expect(engineSpeed(0.5)).toBe(0.7)
    expect(engineSpeed(2)).toBe(2)
    expect(engineSpeed(10)).toBe(2)
  })

  it('rundet auf zwei Nachkommastellen', () => {
    expect(engineSpeed(1.5)).toBe(1.58)
  })

  it('ist monoton: schneller eingestellt heißt nie langsamer gesprochen', () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
    const speeds = rates.map(engineSpeed)
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1])
    }
  })
})

describe('gespeichertes Tempo', () => {
  it('startet bei Normaltempo', () => {
    expect(getSavedRate()).toBe(1)
  })

  it('gibt einen gespeicherten Wert zurück', () => {
    saveRate(1.5)
    expect(getSavedRate()).toBe(1.5)
  })

  it('verwirft Werte außerhalb des Bereichs und Unsinn', () => {
    saveRate(9)
    expect(getSavedRate()).toBe(1)
    localStorage.setItem('vorleser.rate', 'schnell')
    expect(getSavedRate()).toBe(1)
  })
})

describe('gespeicherte Stimme', () => {
  it('hat anfangs keine Auswahl', () => {
    expect(getSavedVoiceId()).toBeNull()
  })

  it('gibt eine gespeicherte Stimme zurück', () => {
    saveVoiceId('M2')
    expect(getSavedVoiceId()).toBe('M2')
  })

  // Frühere Fassungen speicherten Stimmen anderer Motoren unter eigenen
  // Präfixen; die dürfen nicht als Studio-Stimme durchgehen.
  it('ignoriert Einträge früherer Sprachmotoren', () => {
    localStorage.setItem('vorleser.voice', 'system:Anna')
    expect(getSavedVoiceId()).toBeNull()
    localStorage.setItem('vorleser.voice', 'neural:de-DE-1')
    expect(getSavedVoiceId()).toBeNull()
  })
})

describe('previewTextFor', () => {
  it('spricht die Stimme mit ihrem Namen an', () => {
    const text = previewTextFor({ id: 'F1', name: 'Eva', gender: 'f' })
    expect(text).toContain('Eva')
    expect(text.endsWith('.')).toBe(true)
  })
})

describe('Tempo je Satz', () => {
  it('dehnt den kurzen Ausruf, der sonst hingeworfen klingt', () => {
    // Der gemeldete Fall: "Ach, ach, ach!" lief viel zu schnell durch.
    expect(speechSpeed('Ach, ach, ach!', 1)).toBeLessThan(
      speechSpeed('Ach, ach, ach.', 1),
    )
  })

  it('erkennt Ausrufe und Auslassungen, auch hinter Anfuehrungen', () => {
    expect(isEmphatic('Ach, ach, ach!')).toBe(true)
    expect(isEmphatic('Nie wieder …')).toBe(true)
    expect(isEmphatic('»Halt!«')).toBe(true)
    expect(isEmphatic('Er ging nach Hause.')).toBe(false)
    expect(isEmphatic('Was ist das?')).toBe(false)
  })

  it('laesst lange Ausrufesaetze in Ruhe', () => {
    // Die tragen ihre Betonung ueber die Satzmelodie; gedehnt klaengen
    // sie bloss schleppend.
    const lang =
      'Und dann rief er aus vollem Halse durch den ganzen dunklen Wald!'
    expect(isEmphatic(lang)).toBe(false)
    expect(speechSpeed(lang, 1)).toBe(speechSpeed('Er ging.', 1))
  })

  it('behaelt die eingestellte Lesegeschwindigkeit als Massstab', () => {
    // Wer 2x eingestellt hat, will auch den Ausruf zuegig hoeren.
    expect(speechSpeed('Ach!', 2)).toBeGreaterThan(speechSpeed('Ach!', 1))
  })

  it('bleibt im Bereich, den die Engine annimmt', () => {
    for (const rate of [0.5, 0.7, 1, 1.5, 2]) {
      for (const text of ['Ach!', 'Ein ganz normaler Satz.']) {
        const speed = speechSpeed(text, rate)
        expect(speed).toBeGreaterThanOrEqual(0.7)
        expect(speed).toBeLessThanOrEqual(2)
      }
    }
  })

  // Der Schluessel des Satz-Caches enthaelt das Tempo. Rechnete der
  // Vorabruf anders als die Wiedergabe, legte er Dateien an, die nie
  // wiedergefunden werden: jeder Satz doppelt berechnet, Vorrat leer.
  it('liefert fuer denselben Satz immer dasselbe Tempo', () => {
    for (const text of ['Ach, ach, ach!', 'Er ging.', 'Nie wieder …']) {
      expect(speechSpeed(text, 1)).toBe(speechSpeed(text, 1))
      expect(speechSpeed(text, 1)).toBe(speechSpeed(` ${text} `, 1))
    }
  })
})
