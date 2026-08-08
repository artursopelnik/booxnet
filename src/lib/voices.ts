export type StudioVoiceId =
  | 'M1' | 'M2' | 'M3' | 'M4' | 'M5'
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5'

export interface StudioVoiceMeta {
  id: StudioVoiceId
  name: string
  gender: 'm' | 'f'
}

/**
 * Kuratierte Auswahl aus den Supertonic-3-Presets (offiziell M1-M5 und
 * F1-F5, jedes spricht alle 31 Sprachen): Zehn Stimmen waren zu viel
 * Auswahl – es bleiben zwei markante Männer- und zwei Frauenstimmen mit
 * eigenen Namen. Wer früher eine entfernte Stimme (z. B. M1 "Alex")
 * gewählt hatte, fällt automatisch auf die erste der Liste zurück.
 */
export const STUDIO_VOICES: StudioVoiceMeta[] = [
  { id: 'M2', name: 'Jack', gender: 'm' },
  { id: 'M4', name: 'Norbert', gender: 'm' },
  { id: 'F1', name: 'Eva', gender: 'f' },
  { id: 'F2', name: 'Martina', gender: 'f' },
]

export function studioVoiceById(
  id: string | null | undefined,
): StudioVoiceMeta | undefined {
  return STUDIO_VOICES.find((voice) => voice.id === id)
}

/** Languages Supertonic 3 can synthesize. */
export const STUDIO_LANGS = [
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hi',
  'hr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro',
  'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi',
] as const
