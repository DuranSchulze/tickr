// @vitest-environment jsdom

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { EntryRow } from './EntryRow'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock('../pickers/ClientProjectPicker', () => ({
  ClientProjectPicker: () => null,
}))
vi.mock('../pickers/TagPicker', () => ({ TagPicker: () => null }))
vi.mock('./BillableToggleButton', () => ({
  BillableToggleButton: () => null,
}))
vi.mock('./ConfirmDialog', () => ({ ConfirmDialog: () => null }))
vi.mock('#/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: () => null,
  PopoverTrigger: () => null,
}))
vi.mock('#/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: () => null,
  DropdownMenuItem: () => null,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: () => null,
}))

function createEntry(): TimeEntry {
  return {
    id: 'entry-1',
    workspaceMemberId: 'member-1',
    description: 'Minute editing',
    projectId: 'project-1',
    taskId: null,
    tagIds: [],
    billable: false,
    startedAt: new Date(2026, 7, 25, 16, 50, 37, 123).toISOString(),
    endedAt: new Date(2026, 7, 25, 18, 0, 41, 456).toISOString(),
    durationSeconds: 4_164,
    notes: '',
    entrySource: 'MANUAL',
  }
}

describe('EntryRow inline time editing', () => {
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

  it('shows and edits start and end times at minute precision only', () => {
    const onUpdate = vi.fn()
    const entry = createEntry()

    act(() => {
      root.render(
        <table>
          <tbody>
            <EntryRow
              entry={entry}
              clients={[]}
              projects={[]}
              projectTasks={[]}
              tags={[]}
              pending={false}
              formatTime={(seconds) => String(seconds)}
              onStartEdit={vi.fn()}
              onUpdate={onUpdate}
              onResume={vi.fn()}
              onDuplicate={vi.fn()}
              onDelete={vi.fn()}
            />
          </tbody>
        </table>,
      )
    })

    const startInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Start time"]',
    )
    const endInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="End time"]',
    )

    expect(startInput?.value).toBe('16:50')
    expect(endInput?.value).toBe('18:00')
    expect(startInput?.step).toBe('60')
    expect(endInput?.step).toBe('60')

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      valueSetter?.call(startInput, '16:51')
      startInput?.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(endInput?.value).toBe('18:01')

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      valueSetter?.call(endInput, '18:02')
      endInput?.dispatchEvent(new Event('input', { bubbles: true }))
      endInput?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    const patch = onUpdate.mock.calls.at(-1)?.[1]
    const patchedEnd = new Date(patch.endedAt)
    expect(patchedEnd.getHours()).toBe(18)
    expect(patchedEnd.getMinutes()).toBe(2)
    expect(patchedEnd.getSeconds()).toBe(41)
    expect(patchedEnd.getMilliseconds()).toBe(456)
  })
})
