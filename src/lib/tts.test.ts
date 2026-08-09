import { beforeEach, describe, expect, it } from 'vitest'
import {
  engineSpeed,
  getSavedRate,
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
