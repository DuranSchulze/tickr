import { describe, it, expect } from 'vitest'
import {
  addUtcDays,
  buildDateKeys,
  calculateDuration,
  getAnalyticsDateRange,
  parseDateOnly,
  toDateKey,
  toIso,
} from '../tracker/shared/dates'

describe('toIso', () => {
  it('returns null for null', () => {
    expect(toIso(null)).toBe(null)
  })
  it('serializes Date to ISO', () => {
    expect(toIso(new Date('2026-04-25T10:00:00Z'))).toBe(
      '2026-04-25T10:00:00.000Z',
    )
  })
  it('parses string and re-serializes', () => {
    expect(toIso('2026-04-25T10:00:00Z')).toBe('2026-04-25T10:00:00.000Z')
  })
})

describe('calculateDuration', () => {
  it('returns 0 when endedAt is null (running timer)', () => {
    expect(calculateDuration(new Date(), null)).toBe(0)
  })
  it('floors fractional seconds', () => {
    const start = new Date('2026-04-25T00:00:00Z')
    const end = new Date('2026-04-25T00:00:01.500Z')
    expect(calculateDuration(start, end)).toBe(1)
  })
  it('clamps negative durations to zero', () => {
    const start = new Date('2026-04-25T00:00:10Z')
    const end = new Date('2026-04-25T00:00:00Z')
    expect(calculateDuration(start, end)).toBe(0)
  })
  it('computes whole hours correctly', () => {
    const start = new Date('2026-04-25T00:00:00Z')
    const end = new Date('2026-04-25T02:00:00Z')
    expect(calculateDuration(start, end)).toBe(7200)
  })
})

describe('parseDateOnly + toDateKey + addUtcDays', () => {
  it('parses YYYY-MM-DD as midnight UTC', () => {
    expect(parseDateOnly('2026-04-25').toISOString()).toBe(
      '2026-04-25T00:00:00.000Z',
    )
  })
  it('roundtrips via toDateKey', () => {
    expect(toDateKey(parseDateOnly('2026-04-25'))).toBe('2026-04-25')
  })
  it('addUtcDays adds whole days in UTC', () => {
    expect(toDateKey(addUtcDays(parseDateOnly('2026-04-25'), 3))).toBe(
      '2026-04-28',
    )
  })
  it('addUtcDays handles negative offsets', () => {
    expect(toDateKey(addUtcDays(parseDateOnly('2026-04-25'), -5))).toBe(
      '2026-04-20',
    )
  })
})

describe('buildDateKeys', () => {
  it('emits an inclusive sequence of YYYY-MM-DD strings', () => {
    expect(
      buildDateKeys(parseDateOnly('2026-04-25'), parseDateOnly('2026-04-28')),
    ).toEqual(['2026-04-25', '2026-04-26', '2026-04-27', '2026-04-28'])
  })
  it('returns a single key when start == end', () => {
    expect(
      buildDateKeys(parseDateOnly('2026-04-25'), parseDateOnly('2026-04-25')),
    ).toEqual(['2026-04-25'])
  })
})

describe('getAnalyticsDateRange', () => {
  it('passes through a valid in-range pair', () => {
    const r = getAnalyticsDateRange({
      startDate: '2026-04-20',
      endDate: '2026-04-25',
    })
    expect(r.startDate).toBe('2026-04-20')
    expect(r.endDate).toBe('2026-04-25')
    expect(toDateKey(r.endExclusive)).toBe('2026-04-26')
  })
  it('falls back to last 30 days when start > end', () => {
    const r = getAnalyticsDateRange({
      startDate: '2026-04-25',
      endDate: '2026-04-20',
    })
    expect(toDateKey(addUtcDays(r.start, 29))).toBe(r.endDate)
  })
  it('caps the lookback at 365 days', () => {
    const r = getAnalyticsDateRange({
      startDate: '2020-01-01',
      endDate: '2026-04-25',
    })
    expect(toDateKey(addUtcDays(r.start, 365))).toBe('2026-04-25')
  })
})
