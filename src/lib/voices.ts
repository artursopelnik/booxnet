export type StudioVoiceId =
  | 'M1' | 'M2' | 'M3' | 'M4' | 'M5'
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5'

export interface StudioVoiceMeta {
  id: StudioVoiceId
  name: string
  gender: 'm' | 'f'
}

/**
 * Alle zehn Supertonic-3-Presets (M1–M5, F1–F5).
 *
 * Die Stimmen sind KEINE deutschen Sprecher, sondern mehrsprachige
 * Vorlagen, die alle 31 Sprachen sprechen. Wie natürlich eine davon auf
 * Deutsch klingt, lässt sich nur durch Hören herausfinden – deshalb sind
 * alle zehn zur Auswahl gestellt. Die Namen sind von dieser App
 * vergeben, damit die Auswahl nicht aus Kürzeln wie "M4" besteht.
 *
 * Sortiert nach Geschlecht, erst männlich, dann weiblich – gemischt war
 * die Liste bei zehn Einträgen unübersichtlich. Die Reihenfolge ist frei
 * wählbar: Gespeicherte Einstellungen und der Vorschau-Cache hängen an
 * der Kennung, nicht an der Position. Der erste Eintrag ist zugleich die
 * Vorgabe für neue Installationen und für den Fall, dass eine
 * gespeicherte Stimme nicht mehr existiert.
 */
export const STUDIO_VOICES: StudioVoiceMeta[] = [
  { id: 'M1', name: 'Alex', gender: 'm' },
  { id: 'M2', name: 'Jack', gender: 'm' },
  { id: 'M4', name: 'Norbert', gender: 'm' },
  { id: 'M3', name: 'Tobias', gender: 'm' },
  { id: 'M5', name: 'Sebastian', gender: 'm' },
  { id: 'F1', name: 'Eva', gender: 'f' },
  { id: 'F2', name: 'Martina', gender: 'f' },
  { id: 'F3', name: 'Lena', gender: 'f' },
  { id: 'F4', name: 'Sophie', gender: 'f' },
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
