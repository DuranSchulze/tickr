import { describe, expect, it } from 'vitest'
import {
  getAnalyticsOverviewDateKeys,
  getAnalyticsOverviewWindows,
} from '../tracker/analytics-overview.utils'

describe('analytics overview windows', () => {
  it('builds today, yesterday, and same-weekday comparison windows', () => {
    const windows = getAnalyticsOverviewWindows('2026-06-22')

    expect(windows[0]).toMatchObject({
      id: 'today',
      currentStart: '2026-06-22',
      currentEnd: '2026-06-22',
      previousStart: '2026-06-21',
      previousEnd: '2026-06-21',
    })
    expect(windows[1]).toMatchObject({
      id: 'week',
      currentStart: '2026-06-22',
      currentEnd: '2026-06-22',
      previousStart: '2026-06-15',
      previousEnd: '2026-06-15',
    })
  })

  it('uses comparable month-to-date and year-to-date windows', () => {
    const windows = getAnalyticsOverviewWindows('2026-06-22')

    expect(windows[2]).toMatchObject({
      id: 'month',
      currentStart: '2026-06-01',
      currentEnd: '2026-06-22',
      previousStart: '2026-05-01',
      previousEnd: '2026-05-22',
    })
    expect(windows[3]).toMatchObject({
      id: 'year',
      currentStart: '2026-01-01',
      currentEnd: '2026-06-22',
      previousStart: '2025-01-01',
      previousEnd: '2025-06-22',
    })
  })

  it('caps previous month comparison to the last valid previous-month day', () => {
    const windows = getAnalyticsOverviewWindows('2026-03-31')

    expect(windows[2]).toMatchObject({
      currentStart: '2026-03-01',
      currentEnd: '2026-03-31',
      previousStart: '2026-02-01',
      previousEnd: '2026-02-28',
    })
  })

  it('includes trend and comparison keys without duplicates', () => {
    const keys = getAnalyticsOverviewDateKeys('2026-06-22')

    expect(keys[0]).toBe('2025-01-01')
    expect(keys).toContain('2026-06-22')
    expect(new Set(keys).size).toBe(keys.length)
  })
})
