/** Anzeige-Einstellungen des Readers: Schriftgröße und Markierungsstil. */
import { readNumberSetting, readSetting, writeSetting } from './storage'

export type HighlightStyle = 'mark' | 'underline' | 'invert'

const FONT_KEY = 'booxnet.fontScale'
const HIGHLIGHT_KEY = 'booxnet.highlight'

export const FONT_SCALE_MIN = 90
export const FONT_SCALE_MAX = 170
export const FONT_SCALE_STEP = 10

/** Schriftgröße in Prozent der Standardgröße (90–170, Standard 100). */
export function getFontScale(): number {
  return readNumberSetting(FONT_KEY, FONT_SCALE_MIN, FONT_SCALE_MAX, 100)
}

export function saveFontScale(scale: number): void {
  writeSetting(FONT_KEY, String(scale))
}

export function getHighlightStyle(): HighlightStyle {
  const value = readSetting(HIGHLIGHT_KEY)
  return value === 'underline' || value === 'invert' ? value : 'mark'
}

export function saveHighlightStyle(style: HighlightStyle): void {
  writeSetting(HIGHLIGHT_KEY, style)
}
