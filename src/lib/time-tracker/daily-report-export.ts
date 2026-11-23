import { DAILY_STATUS_LABELS } from './daily-report'
import type { DailyStatus } from './daily-report'
import type { DailyReportFormat, DailyReportScope } from './daily-report-link'
import { formatTimesheetDuration } from './timesheet'
import { safeSpreadsheetText } from './timesheet-export'

/** Everything a daily report file shows, already in workspace-local labels. */
export type DailyReportDataset = {
  scope: DailyReportScope
  workspaceName: string
  /** Department name, member name, or "All departments". */
  title: string
  date: string
  dateLabel: string
  timezone: string
  minimum: string
  members: Array<{
    name: string
    department: string
    timeIn: string
    timeOut: string
    workedSeconds: number
    billableSeconds: number
    entries: number
    status: DailyStatus
    running: boolean
  }>
  entries: Array<{
    member: string
    department: string
    start: string
    end: string
    description: string
    project: string
    seconds: number
    billable: boolean
  }>
}

export function dailyReportFilename(
  dataset: Pick<DailyReportDataset, 'title' | 'date'>,
  format: DailyReportFormat,
) {
  const slug = dataset.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `daily-report-${slug || 'report'}-${dataset.date}.${format}`
}

function totals(dataset: DailyReportDataset) {
  return {
    worked: dataset.members.reduce((sum, row) => sum + row.workedSeconds, 0),
    billable: dataset.members.reduce(
      (sum, row) => sum + row.billableSeconds,
      0,
    ),
  }
}

const memberHeaders = [
  'Member',
  'Department',
  'Time in',
  'Time out',
  'Worked',
  'Billable',
  'Entries',
  'Status',
]
const entryHeaders = [
  'Member',
  'Start',
  'End',
  'Duration',
  'Work',
  'Client / project / task',
  'Billable',
]

function statusLabel(row: DailyReportDataset['members'][number]) {
  return `${DAILY_STATUS_LABELS[row.status]}${row.running ? ' (timer running)' : ''}`
}

export async function buildDailyReportPdf(dataset: DailyReportDataset) {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
    compress: true,
  })
  const { worked, billable } = totals(dataset)
  doc.setFontSize(14)
  const title = doc.splitTextToSize(
    `${dataset.workspaceName} / ${dataset.title}`,
    750,
  ) as string[]
  doc.text(title, 36, 40)
  const metadataY = 50 + title.length * 16
  doc.setFontSize(9)
  doc.text(
    `Daily report for ${dataset.dateLabel} (${dataset.timezone})   Minimum ${dataset.minimum}`,
    36,
    metadataY,
  )
  doc.text(
    `Worked ${formatTimesheetDuration(worked)}   Billable ${formatTimesheetDuration(billable)}   Members ${dataset.members.length}`,
    36,
    metadataY + 14,
  )
  autoTable(doc, {
    head: [memberHeaders],
    body: dataset.members.map((row) => [
      row.name,
      row.department,
      row.timeIn,
      row.timeOut,
      formatTimesheetDuration(row.workedSeconds),
      formatTimesheetDuration(row.billableSeconds),
      String(row.entries),
      statusLabel(row),
    ]),
    margin: { top: 30, left: 36, right: 36 },
    startY: metadataY + 24,
    styles: { fontSize: 8, overflow: 'linebreak' },
  })
  if (dataset.entries.length > 0) {
    autoTable(doc, {
      head: [entryHeaders],
      body: dataset.entries.map((entry) => [
        entry.member,
        entry.start,
        entry.end,
        formatTimesheetDuration(entry.seconds),
        entry.description,
        entry.project,
        entry.billable ? 'Yes' : 'No',
      ]),
      margin: { top: 30, left: 36, right: 36 },
      styles: { fontSize: 8, overflow: 'linebreak' },
      columnStyles: { 4: { cellWidth: 220 } },
    })
  }
  return new Uint8Array(doc.output('arraybuffer'))
}

export async function buildDailyReportExcel(dataset: DailyReportDataset) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const { worked, billable } = totals(dataset)
  const text = (value: string) => safeSpreadsheetText(value)

  const summary = workbook.addWorksheet('Summary')
  summary.columns = [{ width: 22 }, { width: 56 }]
  summary.addRows([
    ['Workspace', text(dataset.workspaceName)],
    ['Report', text(dataset.title)],
    ['Date', dataset.date],
    ['Timezone', dataset.timezone],
    ['Minimum', dataset.minimum],
    ['Worked', worked / 86400],
    ['Billable', billable / 86400],
  ])
  summary.getCell('B6').numFmt = '[h]:mm:ss'
  summary.getCell('B7').numFmt = '[h]:mm:ss'

  const members = workbook.addWorksheet('Members', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  members.columns = [30, 30, 12, 12, 12, 12, 10, 24].map((width, index) => ({
    header: memberHeaders[index],
    width,
  }))
  members.getRow(1).font = { bold: true }
  members.autoFilter = 'A1:H1'
  members.getColumn(5).numFmt = '[h]:mm:ss'
  members.getColumn(6).numFmt = '[h]:mm:ss'
  members.addRows(
    dataset.members.map((row) => [
      text(row.name),
      text(row.department),
      row.timeIn,
      row.timeOut,
      row.workedSeconds / 86400,
      row.billableSeconds / 86400,
      row.entries,
      statusLabel(row),
    ]),
  )

  const entries = workbook.addWorksheet('Entries', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  entries.columns = [30, 12, 12, 12, 50, 40, 10].map((width, index) => ({
    header: entryHeaders[index],
    width,
  }))
  entries.getRow(1).font = { bold: true }
  entries.autoFilter = 'A1:G1'
  entries.getColumn(4).numFmt = '[h]:mm:ss'
  entries.addRows(
    dataset.entries.map((entry) => [
      text(entry.member),
      entry.start,
      entry.end,
      entry.seconds / 86400,
      text(entry.description),
      text(entry.project),
      entry.billable ? 'Yes' : 'No',
    ]),
  )

  return new Uint8Array(await workbook.xlsx.writeBuffer())
}
