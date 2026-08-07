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

export type StudioVoiceId =
  | 'M1' | 'M2' | 'M3' | 'M4' | 'M5'
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5'

export interface StudioVoiceMeta {
  id: StudioVoiceId
  name: string
  gender: 'm' | 'f'
}

/**
 * A voice the user can pick:
 * - 'system'  Web Speech API voice, instantly available
 * - 'neural'  Piper voice via WASM, one-time per-voice download
 * - 'studio'  Supertonic 3 preset, multilingual, needs the studio pack
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
  | {
      kind: 'studio'
      key: string
      name: string
      lang: string
      meta: StudioVoiceMeta
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

export function studioVoiceToAppVoice(meta: StudioVoiceMeta): AppVoice {
  return {
    kind: 'studio',
    key: `studio:${meta.id}`,
    name: meta.name,
    // Studio voices are multilingual; 'multi' is handled specially in the UI.
    lang: 'multi',
    meta,
  }
}

/**
 * Supertonic 3 preset styles (5 male, 5 female), each speaking all 31
 * languages. The friendly names are our own labels for the official
 * M1-M5/F1-F5 preset ids.
 */
export const STUDIO_VOICES: StudioVoiceMeta[] = [
  { id: 'M1', name: 'Mats', gender: 'm' },
  { id: 'M2', name: 'Jonas', gender: 'm' },
  { id: 'M3', name: 'Otto', gender: 'm' },
  { id: 'M4', name: 'Paul', gender: 'm' },
  { id: 'M5', name: 'Emil', gender: 'm' },
  { id: 'F1', name: 'Frida', gender: 'f' },
  { id: 'F2', name: 'Greta', gender: 'f' },
  { id: 'F3', name: 'Hanna', gender: 'f' },
  { id: 'F4', name: 'Ida', gender: 'f' },
  { id: 'F5', name: 'Klara', gender: 'f' },
]

/** Languages Supertonic 3 can synthesize. */
export const STUDIO_LANGS = [
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hi',
  'hr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro',
  'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi',
] as const

const SIZE_BY_QUALITY: Record<NeuralQuality, number> = {
  x_low: 28,
  low: 63,
  medium: 63,
  high: 110,
}

function p(
  id: VoiceId,
  name: string,
  lang: string,
  quality: NeuralQuality,
): NeuralVoiceMeta {
  return { id, name, lang, quality, sizeMB: SIZE_BY_QUALITY[quality] }
}

