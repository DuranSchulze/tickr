import { describe, expect, it } from 'vitest'
import {
  classifyEntryTimingIssue,
  isTimeInputMinutes,
  patchDateAndTimeWithMinutes,
  patchDateAndTimeWithSeconds,
  secondsToTimeInputMinutes,
  secondsToTimeInput,
  stopEntryAt,
  timeInputMinutesToSeconds,
  toTimeInputMinutes,
  toTimeInputWithSeconds,
} from './entry-timing'

function entry(
  startedAt: string,
  endedAt: string | null,
  durationSeconds: number,
) {
  return { startedAt, endedAt, durationSeconds }
}

describe('classifyEntryTimingIssue', () => {
  it('marks invalid and zero-duration completed entries for repair', () => {
    expect(
      classifyEntryTimingIssue(
        entry('2026-08-25T09:00:00.000Z', '2026-08-25T09:00:00.500Z', 0),
      ),
    ).toBe('needs-repair')
    expect(
      classifyEntryTimingIssue(
        entry('2026-08-25T09:00:01.000Z', '2026-08-25T09:00:00.000Z', 1),
      ),
    ).toBe('needs-repair')
  })

  it('marks one through ten seconds for review only', () => {
    expect(
      classifyEntryTimingIssue(
        entry('2026-08-25T09:00:00.000Z', '2026-08-25T09:00:10.000Z', 10),
      ),
    ).toBe('review-short')
    expect(
      classifyEntryTimingIssue(
        entry('2026-08-25T09:00:00.000Z', '2026-08-25T09:00:11.000Z', 11),
      ),
    ).toBeNull()
  })

  it('does not warn for a running entry', () => {
    expect(
      classifyEntryTimingIssue(entry('2026-08-25T09:00:00.000Z', null, 0)),
    ).toBeNull()
  })
})

describe('seconds-aware time input helpers', () => {
  it('round-trips seconds and preserves milliseconds while editing', () => {
    const base = '2026-08-25T09:00:03.456Z'
    const input = toTimeInputWithSeconds(base)
    expect(input.split(':')).toHaveLength(3)
    const patched = patchDateAndTimeWithSeconds(base, new Date(base), input)
    expect(new Date(patched).getMilliseconds()).toBe(456)
  })

  it('formats shifted times with seconds', () => {
    expect(secondsToTimeInput(5 * 3600 + 2 * 60 + 9)).toBe('05:02:09')
  })
})

describe('minute-only time input helpers', () => {
  it('formats valid time input values without seconds', () => {
    const value = toTimeInputMinutes('2026-08-25T09:02:09.000Z')

    expect(value).toHaveLength(5)
    expect(isTimeInputMinutes(value)).toBe(true)
    expect(timeInputMinutesToSeconds('05:02')).toBe(18_120)
    expect(secondsToTimeInputMinutes(5 * 3600 + 2 * 60 + 9)).toBe('05:02')
  })

  it('preserves stored seconds and milliseconds when minutes are edited', () => {
    const base = '2026-08-25T09:00:03.456Z'
    const patched = new Date(
      patchDateAndTimeWithMinutes(base, new Date(base), '07:45'),
    )

    expect(patched.getHours()).toBe(7)
    expect(patched.getMinutes()).toBe(45)
    expect(patched.getSeconds()).toBe(3)
    expect(patched.getMilliseconds()).toBe(456)
  })
})

describe('stopEntryAt', () => {
  it('uses the stop-click timestamp instead of a later response time', () => {
    const stopped = stopEntryAt(
      {
        id: 'entry-1',
        workspaceMemberId: 'member-1',
        description: 'Task',
        projectId: 'project-1',
        taskId: null,
        tagIds: ['tag-1'],
        billable: false,
        startedAt: '2026-08-25T09:00:00.000Z',
        endedAt: null,
        durationSeconds: 0,
        notes: '',
        entrySource: 'TIMER',
      },
      '2026-08-25T09:00:03.250Z',
    )

    expect(stopped.endedAt).toBe('2026-08-25T09:00:03.250Z')
    expect(stopped.durationSeconds).toBe(3)
  })
})
