/** Anzeige-Einstellungen des Readers: Schriftgröße und Markierungsstil. */

export type HighlightStyle = 'mark' | 'underline' | 'invert'

const FONT_KEY = 'booxnet.fontScale'
const HIGHLIGHT_KEY = 'booxnet.highlight'

export const FONT_SCALE_MIN = 90
export const FONT_SCALE_MAX = 170
export const FONT_SCALE_STEP = 10

/** Schriftgröße in Prozent der Standardgröße (90–170, Standard 100). */
export function getFontScale(): number {
  try {
    const value = Number(localStorage.getItem(FONT_KEY))
    if (value >= FONT_SCALE_MIN && value <= FONT_SCALE_MAX) return value
  } catch {
    // Ohne Speicher gilt der Standard.
  }
  return 100
}

export function saveFontScale(scale: number): void {
  try {
    localStorage.setItem(FONT_KEY, String(scale))
  } catch {
    // Gilt dann nur für diese Sitzung.
  }
}

export function getHighlightStyle(): HighlightStyle {
  try {
    const value = localStorage.getItem(HIGHLIGHT_KEY)
    if (value === 'underline' || value === 'invert') return value
  } catch {
    // Ohne Speicher gilt der Standard.
  }
  return 'mark'
}

export function saveHighlightStyle(style: HighlightStyle): void {
  try {
    localStorage.setItem(HIGHLIGHT_KEY, style)
  } catch {
    // Gilt dann nur für diese Sitzung.
  }
}
