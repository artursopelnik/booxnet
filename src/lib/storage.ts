/**
 * Einstellungen dauerhaft merken, ohne dass ein blockierter Speicher die
 * App mitreißt.
 *
 * In privaten Fenstern und bei strengen Datenschutz-Einstellungen wirft
 * schon der reine Zugriff auf localStorage – nicht erst das Schreiben.
 * Ohne Absicherung stirbt dadurch der Reader beim Laden gespeicherter
 * Werte. Diese drei Funktionen kapseln das an einer Stelle, statt die
 * try/catch-Hülle in jedem Einstellungsmodul zu wiederholen: Lesen
 * liefert dann null, Schreiben verpufft still, und die Einstellung gilt
 * eben nur für diese Sitzung.
 */

export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Gilt dann nur für diese Sitzung.
  }
}

export function removeSetting(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ohne Speicher gab es den Eintrag ohnehin nie.
  }
}

/**
 * Zahl-Einstellung innerhalb eines erlaubten Bereichs. Alles andere –
 * fehlender Eintrag, Text, veralteter oder manipulierter Wert – ergibt
 * den Standardwert, damit eine kaputte Einstellung nie die Bedienung
 * unbrauchbar macht.
 */
export function readNumberSetting(
  key: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const stored = readSetting(key)
  // Fehlender und leerer Eintrag zuerst abfangen: Number(null) und
  // Number('') sind beide 0 und kaemen bei einem Bereich ab 0 sonst als
  // gueltiger Wert durch.
  if (stored === null || stored.trim() === '') return fallback
  const value = Number(stored)
  return Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback
}
