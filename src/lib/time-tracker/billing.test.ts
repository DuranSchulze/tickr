import { describe, expect, it } from 'vitest'
import { computeBillableRate, computeEffectiveRate } from './billing'

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

describe('computeBillableRate', () => {
  it('uses member-client rate before client, member, and workspace rates', () => {
    expect(
      computeBillableRate({
        memberClientRate: 1600,
        clientDefaultRate: 1400,
        memberRate: 1000,
        workspaceDefaultRate: 500,
      }),
    ).toBe(1600)
  })

  it('uses client default rate before member and workspace rates', () => {
    expect(
      computeBillableRate({
        memberClientRate: null,
        clientDefaultRate: 1400,
        memberRate: 1000,
        workspaceDefaultRate: 500,
      }),
    ).toBe(1400)
  })

  it('falls back from client default to member then workspace rates', () => {
    expect(
      computeBillableRate({
        memberClientRate: null,
        clientDefaultRate: null,
        memberRate: 1000,
        workspaceDefaultRate: 500,
      }),
    ).toBe(1000)
    expect(
      computeBillableRate({
        memberClientRate: null,
        clientDefaultRate: null,
        memberRate: null,
        workspaceDefaultRate: 500,
      }),
    ).toBe(500)
  })

  it('falls back safely for invalid values', () => {
    expect(
      computeBillableRate({
        memberClientRate: -10,
        clientDefaultRate: Number.NaN,
        memberRate: Number.POSITIVE_INFINITY,
        workspaceDefaultRate: 500,
      }),
    ).toBe(500)
  })
})
