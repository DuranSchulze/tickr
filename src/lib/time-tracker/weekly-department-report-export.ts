import { formatTimesheetDuration } from './timesheet'
import { safeSpreadsheetText } from './timesheet-export'
import type {
  DepartmentReportRow,
  DepartmentReportScope,
} from './weekly-department-report'

const columns = [
  { header: 'Member', width: 30 },
  { header: 'Date', width: 14 },
  { header: 'Day', width: 14 },
  { header: 'Time in', width: 13 },
  { header: 'Time out', width: 13 },
  { header: 'Worked', width: 14 },
  { header: 'Billable', width: 14 },
  { header: 'Status', width: 19 },
  { header: 'N/A from', width: 12 },
  { header: 'N/A to', width: 12 },
]

function reportRows(
  scope: DepartmentReportScope,
  rows: DepartmentReportRow[],
  excel: boolean,
) {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: scope.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const day = new Intl.DateTimeFormat('en', {
    timeZone: 'UTC',
    weekday: 'short',
  })
  return rows.map((row) => [
    excel ? safeSpreadsheetText(row.member) : row.member,
    row.local_date,
    day.format(new Date(row.local_date)),
    row.time_in ? time.format(new Date(row.time_in)) : '',
    row.time_out ? time.format(new Date(row.time_out)) : '',
    excel
      ? row.worked_seconds / 86400
      : formatTimesheetDuration(row.worked_seconds),
    excel
      ? row.billable_seconds / 86400
      : formatTimesheetDuration(row.billable_seconds),
    row.status,
    row.status === 'N/A' ? '08:00' : '',
    row.status === 'N/A' ? '17:00' : '',
  ])
}

export function weeklyDepartmentReportFilename(
  scope: DepartmentReportScope,
  format: 'pdf' | 'xlsx',
) {
  const department = scope.department_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `weekly-${department || 'department'}-${scope.week_start}-to-${scope.week_end}.${format}`
}

function reportTitle(scope: DepartmentReportScope) {
  return `${scope.workspace_name} / ${scope.department_name}`
}

export async function buildWeeklyDepartmentPdf(
  scope: DepartmentReportScope,
  rows: DepartmentReportRow[],
) {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const worked = rows.reduce((sum, row) => sum + row.worked_seconds, 0)
  const billable = rows.reduce((sum, row) => sum + row.billable_seconds, 0)
  doc.setFontSize(14)
  const title = doc.splitTextToSize(reportTitle(scope), 750) as string[]
  const metadataY = 50 + title.length * 16
  doc.text(title, 36, 40)
  doc.setFontSize(9)
  doc.text(
    `${scope.week_start} to ${scope.week_end} (${scope.timezone})`,
    36,
    metadataY,
  )
  doc.text(
    `Worked ${formatTimesheetDuration(worked)}   Billable ${formatTimesheetDuration(billable)}`,
    36,
    metadataY + 14,
  )
  autoTable(doc, {
    head: [columns.map(({ header }) => header)],
    body: reportRows(scope, rows, false),
    margin: { top: 30, left: 36, right: 36 },
    startY: metadataY + 24,
    styles: { fontSize: 8, overflow: 'linebreak' },
  })
  return new Uint8Array(doc.output('arraybuffer'))
}

export async function buildWeeklyDepartmentExcel(
  scope: DepartmentReportScope,
  rows: DepartmentReportRow[],
) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const summary = workbook.addWorksheet('Summary')
  summary.columns = [{ width: 22 }, { width: 56 }]
  summary.addRows([
    ['Workspace', safeSpreadsheetText(scope.workspace_name)],
    ['Department', safeSpreadsheetText(scope.department_name)],
    ['Week start', scope.week_start],
    ['Week end', scope.week_end],
    ['Timezone', scope.timezone],
    ['Worked', rows.reduce((sum, row) => sum + row.worked_seconds, 0) / 86400],
    [
      'Billable',
      rows.reduce((sum, row) => sum + row.billable_seconds, 0) / 86400,
    ],
  ])
  summary.getCell('B6').numFmt = '[h]:mm:ss'
  summary.getCell('B7').numFmt = '[h]:mm:ss'
  const sheet = workbook.addWorksheet('Daily time', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = columns
  sheet.getRow(1).font = { bold: true }
  sheet.autoFilter = 'A1:J1'
  sheet.getColumn(6).numFmt = '[h]:mm:ss'
  sheet.getColumn(7).numFmt = '[h]:mm:ss'
  sheet.addRows(reportRows(scope, rows, true))
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}
