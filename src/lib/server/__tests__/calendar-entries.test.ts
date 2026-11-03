import { describe, expect, it } from 'vitest'
import { splitEntryByDay } from '../tracker/shared/calendar-entries'
import type { RawEntry } from '../tracker/shared/calendar-entries'
import {
  formatDateInTimeZone,
  zonedDateTimeToUtc,
} from '../tracker/shared/dates'

function entry(start: string, end: string | null): RawEntry {
  return {
    id: 'task',
    description: 'Running task',
    startedAt: new Date(start),
    endedAt: end ? new Date(end) : null,
    durationSeconds: end ? (Date.parse(end) - Date.parse(start)) / 1000 : 0,
    taskName: null,
    billable: false,
    project: null,
  }
}
function split(
  start: string,
  end: string | null,
  now: string,
  timezone = 'Asia/Manila',
) {
  return splitEntryByDay(
    entry(start, end),
    new Date('2026-01-01Z'),
    new Date('2027-01-01Z'),
    new Date(now),
    timezone,
  )
}

describe('workspace calendar day grouping', () => {
  it('places a running Tuesday morning task on November 3 in Manila, not UTC Monday', () => {
    const slices = split('2026-11-02T23:46:00Z', null, '2026-11-03T00:10:00Z')
    expect(slices).toHaveLength(1)
    expect(formatDateInTimeZone(slices[0].startedAt, 'Asia/Manila')).toBe(
      '2026-11-03',
    )
    expect(slices[0].endedAt).toBeNull()
    expect(slices[0].durationSeconds).toBe(24 * 60)
  })
  it('does not split at UTC midnight when both instants fall on the same workspace day', () => {
    expect(
      split(
        '2026-11-02T23:00:00Z',
        '2026-11-03T01:00:00Z',
        '2026-11-03T02:00:00Z',
      ),
    ).toHaveLength(1)
  })
  it('splits at Manila midnight and marks only the latest slice as running', () => {
    const slices = split('2026-11-02T15:30:00Z', null, '2026-11-02T16:30:00Z')
    expect(
      slices.map((s) => formatDateInTimeZone(s.startedAt, 'Asia/Manila')),
    ).toEqual(['2026-11-02', '2026-11-03'])
    expect(slices.map((s) => s.durationSeconds)).toEqual([1800, 1800])
    expect(slices[0].endedAt).toBe('2026-11-02T16:00:00.000Z')
    expect(slices[1].endedAt).toBeNull()
    expect(slices[1].sourceStartedAt).toBe('2026-11-02T15:30:00.000Z')
  })
  it.each([
    ['2026-03-08', '2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z', 23],
    ['2026-11-01', '2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z', 25],
  ])(
    'uses actual local midnight on the %s daylight-saving transition',
    (day, start, end, hours) => {
      expect(zonedDateTimeToUtc(day, 'America/New_York').toISOString()).toBe(
        new Date(start).toISOString(),
      )
      const slices = split(start, end, end, 'America/New_York')
      expect(slices).toHaveLength(1)
      expect(slices[0].durationSeconds).toBe(Number(hours) * 3600)
    },
  )
  it('includes early local morning at the beginning of the requested month', () => {
    const slices = splitEntryByDay(
      entry('2026-10-31T23:00:00Z', null),
      zonedDateTimeToUtc('2026-11-01', 'Asia/Manila'),
      zonedDateTimeToUtc('2026-12-01', 'Asia/Manila'),
      new Date('2026-11-01T00:00:00Z'),
      'Asia/Manila',
    )
    expect(slices).toHaveLength(1)
    expect(formatDateInTimeZone(slices[0].startedAt, 'Asia/Manila')).toBe(
      '2026-11-01',
    )
  })
})
