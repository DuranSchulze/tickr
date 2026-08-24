// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TimesheetPayload } from '#/lib/server/tracker/timesheet.server'
import { TimesheetGrid } from './TimesheetScreen'

const runningStart = '2026-08-24T01:00:00.000Z'
const payload: TimesheetPayload = {
  weekStart: '2026-08-24',
  weekEnd: '2026-08-30',
  timezone: 'Asia/Manila',
  permissionLevel: 'ADMIN',
  snapshotAt: '2026-08-24T02:00:00.000Z',
  dates: [
    { date: '2026-08-24', shortLabel: 'Aug 24', dayLabel: 'Mon' },
    { date: '2026-08-25', shortLabel: 'Aug 25', dayLabel: 'Tue' },
    { date: '2026-08-26', shortLabel: 'Aug 26', dayLabel: 'Wed' },
    { date: '2026-08-27', shortLabel: 'Aug 27', dayLabel: 'Thu' },
    { date: '2026-08-28', shortLabel: 'Aug 28', dayLabel: 'Fri' },
    { date: '2026-08-29', shortLabel: 'Aug 29', dayLabel: 'Sat' },
    { date: '2026-08-30', shortLabel: 'Aug 30', dayLabel: 'Sun' },
  ],
  departments: [],
  memberOptions: [],
  selectionRequired: false,
  members: [
    {
      id: 'member-1',
      name: 'Alex Santos',
      email: 'alex@example.com',
      image: null,
      departmentId: 'department-1',
      departmentName: 'Operations',
      departmentColor: '#2563eb',
      status: 'ACTIVE',
      weeklySeconds: 3600,
      days: [
        {
          date: '2026-08-24',
          timeIn: runningStart,
          timeOut: null,
          completedSeconds: 0,
          snapshotSeconds: 3600,
          entryCount: 1,
          runningStartedAts: [runningStart],
          status: 'RUNNING',
        },
        ...Array.from({ length: 6 }, (_, index) => ({
          date: `2026-08-${String(25 + index).padStart(2, '0')}`,
          timeIn: null,
          timeOut: null,
          completedSeconds: 0,
          snapshotSeconds: 0,
          entryCount: 0,
          runningStartedAts: [],
          status: 'NO_TIME' as const,
        })),
      ],
    },
  ],
  dailyTotals: [3600, 0, 0, 0, 0, 0, 0],
  weeklyTotalSeconds: 3600,
  totalCount: 1,
  page: 1,
  pageSize: 25,
  totalPages: 1,
}

describe('TimesheetGrid', () => {
  it('renders the full week, sticky identity rails, empty days, and running state', () => {
    render(
      <TimesheetGrid
        data={payload}
        nowMs={new Date(payload.snapshotAt).getTime()}
        dailyTotals={payload.dailyTotals}
      />,
    )

    const grid = screen.getByRole('region', { name: 'Weekly DTR grid' })
    expect(within(grid).getByText('Alex Santos')).toBeTruthy()
    const runningBadge = within(grid).getByText('In progress')
    expect(runningBadge.className).toContain('whitespace-nowrap')
    expect(runningBadge.closest('div')?.className).toContain('flex-wrap')
    expect(within(grid).getAllByText('1:00:00').length).toBeGreaterThan(0)
    expect(within(grid).getAllByRole('columnheader')).toHaveLength(9)
    expect(grid.className).toContain('overflow-x-auto')
    expect(within(grid).getByText('Sun')).toBeTruthy()
  })
})
