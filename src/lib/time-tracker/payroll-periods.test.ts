import { describe, expect, it } from 'vitest'
import { buildPayrollPeriods } from './payroll-periods'

const MANILA = 'Asia/Manila'

describe('buildPayrollPeriods', () => {
  it('splits a single-cutoff month into 1–15 and 16–month-end', () => {
    const periods = buildPayrollPeriods([15], '2026-09', MANILA)

    expect(periods).toEqual([
      {
        label: 'Sep 1 – 15',
        startDate: '2026-09-01',
        endDate: '2026-09-15',
        closed: false,
      },
      {
        label: 'Sep 16 – 30',
        startDate: '2026-09-16',
        endDate: '2026-09-30',
        closed: false,
      },
    ])
  })

  it('splits a two-cutoff month into three periods ending at month-end', () => {
    const periods = buildPayrollPeriods([10, 20], '2026-09', MANILA)

    expect(periods.map((p) => p.label)).toEqual([
      'Sep 1 – 10',
      'Sep 11 – 20',
      'Sep 21 – 30',
    ])
  })

  it('marks periods before today as closed and keeps later ones open', () => {
    // 2026-09-18 12:00 Manila
    const now = new Date('2026-09-18T04:00:00Z')
    const periods = buildPayrollPeriods([10, 20], '2026-09', MANILA, now)

    expect(periods.map((p) => p.closed)).toEqual([true, false, false])
  })

  it('treats a period ending today as still open', () => {
    const now = new Date('2026-09-15T23:00:00Z') // Sep 16 in Manila
    const cutoffDayNow = new Date('2026-09-15T04:00:00Z') // Sep 15 in Manila
    const periods = buildPayrollPeriods([15], '2026-09', MANILA, cutoffDayNow)
    const nextDay = buildPayrollPeriods([15], '2026-09', MANILA, now)

    expect(periods[0].closed).toBe(false)
    expect(nextDay[0].closed).toBe(true)
  })

  it('compares "today" in the workspace timezone, not UTC', () => {
    // 2026-09-15 20:00 UTC: already Sep 16 in Manila, still Sep 15 in New York.
    const now = new Date('2026-09-15T20:00:00Z')

    const manila = buildPayrollPeriods([15], '2026-09', MANILA, now)
    const newYork = buildPayrollPeriods(
      [15],
      '2026-09',
      'America/New_York',
      now,
    )

    expect(manila[0].closed).toBe(true)
    expect(newYork[0].closed).toBe(false)
  })

  it('closes every period of a past month and opens every period of a future month', () => {
    const now = new Date('2026-09-18T04:00:00Z')

    const past = buildPayrollPeriods([10, 20], '2026-08', MANILA, now)
    const future = buildPayrollPeriods([10, 20], '2026-10', MANILA, now)

    expect(past.every((p) => p.closed)).toBe(true)
    expect(future.every((p) => p.closed)).toBe(false)
  })

  it('handles February month-ends in leap and non-leap years', () => {
    const leap = buildPayrollPeriods([15], '2024-02', MANILA)
    const common = buildPayrollPeriods([15], '2023-02', MANILA)

    expect(leap[1].endDate).toBe('2024-02-29')
    expect(leap[1].label).toBe('Feb 16 – 29')
    expect(common[1].endDate).toBe('2023-02-28')
  })

  it('normalizes unsorted and duplicate cutoff days', () => {
    const unsorted = buildPayrollPeriods([20, 10, 20], '2026-09', MANILA)
    const sorted = buildPayrollPeriods([10, 20], '2026-09', MANILA)

    expect(unsorted).toEqual(sorted)
  })

  it('falls back to a single full-month period when no cutoffs remain', () => {
    const periods = buildPayrollPeriods([], '2026-09', MANILA)

    expect(periods).toHaveLength(1)
    expect(periods[0].startDate).toBe('2026-09-01')
    expect(periods[0].endDate).toBe('2026-09-30')
  })

  it('rejects invalid month keys', () => {
    expect(() => buildPayrollPeriods([15], '2026-13', MANILA)).toThrow(
      /Invalid month key/,
    )
    expect(() => buildPayrollPeriods([15], 'september', MANILA)).toThrow(
      /Invalid month key/,
    )
  })
})
