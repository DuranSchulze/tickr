// @vitest-environment jsdom
import { screen, within } from '@testing-library/dom'
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { PerformanceActivityTable } from './PerformanceActivityTable'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
function render(element: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(element))
}
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

describe('PerformanceActivityTable', () => {
  it('shows local clock times, separate span and tracked time, and task evidence', () => {
    render(
      <PerformanceActivityTable
        timezone="Asia/Manila"
        dailyTotals={[
          {
            date: '2026-09-08',
            seconds: 21600,
            spanSeconds: 36000,
            entryCount: 1,
            firstStartedAt: '2026-09-08T00:00:00Z',
            lastEndedAt: '2026-09-08T10:00:00Z',
          },
        ]}
        entries={[
          {
            id: 'entry-1',
            entrySource: 'MANUAL',
            date: '2026-09-08',
            description: 'Review payroll report',
            projectName: 'Operations',
            startedAt: '2026-09-08T00:00:00Z',
            endedAt: '2026-09-08T10:00:00Z',
            seconds: 21600,
          },
        ]}
      />,
    )
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getByText('Sep 8, 8:00 AM')).toBeTruthy()
    expect(within(row).getByText('Sep 8, 6:00 PM')).toBeTruthy()
    expect(within(row).getByText('10h')).toBeTruthy()
    expect(within(row).getByText('6h')).toBeTruthy()
    expect(screen.getByText('Review payroll report')).toBeTruthy()
    expect(screen.getByText('Manual · Operations · 6h')).toBeTruthy()
    expect(screen.getByText('1 completed entry')).toBeTruthy()
    expect(screen.getByText('1 completed entry').closest('details')?.open).toBe(
      false,
    )
  })

  it('labels weekends and missing entries without calling them absences', () => {
    render(
      <PerformanceActivityTable
        timezone="Asia/Manila"
        entries={[]}
        dailyTotals={[
          {
            date: '2026-09-06',
            seconds: 0,
            spanSeconds: 0,
            entryCount: 0,
            firstStartedAt: null,
            lastEndedAt: null,
          },
        ]}
      />,
    )
    expect(screen.getByText('Weekend')).toBeTruthy()
    expect(screen.getByText('No completed entries')).toBeTruthy()
  })
})
