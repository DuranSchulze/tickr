// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { AllEntriesSection } from './AllEntriesSection'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock('./DayGroupEntries', () => ({
  DayGroupsList: ({
    groups,
    activeEntry,
  }: {
    groups: Array<{
      dateKey: string
      taskGroups: Array<{ entries: TimeEntry[] }>
    }>
    activeEntry?: TimeEntry
  }) => (
      <div data-testid="day-groups">
        {activeEntry && (
          <div data-testid="pinned-entry">
            Running now — {activeEntry.description}
          </div>
        )}
        {groups.map((group) => (
          <div key={group.dateKey} data-testid="day-group">
            {group.dateKey}
          </div>
        ))}
        {groups.flatMap((group) =>
        group.taskGroups.flatMap((taskGroup) =>
          taskGroup.entries.map((entry) => (
            <div
              key={`${group.dateKey}-${entry.id}`}
              data-testid="grouped-entry"
            >
              {entry.description}
            </div>
          )),
        ),
      )}
    </div>
  ),
}))

vi.mock('./EntriesDateRangeFilter', () => ({
  EntriesDateRangeFilter: () => null,
}))

vi.mock('./EntriesFilters', () => ({
  EntriesFilters: () => null,
}))

const activeEntry: TimeEntry = {
  id: 'entry-active',
  workspaceMemberId: 'member-1',
  description: 'Running task',
  projectId: 'project-1',
  taskId: null,
  tagIds: [],
  billable: false,
  startedAt: '2026-08-18T00:00:00.000Z',
  endedAt: null,
  durationSeconds: 0,
  notes: '',
  entrySource: 'TIMER',
}

const completedEntry: TimeEntry = {
  ...activeEntry,
  id: 'entry-completed',
  description: 'Completed task',
  startedAt: '2026-08-17T00:00:00.000Z',
  endedAt: '2026-08-17T01:00:00.000Z',
  durationSeconds: 3600,
}

const noop = () => undefined

function localDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const baseProps = {
  hasMore: false,
  loadingMore: false,
  onLoadMore: noop,
  dateRange: null,
  onDateRangeChange: noop,
  activeFilterCount: 0,
  clearFilters: noop,
  filterControls: {
    filterProject: '',
    setFilterProject: noop,
    filterTag: '',
    setFilterTag: noop,
    filterBillable: 'all' as const,
    setFilterBillable: noop,
    sortKey: 'newest' as const,
    setSortKey: noop,
  },
  clients: [],
  projects: [],
  projectTasks: [],
  tags: [],
  currency: 'USD',
  rateLookup: () => 0,
  pending: false,
  pendingEntryIds: new Set<string>(),
  deletingEntryId: null,
  formatTime: (seconds: number) => String(seconds),
  onStartEdit: noop,
  onUpdate: noop,
  onResume: noop,
  onDuplicate: noop,
  onDelete: noop,
}

describe('AllEntriesSection', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderSection(
    entries: TimeEntry[],
    currentActiveEntry: TimeEntry | undefined,
  ) {
    act(() => {
      root.render(
        <AllEntriesSection
          {...baseProps}
          entries={entries}
          activeEntry={currentActiveEntry}
        />,
      )
    })
  }

  it('shows a lone active entry without the historical empty state', () => {
    renderSection([], activeEntry)

    expect(container.textContent).toContain('Running now')
    expect(container.textContent).toContain('Running task')
    expect(container.textContent).not.toContain('No entries found')
  })

  it('pins the active entry once and keeps historical entries grouped below it', () => {
    renderSection([activeEntry, completedEntry], activeEntry)

    expect(
      container.querySelectorAll('[data-testid="pinned-entry"]'),
    ).toHaveLength(1)
    expect(
      container.querySelectorAll('[data-testid="grouped-entry"]'),
    ).toHaveLength(1)
    expect(
      container.querySelector('[data-testid="grouped-entry"]')?.textContent,
    ).toBe('Completed task')
  })

  it('creates a day group for the active entry when it is the first of its day', () => {
    renderSection([activeEntry, completedEntry], activeEntry)

    // Regression: the running entry is excluded from grouping, so without
    // synthesizing a group its row used to be pinned under the newest
    // historical day instead of getting its own day header.
    const dayGroupKeys = Array.from(
      container.querySelectorAll('[data-testid="day-group"]'),
    ).map((element) => element.textContent)
    expect(dayGroupKeys).toEqual([
      localDateKey(activeEntry.startedAt),
      localDateKey(completedEntry.startedAt),
    ])
  })

  it('returns the entry to normal grouping when it is no longer active', () => {
    renderSection([activeEntry, completedEntry], activeEntry)
    renderSection([activeEntry, completedEntry], undefined)

    expect(container.textContent).not.toContain('Running now')
    expect(container.querySelector('[data-testid="pinned-entry"]')).toBeNull()
    expect(
      container.querySelectorAll('[data-testid="grouped-entry"]'),
    ).toHaveLength(2)
  })
})
