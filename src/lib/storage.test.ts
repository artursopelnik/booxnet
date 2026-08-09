import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  readNumberSetting,
  readSetting,
  removeSetting,
  writeSetting,
} from './storage'

const workingStorage = globalThis.localStorage

/** Speicher, der bei jedem Zugriff wirft – wie in privaten Fenstern. */
function useBlockedStorage(): void {
  const blocked = {
    getItem: () => {
      throw new DOMException('blocked', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('blocked', 'SecurityError')
    },
    removeItem: () => {
      throw new DOMException('blocked', 'SecurityError')
    },
  }
  globalThis.localStorage = blocked as unknown as Storage
}

beforeEach(() => {
  globalThis.localStorage = workingStorage
  localStorage.clear()
})

afterEach(() => {
  globalThis.localStorage = workingStorage
})

describe('mit funktionierendem Speicher', () => {
  it('schreibt und liest zurück', () => {
    writeSetting('taste', 'wert')
    expect(readSetting('taste')).toBe('wert')
  })

  it('liefert null für unbekannte Schlüssel', () => {
    expect(readSetting('gibtsnicht')).toBeNull()
  })

  it('entfernt Einträge', () => {
    writeSetting('taste', 'wert')
    removeSetting('taste')
    expect(readSetting('taste')).toBeNull()
  })
})

// Der eigentliche Zweck des Moduls: Ein blockierter Speicher darf die App
// nicht mitreißen – in privaten Fenstern wirft schon das Lesen.
describe('mit blockiertem Speicher', () => {
  it('liefert beim Lesen null statt zu werfen', () => {
    useBlockedStorage()
    expect(() => readSetting('taste')).not.toThrow()
    expect(readSetting('taste')).toBeNull()
  })

  it('verschluckt Schreiben und Entfernen', () => {
    useBlockedStorage()
    expect(() => writeSetting('taste', 'wert')).not.toThrow()
    expect(() => removeSetting('taste')).not.toThrow()
  })

  it('liefert bei Zahl-Einstellungen den Standardwert', () => {
    useBlockedStorage()
    expect(readNumberSetting('taste', 0, 10, 7)).toBe(7)
  })
})

describe('readNumberSetting', () => {
  it('gibt gespeicherte Zahlen im erlaubten Bereich zurück', () => {
    writeSetting('zahl', '5')
    expect(readNumberSetting('zahl', 0, 10, 1)).toBe(5)
  })

  it('nimmt die Randwerte an', () => {
    writeSetting('zahl', '0')
    expect(readNumberSetting('zahl', 0, 10, 1)).toBe(0)
    writeSetting('zahl', '10')
    expect(readNumberSetting('zahl', 0, 10, 1)).toBe(10)
  })

  it('verwirft Werte außerhalb des Bereichs', () => {
    writeSetting('zahl', '11')
    expect(readNumberSetting('zahl', 0, 10, 1)).toBe(1)
    writeSetting('zahl', '-1')
    expect(readNumberSetting('zahl', 0, 10, 1)).toBe(1)
  })

  it('verwirft Text und Unendlich', () => {
    writeSetting('zahl', 'viel')
    expect(readNumberSetting('zahl', 0, 10, 1)).toBe(1)
    writeSetting('zahl', 'Infinity')
    expect(readNumberSetting('zahl', 0, 10, 1)).toBe(1)
  })

  // Number('') ist 0 – ohne Prüfung würde ein leerer Eintrag als gültige
  // Null durchgehen und z. B. die Schriftgröße auf 0 setzen.
  it('behandelt einen leeren Eintrag nicht als Null', () => {
    writeSetting('zahl', '')
    expect(readNumberSetting('zahl', 0, 10, 7)).toBe(7)
  })
})
