import { describe, expect, it } from 'vitest'
import { getWorkspaceDateRange } from '../dates'
import { dateKeyInTimeZone } from '#/lib/time-tracker/timesheet'

describe('performance query date boundaries', () => {
  it('includes Manila activity before UTC month start', () => {
    const now = new Date('2026-08-31T17:00:00Z')
    const today = dateKeyInTimeZone(now, 'Asia/Manila')
    const range = getWorkspaceDateRange(
      {
        startDate: `${today.slice(0, 7)}-01`,
        endDate: today,
      },
      'Asia/Manila',
    )
    expect(range.start.toISOString()).toBe('2026-08-31T16:00:00.000Z')
    expect(range.endExclusive.toISOString()).toBe('2026-09-01T16:00:00.000Z')
    expect(range.start.getTime()).toBeLessThan(now.getTime())
  })

  it('uses the previous local month west of UTC at month rollover', () => {
    const today = dateKeyInTimeZone(
      '2026-09-01T01:00:00Z',
      'America/Los_Angeles',
    )
    const range = getWorkspaceDateRange(
      {
        startDate: `${today.slice(0, 7)}-01`,
        endDate: today,
      },
      'America/Los_Angeles',
    )
    expect(range.start.toISOString()).toBe('2026-08-01T07:00:00.000Z')
    expect(range.endExclusive.toISOString()).toBe('2026-09-01T07:00:00.000Z')
  })
})
