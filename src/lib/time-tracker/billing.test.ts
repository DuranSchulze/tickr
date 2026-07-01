import { describe, expect, it } from 'vitest'
import { computeEffectiveRate } from './billing'

describe('computeEffectiveRate', () => {
  it('uses client rate before member and workspace rates', () => {
    expect(computeEffectiveRate(1500, 1000, 500)).toBe(1500)
  })

  it('falls back to member rate when client rate is missing', () => {
    expect(computeEffectiveRate(null, 1000, 500)).toBe(1000)
  })

  it('falls back to workspace rate when client and member rates are missing', () => {
    expect(computeEffectiveRate(null, null, 500)).toBe(500)
  })

  it('preserves the previous two-argument member/workspace behavior', () => {
    expect(computeEffectiveRate(1000, 500)).toBe(1000)
    expect(computeEffectiveRate(null, 500)).toBe(500)
  })
})
