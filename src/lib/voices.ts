import type { VoiceId } from '@diffusionstudio/vits-web'

export type NeuralQuality = 'x_low' | 'low' | 'medium' | 'high'

export interface NeuralVoiceMeta {
  id: VoiceId
  name: string
  lang: string
  quality: NeuralQuality
  /** Approximate model download size. */
  sizeMB: number
}

/**
 * A voice the user can pick: either a system voice (Web Speech API) or a
 * neural Piper voice that runs locally via WASM after a one-time download.
 */
export type AppVoice =
  | {
      kind: 'system'
      key: string
      name: string
      lang: string
      offline: boolean
      systemVoice: SpeechSynthesisVoice
    }
  | {
      kind: 'neural'
      key: string
      name: string
      lang: string
      meta: NeuralVoiceMeta
    }

export function systemVoiceToAppVoice(voice: SpeechSynthesisVoice): AppVoice {
  return {
    kind: 'system',
    key: `system:${voice.voiceURI}`,
    name: voice.name,
    lang: voice.lang,
    offline: voice.localService,
    systemVoice: voice,
  }
}

export function neuralVoiceToAppVoice(meta: NeuralVoiceMeta): AppVoice {
  return {
    kind: 'neural',
    key: `neural:${meta.id}`,
    name: meta.name,
    lang: meta.lang,
    meta,
  }
}

const SIZE_BY_QUALITY: Record<NeuralQuality, number> = {
  x_low: 28,
  low: 63,
  medium: 63,
  high: 110,
}

function voice(
  id: VoiceId,
  name: string,
  lang: string,
  quality: NeuralQuality,
): NeuralVoiceMeta {
  return { id, name, lang, quality, sizeMB: SIZE_BY_QUALITY[quality] }
}

/**
 * Curated Piper voices. Kept small on purpose: one great default per
 * language plus a few alternatives, instead of the full 100+ voice list.
 */
export const NEURAL_VOICES: NeuralVoiceMeta[] = [
  voice('de_DE-thorsten-high', 'Thorsten (beste Qualität)', 'de-DE', 'high'),
  voice('de_DE-thorsten-medium', 'Thorsten', 'de-DE', 'medium'),
  voice(
    'de_DE-thorsten_emotional-medium',
    'Thorsten (emotional)',
    'de-DE',
    'medium',
  ),
  voice('de_DE-kerstin-low', 'Kerstin', 'de-DE', 'low'),
  voice('de_DE-ramona-low', 'Ramona', 'de-DE', 'low'),
  voice('de_DE-karlsson-low', 'Karlsson', 'de-DE', 'low'),
  voice('de_DE-eva_k-x_low', 'Eva (klein & schnell)', 'de-DE', 'x_low'),
  voice('en_US-ryan-high', 'Ryan (beste Qualität)', 'en-US', 'high'),
  voice('en_US-amy-medium', 'Amy', 'en-US', 'medium'),
  voice('en_US-lessac-medium', 'Lessac', 'en-US', 'medium'),
  voice('en_GB-alan-medium', 'Alan', 'en-GB', 'medium'),
  voice('en_GB-jenny_dioco-medium', 'Jenny', 'en-GB', 'medium'),
  voice('fr_FR-siwis-medium', 'Siwis', 'fr-FR', 'medium'),
  voice('es_ES-davefx-medium', 'DaveFX', 'es-ES', 'medium'),
  voice('it_IT-riccardo-x_low', 'Riccardo (klein & schnell)', 'it-IT', 'x_low'),
]
