/**
 * Zugang zu den Übersetzungen aus React heraus.
 *
 * Eigene Datei, damit lib/i18n.ts frei von React bleibt – die
 * Fehlertexte dort werden auch aus Modulen ohne Oberfläche gebraucht.
 * Der Haken abonniert den Sprachwechsel, damit ein Umschalten sofort
 * durchschlägt und kein Neuladen nötig ist.
 */
import { useSyncExternalStore } from 'react'
import { getUiLang, subscribeUiLang, t, type MessageKey } from './i18n'

export function useT(): (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string {
  useSyncExternalStore(subscribeUiLang, getUiLang, getUiLang)
  return t
}
