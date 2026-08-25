import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { groupEntriesByDay, withActiveEntryDayGroup } from './entries-grouping'

function localDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function makeEntry(
  id: string,
  startedAt: string,
  endedAt: string | null,
  durationSeconds = endedAt ? 3600 : 0,
): TimeEntry {
  return {
    id,
    workspaceMemberId: 'member-1',
    description: 'Task',
    projectId: 'project-1',
    taskId: null,
    tagIds: [],
    billable: false,
    startedAt,
    endedAt,
    durationSeconds,
    notes: '',
    entrySource: 'TIMER',
  }
}

const stoppedAug20 = makeEntry(
  'entry-aug-20',
  '2026-08-20T12:00:00.000Z',
  '2026-08-20T13:00:00.000Z',
)
const stoppedAug24 = makeEntry(
  'entry-aug-24',
  '2026-08-24T12:00:00.000Z',
  '2026-08-24T13:00:00.000Z',
)
const runningAug24 = makeEntry(
  'entry-running',
  '2026-08-24T14:00:00.000Z',
  null,
)
const runningAug19 = makeEntry(
  'entry-running-old',
  '2026-08-19T12:00:00.000Z',
  null,
)

describe('withActiveEntryDayGroup', () => {
  it('returns groups unchanged without an active entry', () => {
    const groups = groupEntriesByDay([stoppedAug20])
    expect(withActiveEntryDayGroup(groups, null)).toBe(groups)
    expect(withActiveEntryDayGroup(groups, undefined)).toBe(groups)
  })

  it('returns groups unchanged when the active day already has a group', () => {
    const groups = groupEntriesByDay([stoppedAug24])
    expect(withActiveEntryDayGroup(groups, runningAug24)).toBe(groups)
  })

  it('creates a newest-first group for the active day when it has no entries', () => {
    const groups = groupEntriesByDay([stoppedAug20])
    const result = withActiveEntryDayGroup(groups, runningAug24)

    expect(result.map((group) => group.dateKey)).toEqual([
      localDateKey(runningAug24.startedAt),
      localDateKey(stoppedAug20.startedAt),
    ])
    expect(result[0].taskGroups).toEqual([])
    expect(result[0].completedSeconds).toBe(0)
    expect(result[0].runningEntry).toBe(runningAug24)
  })

  it('inserts an older active day in sorted order', () => {
    const groups = groupEntriesByDay([stoppedAug24, stoppedAug20])
    const result = withActiveEntryDayGroup(groups, runningAug19)

    expect(result.map((group) => group.dateKey)).toEqual([
      localDateKey(stoppedAug24.startedAt),
      localDateKey(stoppedAug20.startedAt),
      localDateKey(runningAug19.startedAt),
    ])
  })

  it('creates the only group when there are no other entries', () => {
    const result = withActiveEntryDayGroup([], runningAug24)

    expect(result).toHaveLength(1)
    expect(result[0].dateKey).toBe(localDateKey(runningAug24.startedAt))
    expect(result[0].runningEntry).toBe(runningAug24)
  })
})

describe('group timing review counts', () => {
  it('counts affected child entries once on the task group', () => {
    const entries = [
      makeEntry(
        'entry-zero',
        '2026-08-24T12:00:00.000Z',
        '2026-08-24T12:00:00.500Z',
        0,
      ),
      makeEntry(
        'entry-short',
        '2026-08-24T12:01:00.000Z',
        '2026-08-24T12:01:05.000Z',
        5,
      ),
      makeEntry(
        'entry-normal',
        '2026-08-24T12:02:00.000Z',
        '2026-08-24T12:03:00.000Z',
        60,
      ),
    ]

    expect(groupEntriesByDay(entries)[0].taskGroups[0].affectedCount).toBe(2)
  })
})
