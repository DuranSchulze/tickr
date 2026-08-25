// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { EntryCard } from './EntryCard'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock('./ConfirmDialog', () => ({ ConfirmDialog: () => null }))

const baseEntry: TimeEntry = {
  id: 'entry-1',
  workspaceMemberId: 'member-1',
  description: 'Affected task',
  projectId: 'project-1',
  taskId: null,
  tagIds: [],
  billable: false,
  startedAt: '2026-08-25T09:00:00.000Z',
  endedAt: '2026-08-25T09:00:00.500Z',
  durationSeconds: 0,
  notes: '',
  entrySource: 'TIMER',
}

describe('EntryCard timing recovery', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const onStartEdit = vi.fn()

  beforeEach(() => {
    onStartEdit.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function render(entry: TimeEntry) {
    act(() => {
      root.render(
        <EntryCard
          entry={entry}
          projects={[]}
          tags={[]}
          currency="USD"
          rateLookup={() => 0}
          pending={false}
          formatTime={(seconds) => String(seconds)}
          onStartEdit={onStartEdit}
          onResume={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
        />,
      )
    })
  }

  it('shows direct repair controls for zero-duration entries', () => {
    render(baseEntry)

    expect(container.textContent).toContain('Needs repair')
    const editButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Edit time',
    )
    expect(editButton).toBeDefined()
    act(() => editButton?.click())
    expect(onStartEdit).toHaveBeenCalledWith(baseEntry)
  })

  it('uses a softer warning for valid entries up to ten seconds', () => {
    render({
      ...baseEntry,
      endedAt: '2026-08-25T09:00:05.000Z',
      durationSeconds: 5,
    })

    expect(container.textContent).toContain('Very short — review')
  })
})
