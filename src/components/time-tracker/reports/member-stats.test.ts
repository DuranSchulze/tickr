import { describe, expect, it } from 'vitest'
import { formatShortDay, periodDayCount } from './member-stats'

describe('formatShortDay', () => {
  it('formats a date key as a short label', () => {
    expect(formatShortDay('2026-08-24')).toBe('Aug 24')
  })

  it('is stable across timezone shifts by anchoring at UTC noon', () => {
    // 2026-01-01T12:00Z is still Jan 1 in UTC-11 through UTC+11.
    expect(formatShortDay('2026-01-01')).toBe('Jan 1')
  })

  it('returns the input unchanged for invalid keys', () => {
    expect(formatShortDay('not-a-date')).toBe('not-a-date')
  })
})

describe('periodDayCount', () => {
  it('counts both endpoints inclusively', () => {
    expect(periodDayCount('2026-08-01', '2026-08-24')).toBe(24)
  })

  it('returns 1 for a single-day range', () => {
    expect(periodDayCount('2026-08-24', '2026-08-24')).toBe(1)
  })

  it('handles month and year boundaries', () => {
    expect(periodDayCount('2026-07-26', '2026-08-24')).toBe(30)
    expect(periodDayCount('2025-12-31', '2026-01-01')).toBe(2)
  })

  it('falls back to 1 for invalid input', () => {
    expect(periodDayCount('nope', '2026-08-24')).toBe(1)
  })
})
