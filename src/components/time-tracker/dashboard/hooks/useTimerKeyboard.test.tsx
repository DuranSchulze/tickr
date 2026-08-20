// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { useTimerKeyboard } from './useTimerKeyboard'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const activeEntry: TimeEntry = {
  id: 'entry-active',
  workspaceMemberId: 'member-1',
  description: 'Running task',
  projectId: 'project-1',
  taskId: null,
  tagIds: ['tag-1'],
  billable: false,
  startedAt: '2026-08-18T00:00:00.000Z',
  endedAt: null,
  durationSeconds: 0,
  notes: '',
  entrySource: 'TIMER',
}

function ShortcutProbe({
  entry,
  stopBlocked = false,
  startTimer,
  stopTimer,
  discardTimer,
}: {
  entry: TimeEntry | undefined
  stopBlocked?: boolean
  startTimer: () => void
  stopTimer: () => void
  discardTimer: () => void
}) {
  useTimerKeyboard({
    activeEntry: entry,
    stopBlocked,
    startTimer,
    stopTimer,
    discardTimer,
  })
  return null
}

function UnmountingEditor({
  stopTimer,
  discardTimer,
}: {
  stopTimer: () => void
  discardTimer: () => void
}) {
  const [editing, setEditing] = useState(true)
  useTimerKeyboard({
    activeEntry,
    stopBlocked: false,
    startTimer: vi.fn(),
    stopTimer,
    discardTimer,
  })

  return editing ? (
    <input
      aria-label="Duration"
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault()
          setEditing(false)
        }
      }}
    />
  ) : null
}

describe('useTimerKeyboard', () => {
  const startTimer = vi.fn()
  const stopTimer = vi.fn()
  const discardTimer = vi.fn()
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    startTimer.mockReset()
    stopTimer.mockReset()
    discardTimer.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('does not stop or discard when an editor handles and unmounts on the key event', () => {
    act(() => {
      root.render(
        <UnmountingEditor
          key="enter"
          stopTimer={stopTimer}
          discardTimer={discardTimer}
        />,
      )
    })

    const enterInput = container.querySelector('input')
    expect(enterInput).not.toBeNull()
    act(() => {
      enterInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    })
    expect(stopTimer).not.toHaveBeenCalled()

    act(() => {
      root.render(
        <UnmountingEditor
          key="escape"
          stopTimer={stopTimer}
          discardTimer={discardTimer}
        />,
      )
    })
    const escapeInput = container.querySelector('input')
    expect(escapeInput).not.toBeNull()
    act(() => {
      escapeInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    })
    expect(discardTimer).not.toHaveBeenCalled()
  })

  it('ignores Enter from interactive controls', () => {
    act(() => {
      root.render(
        <>
          <ShortcutProbe
            entry={activeEntry}
            startTimer={startTimer}
            stopTimer={stopTimer}
            discardTimer={discardTimer}
          />
          <button type="button">Edit duration</button>
          <select aria-label="Project">
            <option>Project</option>
          </select>
          <a href="#entry">Entry link</a>
        </>,
      )
    })

    for (const element of container.querySelectorAll('button, select, a')) {
      act(() => {
        element.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        )
      })
    }

    expect(stopTimer).not.toHaveBeenCalled()
  })

  it('keeps page-level timer shortcuts working', () => {
    act(() => {
      root.render(
        <ShortcutProbe
          entry={activeEntry}
          startTimer={startTimer}
          stopTimer={stopTimer}
          discardTimer={discardTimer}
        />,
      )
    })

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    })

    expect(stopTimer).toHaveBeenCalledTimes(1)
    expect(discardTimer).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(
        <ShortcutProbe
          entry={undefined}
          startTimer={startTimer}
          stopTimer={stopTimer}
          discardTimer={discardTimer}
        />,
      )
    })
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    })

    expect(startTimer).toHaveBeenCalledTimes(1)
  })
})