/** The full Piper catalog supported by @diffusionstudio/vits-web. */
export const NEURAL_VOICES: NeuralVoiceMeta[] = [
  p('ar_JO-kareem-low', 'Kareem', 'ar-JO', 'low'),
  p('ar_JO-kareem-medium', 'Kareem', 'ar-JO', 'medium'),
  p('ca_ES-upc_ona-medium', 'Upc Ona', 'ca-ES', 'medium'),
  p('ca_ES-upc_ona-x_low', 'Upc Ona', 'ca-ES', 'x_low'),
  p('ca_ES-upc_pau-x_low', 'Upc Pau', 'ca-ES', 'x_low'),
  p('cs_CZ-jirka-low', 'Jirka', 'cs-CZ', 'low'),
  p('cs_CZ-jirka-medium', 'Jirka', 'cs-CZ', 'medium'),
  p('da_DK-talesyntese-medium', 'Talesyntese', 'da-DK', 'medium'),
  p('de_DE-eva_k-x_low', 'Eva K', 'de-DE', 'x_low'),
  p('de_DE-karlsson-low', 'Karlsson', 'de-DE', 'low'),
  p('de_DE-kerstin-low', 'Kerstin', 'de-DE', 'low'),
  p('de_DE-mls-medium', 'Mls', 'de-DE', 'medium'),
  p('de_DE-pavoque-low', 'Pavoque', 'de-DE', 'low'),
  p('de_DE-ramona-low', 'Ramona', 'de-DE', 'low'),
  p('de_DE-thorsten-high', 'Thorsten', 'de-DE', 'high'),
  p('de_DE-thorsten-low', 'Thorsten', 'de-DE', 'low'),
  p('de_DE-thorsten-medium', 'Thorsten', 'de-DE', 'medium'),
  p('de_DE-thorsten_emotional-medium', 'Thorsten Emotional', 'de-DE', 'medium'),
  p('el_GR-rapunzelina-low', 'Rapunzelina', 'el-GR', 'low'),
  p('en_GB-alan-low', 'Alan', 'en-GB', 'low'),
  p('en_GB-alan-medium', 'Alan', 'en-GB', 'medium'),
  p('en_GB-alba-medium', 'Alba', 'en-GB', 'medium'),
  p('en_GB-aru-medium', 'Aru', 'en-GB', 'medium'),
  p('en_GB-cori-high', 'Cori', 'en-GB', 'high'),
  p('en_GB-cori-medium', 'Cori', 'en-GB', 'medium'),
  p('en_GB-jenny_dioco-medium', 'Jenny Dioco', 'en-GB', 'medium'),
  p('en_GB-northern_english_male-medium', 'Northern English Male', 'en-GB', 'medium'),
  p('en_GB-semaine-medium', 'Semaine', 'en-GB', 'medium'),
  p('en_GB-southern_english_female-low', 'Southern English Female', 'en-GB', 'low'),
  p('en_GB-vctk-medium', 'Vctk', 'en-GB', 'medium'),
  p('en_US-amy-low', 'Amy', 'en-US', 'low'),
  p('en_US-amy-medium', 'Amy', 'en-US', 'medium'),
  p('en_US-arctic-medium', 'Arctic', 'en-US', 'medium'),
  p('en_US-danny-low', 'Danny', 'en-US', 'low'),
  p('en_US-hfc_female-medium', 'Hfc Female', 'en-US', 'medium'),
  p('en_US-hfc_male-medium', 'Hfc Male', 'en-US', 'medium'),
  p('en_US-joe-medium', 'Joe', 'en-US', 'medium'),
  p('en_US-kathleen-low', 'Kathleen', 'en-US', 'low'),
  p('en_US-kristin-medium', 'Kristin', 'en-US', 'medium'),
  p('en_US-kusal-medium', 'Kusal', 'en-US', 'medium'),
  p('en_US-l2arctic-medium', 'L2arctic', 'en-US', 'medium'),
  p('en_US-lessac-high', 'Lessac', 'en-US', 'high'),
  p('en_US-lessac-low', 'Lessac', 'en-US', 'low'),
  p('en_US-lessac-medium', 'Lessac', 'en-US', 'medium'),
  p('en_US-libritts-high', 'Libritts', 'en-US', 'high'),
  p('en_US-libritts_r-medium', 'Libritts R', 'en-US', 'medium'),
  p('en_US-ljspeech-high', 'Ljspeech', 'en-US', 'high'),
  p('en_US-ljspeech-medium', 'Ljspeech', 'en-US', 'medium'),
  p('en_US-ryan-high', 'Ryan', 'en-US', 'high'),
  p('en_US-ryan-low', 'Ryan', 'en-US', 'low'),
  p('en_US-ryan-medium', 'Ryan', 'en-US', 'medium'),
  p('es_ES-carlfm-x_low', 'Carlfm', 'es-ES', 'x_low'),
  p('es_ES-davefx-medium', 'Davefx', 'es-ES', 'medium'),
  p('es_ES-mls_10246-low', 'Mls 10246', 'es-ES', 'low'),
  p('es_ES-mls_9972-low', 'Mls 9972', 'es-ES', 'low'),
  p('es_ES-sharvard-medium', 'Sharvard', 'es-ES', 'medium'),
  p('es_MX-ald-medium', 'Ald', 'es-MX', 'medium'),
  p('es_MX-claude-high', 'Claude', 'es-MX', 'high'),
  p('fa_IR-amir-medium', 'Amir', 'fa-IR', 'medium'),
  p('fa_IR-gyro-medium', 'Gyro', 'fa-IR', 'medium'),
  p('fi_FI-harri-low', 'Harri', 'fi-FI', 'low'),
  p('fi_FI-harri-medium', 'Harri', 'fi-FI', 'medium'),
  p('fr_FR-gilles-low', 'Gilles', 'fr-FR', 'low'),
  p('fr_FR-mls-medium', 'Mls', 'fr-FR', 'medium'),
  p('fr_FR-mls_1840-low', 'Mls 1840', 'fr-FR', 'low'),
  p('fr_FR-siwis-low', 'Siwis', 'fr-FR', 'low'),
  p('fr_FR-siwis-medium', 'Siwis', 'fr-FR', 'medium'),
  p('fr_FR-tom-medium', 'Tom', 'fr-FR', 'medium'),
  p('fr_FR-upmc-medium', 'Upmc', 'fr-FR', 'medium'),
  p('hu_HU-anna-medium', 'Anna', 'hu-HU', 'medium'),
  p('hu_HU-berta-medium', 'Berta', 'hu-HU', 'medium'),
  p('hu_HU-imre-medium', 'Imre', 'hu-HU', 'medium'),
  p('is_IS-bui-medium', 'Bui', 'is-IS', 'medium'),
  p('is_IS-salka-medium', 'Salka', 'is-IS', 'medium'),
  p('is_IS-steinn-medium', 'Steinn', 'is-IS', 'medium'),
  p('is_IS-ugla-medium', 'Ugla', 'is-IS', 'medium'),
  p('it_IT-riccardo-x_low', 'Riccardo', 'it-IT', 'x_low'),
  p('ka_GE-natia-medium', 'Natia', 'ka-GE', 'medium'),
  p('kk_KZ-iseke-x_low', 'Iseke', 'kk-KZ', 'x_low'),
  p('kk_KZ-issai-high', 'Issai', 'kk-KZ', 'high'),
  p('kk_KZ-raya-x_low', 'Raya', 'kk-KZ', 'x_low'),
  p('lb_LU-marylux-medium', 'Marylux', 'lb-LU', 'medium'),
  p('ne_NP-google-medium', 'Google', 'ne-NP', 'medium'),
  p('ne_NP-google-x_low', 'Google', 'ne-NP', 'x_low'),
  p('nl_BE-nathalie-medium', 'Nathalie', 'nl-BE', 'medium'),
  p('nl_BE-nathalie-x_low', 'Nathalie', 'nl-BE', 'x_low'),
  p('nl_BE-rdh-medium', 'Rdh', 'nl-BE', 'medium'),
  p('nl_BE-rdh-x_low', 'Rdh', 'nl-BE', 'x_low'),
  p('nl_NL-mls-medium', 'Mls', 'nl-NL', 'medium'),
  p('nl_NL-mls_5809-low', 'Mls 5809', 'nl-NL', 'low'),
  p('nl_NL-mls_7432-low', 'Mls 7432', 'nl-NL', 'low'),
  p('no_NO-talesyntese-medium', 'Talesyntese', 'no-NO', 'medium'),
  p('pl_PL-darkman-medium', 'Darkman', 'pl-PL', 'medium'),
  p('pl_PL-gosia-medium', 'Gosia', 'pl-PL', 'medium'),
  p('pl_PL-mc_speech-medium', 'Mc Speech', 'pl-PL', 'medium'),
  p('pl_PL-mls_6892-low', 'Mls 6892', 'pl-PL', 'low'),
  p('pt_BR-edresson-low', 'Edresson', 'pt-BR', 'low'),
  p('pt_BR-faber-medium', 'Faber', 'pt-BR', 'medium'),
  p('pt_PT-tugão-medium', 'Tugão', 'pt-PT', 'medium'),
  p('ro_RO-mihai-medium', 'Mihai', 'ro-RO', 'medium'),
  p('ru_RU-denis-medium', 'Denis', 'ru-RU', 'medium'),
  p('ru_RU-dmitri-medium', 'Dmitri', 'ru-RU', 'medium'),
  p('ru_RU-irina-medium', 'Irina', 'ru-RU', 'medium'),
  p('ru_RU-ruslan-medium', 'Ruslan', 'ru-RU', 'medium'),
  p('sk_SK-lili-medium', 'Lili', 'sk-SK', 'medium'),
  p('sl_SI-artur-medium', 'Artur', 'sl-SI', 'medium'),
  p('sr_RS-serbski_institut-medium', 'Serbski Institut', 'sr-RS', 'medium'),
  p('sv_SE-nst-medium', 'Nst', 'sv-SE', 'medium'),
  p('sw_CD-lanfrica-medium', 'Lanfrica', 'sw-CD', 'medium'),
  p('tr_TR-dfki-medium', 'Dfki', 'tr-TR', 'medium'),
  p('tr_TR-fahrettin-medium', 'Fahrettin', 'tr-TR', 'medium'),
  p('tr_TR-fettah-medium', 'Fettah', 'tr-TR', 'medium'),
  p('uk_UA-lada-x_low', 'Lada', 'uk-UA', 'x_low'),
  p('uk_UA-ukrainian_tts-medium', 'Ukrainian Tts', 'uk-UA', 'medium'),
  p('vi_VN-25hours_single-low', '25hours Single', 'vi-VN', 'low'),
  p('vi_VN-vais1000-medium', 'Vais1000', 'vi-VN', 'medium'),
  p('vi_VN-vivos-x_low', 'Vivos', 'vi-VN', 'x_low'),
  p('zh_CN-huayan-medium', 'Huayan', 'zh-CN', 'medium'),
  p('zh_CN-huayan-x_low', 'Huayan', 'zh-CN', 'x_low'),
]

/** Voice/language totals for marketing copy, computed from the catalogs. */
export const VOICE_STATS = (() => {
  const langs = new Set<string>(STUDIO_LANGS)
  for (const voice of NEURAL_VOICES) {
    langs.add(voice.lang.split('-')[0])
  }
  return {
    voices: NEURAL_VOICES.length + STUDIO_VOICES.length,
    languages: langs.size,
  }
})()
