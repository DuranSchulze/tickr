import { describe, expect, it } from 'vitest'
import {
  nextWeeklyReport,
  retryAllowed,
  retryDelayMs,
} from './weekly-report-schedule'

describe('weekly report calendar', () => {
  it('schedules Sunday 8 AM Manila for the complete preceding week', () => {
    expect(
      nextWeeklyReport(new Date('2026-10-20T00:00:00Z'), 'Asia/Manila'),
    ).toEqual({
      dueAt: '2026-10-25T00:00:00.000Z',
      weekStart: '2026-10-18',
      weekEnd: '2026-10-24',
    })
  })
  it('moves to next week at the boundary and handles year changes', () => {
    expect(
      nextWeeklyReport(new Date('2026-10-25T00:00:00Z'), 'Asia/Manila').weekEnd,
    ).toBe('2026-10-31')
    expect(
      nextWeeklyReport(new Date('2026-12-31T12:00:00Z'), 'UTC'),
    ).toMatchObject({ weekStart: '2026-12-27', weekEnd: '2027-01-02' })
  })
  it.each([
    ['2026-03-07T12:00:00Z', '2026-03-08T12:00:00.000Z'],
    ['2026-10-31T12:00:00Z', '2026-11-01T13:00:00.000Z'],
  ])('uses the Sunday DST offset for %s', (now, dueAt) => {
    expect(nextWeeklyReport(new Date(now), 'America/New_York').dueAt).toBe(
      dueAt,
    )
  })
  it('respects Retry-After, attempt count and the 20-hour limit', () => {
    expect(retryDelayMs(2, 300)).toBe(300000)
    expect(retryAllowed(5, new Date(0), new Date(1000))).toBe(false)
    expect(retryAllowed(4, new Date(0), new Date(20 * 3600000))).toBe(false)
    expect(retryAllowed(4, new Date(0), new Date(19 * 3600000))).toBe(true)
  })
})
