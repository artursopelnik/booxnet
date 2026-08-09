/**
 * Darstellung: Automatisch (folgt dem System), Hell, Dunkel oder E-Ink
 * (heller Hochkontrast-Modus mit kräftiger Lese-Markierung – gedacht zum
 * Mitlesen). Die Wahl liegt in localStorage und wird als Klasse auf
 * <html> angewendet; die Ionic-Paletten dafür lädt main.tsx
 * (dark.class.css / high-contrast.class.css).
 */

import { t } from './i18n'
import { readSetting, removeSetting, writeSetting } from './storage'

export type ThemeChoice = 'auto' | 'light' | 'dark' | 'eink'

const THEME_KEY = 'booxnet.theme'
const DARK_CLASS = 'ion-palette-dark'
const CONTRAST_CLASS = 'ion-palette-high-contrast'
const EINK_CLASS = 'theme-eink'

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): ThemeChoice {
  const value = readSetting(THEME_KEY)
  return value === 'light' || value === 'dark' || value === 'eink'
    ? value
    : 'auto'
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement
  const dark = choice === 'dark' || (choice === 'auto' && systemDark.matches)
  root.classList.toggle(DARK_CLASS, dark)
  root.classList.toggle(CONTRAST_CLASS, choice === 'eink')
  root.classList.toggle(EINK_CLASS, choice === 'eink')
}

export function setTheme(choice: ThemeChoice): void {
  if (choice === 'auto') removeSetting(THEME_KEY)
  else writeSetting(THEME_KEY, choice)
  apply(choice)
}

/** Beim App-Start aufrufen: wendet die gespeicherte Wahl an und folgt im
 * Automatik-Modus künftigen Systemwechseln. */
export function applyStoredTheme(): void {
  apply(getTheme())
  systemDark.addEventListener('change', () => {
    if (getTheme() === 'auto') apply('auto')
  })
}

/** Beschriftung in der Oberflächensprache. */
export function themeLabel(choice: ThemeChoice): string {
  return t(`theme.${choice}`)
}
