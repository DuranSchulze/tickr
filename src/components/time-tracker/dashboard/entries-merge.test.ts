import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { mergeEntriesPage } from './entries-merge'

function makeEntry(id: string, description = 'Task'): TimeEntry {
  return {
    id,
    workspaceMemberId: 'member-1',
    description,
    projectId: 'project-1',
    taskId: null,
    tagIds: [],
    billable: false,
    startedAt: '2026-08-20T12:00:00.000Z',
    endedAt: '2026-08-20T13:00:00.000Z',
    durationSeconds: 3600,
    notes: '',
    entrySource: 'TIMER',
  }
}

describe('mergeEntriesPage', () => {
  it('keeps every page the user already loaded', () => {
    const loaded = [makeEntry('a'), makeEntry('b'), makeEntry('c')]

    const merged = mergeEntriesPage(loaded, [makeEntry('a')])

    expect(merged.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
  })

  it('updates a loaded row with the fresh copy and keeps the rest', () => {
    const loaded = [makeEntry('a'), makeEntry('b')]

    const merged = mergeEntriesPage(loaded, [makeEntry('a', 'Renamed')])

    expect(merged).toHaveLength(2)
    expect(merged.find((entry) => entry.id === 'a')?.description).toBe(
      'Renamed',
    )
    expect(merged.find((entry) => entry.id === 'b')).toBe(loaded[1])
  })

  it('adds rows created since the list was loaded', () => {
    const loaded = [makeEntry('a'), makeEntry('b')]

    const merged = mergeEntriesPage(loaded, [makeEntry('new'), makeEntry('a')])

    expect(merged.map((entry) => entry.id)).toEqual(['a', 'b', 'new'])
  })

  it('seeds the list from page one when nothing was loaded yet', () => {
    const page = [makeEntry('a'), makeEntry('b')]

    expect(mergeEntriesPage([], page)).toBe(page)
  })
})
