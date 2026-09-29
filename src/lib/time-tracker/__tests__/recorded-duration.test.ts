import { describe, expect, it } from 'vitest'
import { getRecordedEntrySecondsInRange, getViewRange } from '../store'
import type { TimeEntry } from '../types'

const now = new Date(2026, 8, 29, 12)
const range = getViewRange('day', now)
function entry(
  startedAt: Date,
  endedAt: Date | null,
  durationSeconds = 0,
): TimeEntry {
  return {
    id: 'entry',
    workspaceMemberId: 'member',
    description: '',
    projectId: '',
    taskId: null,
    tagIds: [],
    billable: false,
    notes: '',
    entrySource: 'TIMER',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt?.toISOString() ?? null,
    durationSeconds,
  }
}
const seconds = (value: TimeEntry) =>
  getRecordedEntrySecondsInRange(value, range.start, range.end, now)

describe('recorded duration in a date range', () => {
  it('uses saved seconds instead of adding discarded milliseconds back', () => {
    expect(
      seconds(
        entry(
          new Date(2026, 8, 29, 10),
          new Date(2026, 8, 29, 10, 0, 1, 900),
          1,
        ),
      ),
    ).toBe(1)
  })
  it('uses the live timestamp and clips running time at midnight', () => {
    expect(seconds(entry(new Date(2026, 8, 28, 23), null))).toBe(12 * 3600)
  })
  it('prorates recorded time for entries crossing midnight', () => {
    expect(
      seconds(entry(new Date(2026, 8, 28, 23), new Date(2026, 8, 29, 1), 7199)),
    ).toBe(7199 / 2)
  })
  it('returns zero outside the range and for zero-length entries', () => {
    expect(
      seconds(
        entry(new Date(2026, 8, 28, 10), new Date(2026, 8, 28, 11), 3600),
      ),
    ).toBe(0)
    expect(seconds(entry(now, now, 0))).toBe(0)
  })
})
