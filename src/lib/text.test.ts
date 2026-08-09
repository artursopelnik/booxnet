import { describe, expect, it } from 'vitest'
import { isSpeakable, sanitizeForSpeech, splitSentences, toSentences } from './text'

describe('splitSentences', () => {
  it('trennt an Satzzeichen', () => {
    expect(splitSentences('Erster Satz. Zweiter Satz! Dritter Satz?')).toEqual([
      'Erster Satz.',
      'Zweiter Satz!',
      'Dritter Satz?',
    ])
  })

  it('normalisiert Zeilenumbrüche und mehrfache Leerzeichen', () => {
    expect(splitSentences('Ein Satz\n  mit   Umbruch.')).toEqual([
      'Ein Satz mit Umbruch.',
    ])
  })

  it('gibt bei leerem Text eine leere Liste zurück', () => {
    expect(splitSentences('   \n  ')).toEqual([])
  })

  // Der Punkt in "z. B." darf keine Sprechpause erzeugen.
  it('trennt nicht nach gängigen Abkürzungen', () => {
    expect(splitSentences('Er nahm z. B. das Buch mit.')).toEqual([
      'Er nahm z. B. das Buch mit.',
    ])
    expect(splitSentences('Dr. Meier kam später.')).toEqual([
      'Dr. Meier kam später.',
    ])
  })

  it('trennt nicht nach einzelnen Initialen', () => {
    expect(splitSentences('J. R. R. Tolkien schrieb viel.')).toEqual([
      'J. R. R. Tolkien schrieb viel.',
    ])
  })

  it('hängt sehr kurze Bruchstücke an den Vorgänger', () => {
    // "Ja." allein wäre ein unnatürlich kurzer Sprechabschnitt.
    expect(splitSentences('Ja. Das stimmt wohl.')).toEqual([
      'Ja. Das stimmt wohl.',
    ])
  })
})

describe('sanitizeForSpeech', () => {
  it('behält Buchstaben, Zahlen und natürliche Satzzeichen', () => {
    const text = 'Kapitel 1: „Der Anfang" – wirklich?'
    expect(sanitizeForSpeech(text)).toBe(text)
  })

  it('entfernt Zierzeichen und PDF-Artefakte', () => {
    expect(sanitizeForSpeech('Text ♥ mit ☆ Zierrat')).toBe('Text mit Zierrat')
  })

  it('fasst entstandene Leerräume zusammen und schneidet Ränder ab', () => {
    expect(sanitizeForSpeech('  ♥ ♥ Hallo ♥  ')).toBe('Hallo')
  })

  it('lässt Akzente und Umlaute unangetastet', () => {
    expect(sanitizeForSpeech('Café größer čeština')).toBe('Café größer čeština')
  })
})

describe('isSpeakable', () => {
  it('erkennt echten Text als sprechbar', () => {
    expect(isSpeakable('Ein Satz')).toBe(true)
  })

  it('überspringt reine Seitenzahlen und Zierlinien', () => {
    expect(isSpeakable('42')).toBe(false)
    expect(isSpeakable('* * *')).toBe(false)
    expect(isSpeakable('—')).toBe(false)
  })

  it('braucht mindestens zwei Buchstaben', () => {
    expect(isSpeakable('a')).toBe(false)
    expect(isSpeakable('ab')).toBe(true)
  })
})

describe('toSentences', () => {
  it('nummeriert Sätze fortlaufend über Seiten hinweg', () => {
    const result = toSentences(['Erste Seite.', 'Zweite Seite.'])
    expect(result.map((sentence) => sentence.text)).toEqual([
      'Erste Seite.',
      'Zweite Seite.',
    ])
    expect(result.map((sentence) => sentence.page)).toEqual([0, 1])
  })

  // Der eigentliche Zweck: ein am Seitenumbruch zerrissener Satz wird in
  // einem Zug gesprochen und auf beiden Seiten markiert.
  it('führt einen über die Seitengrenze zerrissenen Satz zusammen', () => {
    const result = toSentences(['Er saß auf dem Sofa und', 'drehte sich um.'])
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Er saß auf dem Sofa und drehte sich um.')
    expect(result[0].page).toBe(0)
    expect(result[0].segments.map((segment) => segment.page)).toEqual([0, 1])
  })

  it('führt nicht zusammen, wenn die Vorseite sauber endet', () => {
    const result = toSentences(['Ein ganzer Satz.', 'noch etwas Text.'])
    expect(result).toHaveLength(2)
  })

  it('führt nicht zusammen, wenn die Folgeseite groß beginnt (Überschrift)', () => {
    const result = toSentences(['Ein Satz ohne Ende', 'Kapitel zwei folgt.'])
    expect(result).toHaveLength(2)
  })

  it('führt nicht über eine übersprungene Seite hinweg zusammen', () => {
    // Seite 1 ist leer, die Fortsetzung stünde erst auf Seite 2.
    const result = toSentences(['Ein Satz ohne Ende', '', 'weiter geht es.'])
    expect(result).toHaveLength(2)
  })

  it('kommt mit leeren Seiten zurecht', () => {
    expect(toSentences(['', '   '])).toEqual([])
  })
})
