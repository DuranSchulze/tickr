import { describe, expect, it } from 'vitest'
import {
  formatDayOfWeek,
  formatDurationClock,
  formatMonthDay,
  formatTimeOfDayInTimeZone,
} from '../tracker/shared/dates'
import { dtrIntegrationQuerySchema } from '../integrations/external-api.shared'

describe('dtr integration query validation', () => {
  it('accepts a user with an optional date', () => {
    expect(
      dtrIntegrationQuerySchema.parse({
        user: ' alex@example.com ',
        date: '2026-05-15',
      }),
    ).toEqual({
      user: 'alex@example.com',
      date: '2026-05-15',
    })
  })

  it('accepts a user without a date', () => {
    expect(dtrIntegrationQuerySchema.parse({ user: 'Alex' })).toEqual({
      user: 'Alex',
    })
  })

  it('rejects a missing user and malformed dates', () => {
    expect(() => dtrIntegrationQuerySchema.parse({})).toThrow()
    expect(() =>
      dtrIntegrationQuerySchema.parse({ user: 'Alex', date: '05/15/2026' }),
    ).toThrow()
  })
})

describe('dtr formatters', () => {
  it('formats a date key as month day and day of week', () => {
    expect(formatMonthDay('2026-05-15')).toBe('May 15')
    expect(formatDayOfWeek('2026-05-15')).toBe('Friday')
  })

  it('formats durations as H:MM:SS', () => {
    expect(formatDurationClock(0)).toBe('0:00:00')
    expect(formatDurationClock(32820)).toBe('9:07:00')
    expect(formatDurationClock(3661)).toBe('1:01:01')
    expect(formatDurationClock(7200)).toBe('2:00:00')
  })

  it('formats times of day in the workspace timezone', () => {
    const morning = new Date('2026-05-14T22:48:00.000Z')
    expect(formatTimeOfDayInTimeZone(morning, 'Asia/Manila')).toBe('6:48:00 AM')
    const afternoon = new Date('2026-05-15T08:55:00.000Z')
    expect(formatTimeOfDayInTimeZone(afternoon, 'Asia/Manila')).toBe(
      '4:55:00 PM',
    )
  })
})
