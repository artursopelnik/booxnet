import { describe, expect, it } from 'vitest'
import { STUDIO_VOICES, studioVoiceById } from './voices'

describe('Stimmen-Liste', () => {
  it('führt erst alle männlichen, dann alle weiblichen Stimmen', () => {
    const ersteWeibliche = STUDIO_VOICES.findIndex((v) => v.gender === 'f')
    const letzteMaennliche = STUDIO_VOICES.map((v) => v.gender).lastIndexOf('m')
    expect(letzteMaennliche).toBeLessThan(ersteWeibliche)
  })

  it('beginnt mit Alex', () => {
    expect(STUDIO_VOICES[0].name).toBe('Alex')
  })

  it('bietet alle zehn Vorlagen an, jede genau einmal', () => {
    expect(STUDIO_VOICES).toHaveLength(10)
    expect(new Set(STUDIO_VOICES.map((v) => v.id)).size).toBe(10)
    expect(new Set(STUDIO_VOICES.map((v) => v.name)).size).toBe(10)
  })

  it('findet Stimmen über ihre Kennung', () => {
    expect(studioVoiceById('F1')?.name).toBe('Eva')
    expect(studioVoiceById('gibtsnicht')).toBeUndefined()
    expect(studioVoiceById(null)).toBeUndefined()
  })
})
