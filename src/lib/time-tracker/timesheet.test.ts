import { describe, expect, it } from 'vitest'
import {
  aggregateTimesheetEntries,
  buildTimesheetDateKeys,
  currentWeekStart,
  formatTimesheetDuration,
  getLiveCellSeconds,
  normalizeWeekStart,
  requiresTimesheetSelection,
  resolveTimesheetScope,
} from './timesheet'
import { buildCsv } from './export-utils'

describe('timesheet dates', () => {
  it('normalizes any date to its Monday and builds a seven-day week', () => {
    expect(normalizeWeekStart('2026-08-30')).toBe('2026-08-24')
    expect(buildTimesheetDateKeys('2026-08-24')).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
    ])
    expect(
      currentWeekStart('Asia/Manila', new Date('2026-08-23T17:30:00.000Z')),
    ).toBe('2026-08-24')
  })
})

describe('timesheet permission scope', () => {
  it('allows owner filters while locking managers and employees to their scope', () => {
    expect(
      resolveTimesheetScope('OWNER', 'owner-1', null, 'department-requested'),
    ).toEqual({ kind: 'workspace', departmentId: 'department-requested' })
    expect(
      resolveTimesheetScope(
        'MANAGER',
        'manager-1',
        'department-own',
        'department-requested',
      ),
    ).toEqual({ kind: 'department', departmentId: 'department-own' })
    expect(
      resolveTimesheetScope(
        'EMPLOYEE',
        'employee-1',
        'department-own',
        'department-requested',
      ),
    ).toEqual({ kind: 'personal', memberId: 'employee-1' })
  })

  it('starts privileged users with a focused selection state', () => {
    expect(requiresTimesheetSelection('ADMIN', {})).toBe(true)
    expect(
      requiresTimesheetSelection('MANAGER', { memberId: 'member-1' }),
    ).toBe(false)
    expect(
      requiresTimesheetSelection('OWNER', { departmentId: 'department-1' }),
    ).toBe(false)
    expect(requiresTimesheetSelection('EMPLOYEE', {})).toBe(false)
  })
})

describe('timesheet aggregation', () => {
  it('uses workspace-local dates and aggregates completed and running entries', () => {
    const now = new Date('2026-08-24T03:00:00.000Z')
    const cells = aggregateTimesheetEntries(
      ['member-1', 'member-2'],
      buildTimesheetDateKeys('2026-08-24'),
      [
        {
          workspaceMemberId: 'member-1',
          startedAt: '2026-08-23T23:00:00.000Z',
          endedAt: '2026-08-24T00:00:00.000Z',
          durationSeconds: 3600,
        },
        {
          workspaceMemberId: 'member-1',
          startedAt: '2026-08-24T01:00:00.000Z',
          endedAt: null,
          durationSeconds: 0,
        },
      ],
      'Asia/Manila',
      now,
    )

    const monday = cells.get('member-1')?.[0]
    expect(monday).toMatchObject({
      entryCount: 2,
      completedSeconds: 3600,
      snapshotSeconds: 10800,
      status: 'RUNNING',
      timeOut: null,
    })
    expect(getLiveCellSeconds(monday!, now.getTime() + 1000)).toBe(10801)
    expect(cells.get('member-2')?.[0].status).toBe('NO_TIME')
  })

  it('formats payroll durations without rolling hours at 24', () => {
    expect(formatTimesheetDuration(30 * 3600 + 65)).toBe('30:01:05')
  })

  it('escapes spreadsheet formulas in payroll CSV values', () => {
    expect(buildCsv([['Member'], ['=HYPERLINK("bad")']])).toBe(
      'Member\r\n"\'=HYPERLINK(""bad"")"',
    )
  })
})
