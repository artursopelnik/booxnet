export type StudioVoiceId =
  | 'M1' | 'M2' | 'M3' | 'M4' | 'M5'
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5'

export interface StudioVoiceMeta {
  id: StudioVoiceId
  name: string
  gender: 'm' | 'f'
}

/**
 * Supertonic 3 preset styles (5 male, 5 female), each speaking all 31
 * languages. The friendly names are our own labels for the official
 * M1-M5/F1-F5 preset ids.
 */
export const STUDIO_VOICES: StudioVoiceMeta[] = [
  { id: 'M1', name: 'Alex', gender: 'm' },
  { id: 'M2', name: 'James', gender: 'm' },
  { id: 'M3', name: 'Oliver', gender: 'm' },
  { id: 'M4', name: 'Noah', gender: 'm' },
  { id: 'M5', name: 'Leon', gender: 'm' },
  { id: 'F1', name: 'Emma', gender: 'f' },
  { id: 'F2', name: 'Mia', gender: 'f' },
  { id: 'F3', name: 'Sophia', gender: 'f' },
  { id: 'F4', name: 'Ida', gender: 'f' },
  { id: 'F5', name: 'Clara', gender: 'f' },
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
