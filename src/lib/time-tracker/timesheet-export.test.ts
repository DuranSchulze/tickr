import { describe, expect, it } from 'vitest'
import type { TimesheetExportPayload } from '#/lib/server/tracker/timesheet.server'
import {
  buildTimesheetExcelWorkbook,
  buildTimesheetExportRows,
  safeSpreadsheetText,
} from './timesheet-export'

function makePayload(): TimesheetExportPayload {
  const dates = Array.from({ length: 7 }, (_, index) => ({
    date: `2026-08-${String(24 + index).padStart(2, '0')}`,
    shortLabel: `D${index + 1}`,
    dayLabel: [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ][index],
  }))

  return {
    weekStart: '2026-08-24',
    weekEnd: '2026-08-30',
    timezone: 'Asia/Manila',
    permissionLevel: 'ADMIN',
    snapshotAt: '2026-08-24T03:00:00.000Z',
    dates,
    departments: [],
    totalCount: 1,
    members: [
      {
        id: 'member-1',
        name: '=Payroll Formula',
        email: 'member@example.com',
        image: null,
        departmentId: 'department-1',
        departmentName: '+Finance',
        departmentColor: null,
        status: 'ACTIVE',
        weeklySeconds: 3661,
        days: dates.map(({ date }, index) => ({
          date,
          timeIn: index === 0 ? '2026-08-23T23:00:00.000Z' : null,
          timeOut: index === 0 ? '2026-08-24T00:01:01.000Z' : null,
          completedSeconds: index === 0 ? 3661 : 0,
          snapshotSeconds: index === 0 ? 3661 : 0,
          entryCount: index === 0 ? 1 : 0,
          runningStartedAts: [],
          status: index === 0 ? 'WORK' : 'NO_TIME',
        })),
      },
    ],
  }
}

describe('timesheet spreadsheet export', () => {
  it('builds all seven payroll rows and protects spreadsheet text', () => {
    const rows = buildTimesheetExportRows(makePayload())

    expect(rows).toHaveLength(7)
    expect(rows[0]).toMatchObject({
      member: "'=Payroll Formula",
      department: "'+Finance",
      date: '2026-08-24',
      totalHours: '1:01:01',
      totalSeconds: 3661,
      status: 'WORK',
    })
    expect(safeSpreadsheetText(' ordinary')).toBe(' ordinary')
    expect(safeSpreadsheetText(' @formula')).toBe("' @formula")
  })

  it('creates a valid, filterable workbook with numeric duration cells', async () => {
    const workbook = await buildTimesheetExcelWorkbook(makePayload())
    expect(
      workbook.getWorksheet('Payroll DTR')?.getCell('H2').value,
    ).toBeCloseTo(3661 / 86_400)
    const buffer = await workbook.xlsx.writeBuffer()
    const { default: ExcelJS } = await import('exceljs')
    const reloaded = new ExcelJS.Workbook()
    await reloaded.xlsx.load(buffer)

    const sheet = reloaded.getWorksheet('Payroll DTR')
    expect(sheet).toBeDefined()
    expect(sheet?.rowCount).toBe(8)
    expect(sheet?.autoFilter).toBe('A1:K1')
    expect(sheet?.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(sheet?.getCell('A2').value).toBe("'=Payroll Formula")
    expect(sheet?.getCell('H2').value).toBeInstanceOf(Date)
    expect(sheet?.getCell('H2').numFmt).toBe('[h]:mm:ss')
  })
})
