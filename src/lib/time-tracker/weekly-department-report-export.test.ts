import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildWeeklyDepartmentExcel,
  buildWeeklyDepartmentPdf,
} from './weekly-department-report-export'
import type {
  DepartmentReportRow,
  DepartmentReportScope,
} from './weekly-department-report'

const scope: DepartmentReportScope = {
  id: 'test',
  workspace_id: 'workspace',
  workspace_name: 'Trackly',
  department_id: 'department',
  department_name: 'Operations',
  week_start: '2026-10-18',
  week_end: '2026-10-24',
  timezone: 'Asia/Manila',
}
const rows: DepartmentReportRow[] = [
  {
    member_id: 'member',
    assignment_start: '2026-10-01',
    member: '=Example',
    local_date: '2026-10-23',
    status: 'N/A',
    worked_seconds: 0,
    billable_seconds: 0,
    time_in: null,
    time_out: null,
  },
  {
    member_id: 'member',
    assignment_start: '2026-10-01',
    member: '=Example',
    local_date: '2026-10-24',
    status: 'WORK',
    worked_seconds: 3600,
    billable_seconds: 1800,
    time_in: '2026-10-24T00:00:00Z',
    time_out: '2026-10-24T01:00:00Z',
  },
]

describe('weekly department export files', () => {
  it('renders the report through the server PDF renderer', async () => {
    const pdf = new TextDecoder().decode(
      await buildWeeklyDepartmentPdf(scope, rows),
    )
    expect(pdf).toMatch(/^%PDF-/)
    expect(pdf).toContain('Trackly / Operations')
    expect(pdf).toContain('(2026-10-24)')
    expect(pdf).toContain('(N/A)')
    expect(pdf).toContain('Worked 1:00:00   Billable 0:30:00')
  })

  it('writes a filterable workbook with numeric totals and separate confirmation times', async () => {
    const workbook = new ExcelJS.Workbook()
    const output = await buildWeeklyDepartmentExcel(scope, rows)
    await workbook.xlsx.load(output.buffer)
    const sheet = workbook.getWorksheet('Daily time')!
    expect(sheet.autoFilter).toBe('A1:J1')
    expect(sheet.getCell('A2').value).toBe("'=Example")
    expect(sheet.getCell('D2').text).toBe('')
    expect(sheet.getCell('F2').value).toEqual(new Date('1899-12-30T00:00:00Z'))
    expect(sheet.getCell('I2').value).toBe('08:00')
    expect(sheet.getCell('J2').value).toBe('17:00')
    expect(sheet.getCell('D3').value).toBe('08:00')
    expect(sheet.getCell('F3').value).toEqual(new Date('1899-12-30T01:00:00Z'))
    expect(sheet.getCell('G3').value).toEqual(new Date('1899-12-30T00:30:00Z'))
    expect(sheet.getCell('F3').numFmt).toBe('[h]:mm:ss')
  })
})
