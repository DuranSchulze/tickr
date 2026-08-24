import type { TimesheetExportPayload } from '#/lib/server/tracker/timesheet.server'
import { buildCsv, downloadTextFile } from './export-utils'
import { formatTimesheetDuration } from './timesheet'

export const TIMESHEET_EXPORT_HEADERS = [
  'Member',
  'Email',
  'Department',
  'Date',
  'Day',
  'Time In',
  'Time Out',
  'Total Hours',
  'Total Seconds',
  'Entry Count',
  'Status',
] as const

type TimesheetExportRow = {
  member: string
  email: string
  department: string
  date: string
  day: string
  timeIn: string
  timeOut: string
  totalHours: string
  totalSeconds: number
  entryCount: number
  status: 'WORK' | 'RUNNING' | 'NO_TIME'
}

function formatExportTime(value: string | null, timezone: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

/** Keep user-controlled values as literal text when opened in a spreadsheet. */
export function safeSpreadsheetText(value: string): string {
  return /^[\t ]*[=+\-@]/.test(value) ? `'${value}` : value
}

export function buildTimesheetExportRows(
  payload: TimesheetExportPayload,
): TimesheetExportRow[] {
  return payload.members.flatMap((member) =>
    member.days.map((day, index) => ({
      member: safeSpreadsheetText(member.name),
      email: safeSpreadsheetText(member.email),
      department: safeSpreadsheetText(member.departmentName ?? ''),
      date: day.date,
      day: payload.dates[index]?.dayLabel ?? '',
      timeIn: formatExportTime(day.timeIn, payload.timezone),
      timeOut:
        day.status === 'RUNNING'
          ? ''
          : formatExportTime(day.timeOut, payload.timezone),
      totalHours: formatTimesheetDuration(day.snapshotSeconds),
      totalSeconds: day.snapshotSeconds,
      entryCount: day.entryCount,
      status: day.status,
    })),
  )
}

export function downloadTimesheetCsv(payload: TimesheetExportPayload): void {
  const rows = buildTimesheetExportRows(payload)
  downloadTextFile(
    buildCsv([
      [...TIMESHEET_EXPORT_HEADERS],
      ...rows.map((row) => [
        row.member,
        row.email,
        row.department,
        row.date,
        row.day,
        row.timeIn,
        row.timeOut,
        row.totalHours,
        row.totalSeconds,
        row.entryCount,
        row.status,
      ]),
    ]),
    `timesheet-${payload.weekStart}-to-${payload.weekEnd}.csv`,
    'text/csv;charset=utf-8',
  )
}

export async function buildTimesheetExcelWorkbook(
  payload: TimesheetExportPayload,
) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Tickr'
  workbook.created = new Date()
  workbook.title = `Timesheet ${payload.weekStart} to ${payload.weekEnd}`

  const sheet = workbook.addWorksheet('Payroll DTR', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = [
    { header: TIMESHEET_EXPORT_HEADERS[0], key: 'member', width: 24 },
    { header: TIMESHEET_EXPORT_HEADERS[1], key: 'email', width: 30 },
    { header: TIMESHEET_EXPORT_HEADERS[2], key: 'department', width: 20 },
    { header: TIMESHEET_EXPORT_HEADERS[3], key: 'date', width: 13 },
    { header: TIMESHEET_EXPORT_HEADERS[4], key: 'day', width: 12 },
    { header: TIMESHEET_EXPORT_HEADERS[5], key: 'timeIn', width: 13 },
    { header: TIMESHEET_EXPORT_HEADERS[6], key: 'timeOut', width: 13 },
    { header: TIMESHEET_EXPORT_HEADERS[7], key: 'totalHours', width: 15 },
    { header: TIMESHEET_EXPORT_HEADERS[8], key: 'totalSeconds', width: 15 },
    { header: TIMESHEET_EXPORT_HEADERS[9], key: 'entryCount', width: 13 },
    { header: TIMESHEET_EXPORT_HEADERS[10], key: 'status', width: 13 },
  ]

  const header = sheet.getRow(1)
  header.height = 24
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' },
  }
  header.alignment = { vertical: 'middle' }
  sheet.autoFilter = 'A1:K1'

  for (const row of buildTimesheetExportRows(payload)) {
    const worksheetRow = sheet.addRow({
      ...row,
      // Excel stores durations as a fraction of one day. This remains numeric
      // and payroll formulas can sum it without parsing text.
      totalHours: row.totalSeconds / 86_400,
    })
    worksheetRow.getCell('H').numFmt = '[h]:mm:ss'
    worksheetRow.getCell('I').numFmt = '0'
    worksheetRow.getCell('J').numFmt = '0'
    worksheetRow.alignment = { vertical: 'middle' }

    const statusCell = worksheetRow.getCell('K')
    if (row.status === 'RUNNING') {
      statusCell.font = { bold: true, color: { argb: 'FF166534' } }
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDCFCE7' },
      }
    } else if (row.status === 'NO_TIME') {
      statusCell.font = { color: { argb: 'FF6B7280' } }
    }
  }

  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, columnNumber) => {
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      }
      const isRunningStatus = columnNumber === 11 && cell.value === 'RUNNING'
      if (rowNumber > 1 && rowNumber % 2 === 1 && !isRunningStatus) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' },
        }
      }
    })
  })

  return workbook
}

export async function downloadTimesheetExcel(
  payload: TimesheetExportPayload,
): Promise<void> {
  const workbook = await buildTimesheetExcelWorkbook(payload)
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = new Uint8Array(buffer)
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `timesheet-${payload.weekStart}-to-${payload.weekEnd}.xlsx`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
