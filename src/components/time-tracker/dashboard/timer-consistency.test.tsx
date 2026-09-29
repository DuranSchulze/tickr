// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { getFormatter, getLiveTickMs } from '#/lib/time-tracker/time-format'
import { DashboardHeader } from './DashboardHeader'
import { LiveGroupTotal } from './DayGroupEntries'
import { RunningTimer } from './RunningTimer'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const start = new Date(2026, 8, 29, 10).getTime()
const entry: TimeEntry = {
  id: 'running',
  workspaceMemberId: 'member',
  description: 'Task',
  projectId: '',
  taskId: null,
  tagIds: [],
  billable: false,
  startedAt: new Date(start).toISOString(),
  endedAt: null,
  durationSeconds: 0,
  notes: '',
  entrySource: 'TIMER',
}
const completed = [0, 1, 2].map((index) => ({
  ...entry,
  id: `completed-${index}`,
  startedAt: new Date(start - 60_000 - index * 2000).toISOString(),
  endedAt: new Date(start - 58_100 - index * 2000).toISOString(),
  durationSeconds: 1,
}))

describe('dashboard timer consistency', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(start + 10_100)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it.each(['clock', 'precise'] as const)(
    'shares one clock and recorded totals in %s format',
    (format) => {
      const formatTime = Object.assign(
        (seconds: number) => getFormatter(format)(seconds),
        {
          liveTickMs: getLiveTickMs(format),
        },
      )
      const render = (showTotals: boolean, running = entry) =>
        act(() =>
          root.render(
            <>
              <div data-testid="running">
                <RunningTimer entry={running} formatTime={formatTime} />
              </div>
              {showTotals && (
                <>
                  <div data-testid="group">
                    <LiveGroupTotal
                      completedSeconds={3}
                      runningEntry={running}
                      formatTime={formatTime}
                    />
                  </div>
                  <div data-testid="header">
                    <DashboardHeader
                      workspaceName="Workspace"
                      userName="User"
                      userRoleName="Member"
                      entries={[...completed, running]}
                      formatTime={formatTime}
                    />
                  </div>
                </>
              )}
            </>,
          ),
        )
      const expectTotals = (elapsed: number) => {
        expect(
          container.querySelector('[data-testid="running"]')?.textContent,
        ).toBe(formatTime(elapsed))
        expect(
          container.querySelector('[data-testid="group"]')?.textContent,
        ).toBe(formatTime(elapsed + 3))
        expect(
          container.querySelector('[data-testid="header"] p:last-child')
            ?.textContent,
        ).toBe(formatTime(elapsed + 3))
      }
      render(false)
      act(() => vi.advanceTimersByTime(850))
      render(true)
      expectTotals(10.95)
      expect(vi.getTimerCount()).toBe(1)
      act(() => vi.advanceTimersByTime(2000))
      expectTotals(format === 'clock' ? 12.1 : 12.95)
      // A sleeping/background tab catches up from timestamps, not tick counts.
      vi.setSystemTime(start + 80_750)
      act(() => window.dispatchEvent(new Event('focus')))
      expectTotals(80.75)
      render(true, {
        ...entry,
        endedAt: new Date(start + 80_750).toISOString(),
        durationSeconds: 80,
      })
      expectTotals(80)
      act(() => root.render(null))
      expect(vi.getTimerCount()).toBe(0)
    },
  )
})
