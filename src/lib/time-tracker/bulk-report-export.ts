import type { BulkReport } from '#/lib/server/tracker/bulk-report.server'
import {
  buildCsv,
  downloadTextFile,
  formatDecimalHours,
  formatDecimalRate,
  formatHms,
  formatMoney,
} from './export-utils'

type GroupedReportExportOptions = {
  title?: string
  subtitle?: string
  filenamePrefix?: string
  orientation?: 'portrait' | 'landscape'
}

function formatReportTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

function formatReportDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function reportFilename(
  report: BulkReport,
  ext: string,
  filenamePrefix = 'time-billing-report',
): string {
  const safeScope =
    report.scopeLabel
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'selected-entries'
  const generatedDate = new Date().toISOString().slice(0, 10)
  return `${filenamePrefix}-${safeScope}-${report.startDate}-to-${report.endDate}-generated-${generatedDate}.${ext}`
}

function reportTitle(options: GroupedReportExportOptions) {
  return options.title ?? 'Time & Billing Detail Report'
}

function reportSubtitle(options: GroupedReportExportOptions) {
  return (
    options.subtitle ??
    'Detailed time entries with project, client, task, tags, billable status, rates, and computed amounts.'
  )
}

function generatedDateLabel() {
  return new Date().toISOString().slice(0, 10)
}

function scopeLabel(report: BulkReport) {
  return report.scopeLabel || 'Selected time entries'
}

function breakdownLabel(report: BulkReport) {
  const count = report.groups.length
  return count === 1 ? '1 member/group' : `${count} members/groups`
}

function summaryRows(report: BulkReport): [string, string][] {
  const s = report.summary
  return [
    ['Tracked time', formatHms(s.totalSeconds)],
    ['Actual time', formatHms(s.actualSeconds)],
    ['Overlapped time', formatHms(s.overlapSeconds)],
    ['Billable time', formatHms(s.billableSeconds)],
    ['Non-billable time', formatHms(s.nonBillableSeconds)],
    ['Entries', String(s.entryCount)],
    ['Billable amount', formatMoney(s.billableAmount, report.currency)],
  ]
}

/**
 * Generates and downloads a grouped report PDF. Detailed reports use
 * landscape so all time and billing columns remain readable.
 */
export async function downloadGroupedTimeReportPdf(
  report: BulkReport,
  options: GroupedReportExportOptions = {},
): Promise<void> {
  // jsPDF + autotable are heavy; load them only when a PDF export is actually
  // requested instead of shipping them with every screen that can open the
  // export dialog.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const orientation = options.orientation ?? 'landscape'
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  const margin = 40
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = margin

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(reportTitle(options), margin, y)
  y += 16

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(reportSubtitle(options), margin, y, {
    maxWidth: pageWidth - margin * 2,
  })
  y += 16

  doc.setDrawColor(220, 224, 232)
  doc.line(margin, y, pageWidth - margin, y)
  y += 18

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const metaColWidth = (pageWidth - margin * 2) / 2
  const writeMeta = (label: string, value: string, x: number, rowY: number) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label, x, rowY)
    doc.setFont('helvetica', 'normal')
    doc.text(value, x + 78, rowY, { maxWidth: metaColWidth - 86 })
  }
  writeMeta('Scope', scopeLabel(report), margin, y)
  writeMeta(
    'Period',
    `${report.startDate} to ${report.endDate}`,
    margin + metaColWidth,
    y,
  )
  y += 14
  writeMeta('Generated', generatedDateLabel(), margin, y)
  writeMeta('Timezone', report.timezone, margin + metaColWidth, y)
  y += 14
  writeMeta('Currency', (report.currency || 'PHP').toUpperCase(), margin, y)
  writeMeta('Breakdown', breakdownLabel(report), margin + metaColWidth, y)
  y += 22

  // Grand totals
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Report Summary', margin, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const totalsLine = summaryRows(report).map(
    ([label, value]) => `${label}: ${value}`,
  )
  const summaryColumnCount = orientation === 'portrait' ? 2 : 4
  const colWidth =
    (doc.internal.pageSize.getWidth() - margin * 2) / summaryColumnCount
  totalsLine.forEach((line, i) => {
    const row = Math.floor(i / summaryColumnCount)
    const col = i % summaryColumnCount
    doc.text(line, margin + col * colWidth, y + row * 14)
  })
  y += orientation === 'portrait' ? 50 : 36

  if (report.groups.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.text('No time entries match this selection.', margin, y)
    doc.save(reportFilename(report, 'pdf', options.filenamePrefix))
    return
  }

  for (const group of report.groups) {
    // Keep the group header with at least a couple of rows on the page.
    if (y > pageHeight - 90) {
      doc.addPage()
      y = margin
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(group.label, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(
      `${formatHms(group.subtotal.totalSeconds)} tracked - ${formatHms(group.subtotal.actualSeconds)} actual - ${group.subtotal.entryCount} entries`,
      margin,
      y + 13,
    )
    y += 22

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [
        [
          'Start Date',
          'Start Time',
          'End Date',
          'End Time',
          'Project',
          'Client',
          'Task',
          'Tags',
          'Description',
          'Duration',
          'Duration (decimal)',
          'Billable',
          'Rate/hr',
          'Amount',
        ],
      ],
      body: group.entries.map((e) => [
        formatReportDate(e.startedAt, report.timezone),
        formatReportTime(e.startedAt, report.timezone),
        formatReportDate(e.endedAt, report.timezone),
        formatReportTime(e.endedAt, report.timezone),
        e.projectName ?? '',
        e.clientName ?? '',
        e.taskName ?? '',
        e.tagNames.join('; '),
        e.description,
        formatHms(e.durationSeconds),
        formatDecimalHours(e.durationSeconds),
        e.billable ? 'Yes' : 'No',
        e.billable ? formatDecimalRate(e.effectiveRate) : '',
        e.billableAmount === null
          ? ''
          : formatMoney(e.billableAmount, report.currency),
      ]),
      styles: {
        fontSize: orientation === 'portrait' ? 6.5 : 8,
        cellPadding: 3,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 44 },
        2: { cellWidth: 48 },
        3: { cellWidth: 44 },
        4: { cellWidth: 60 },
        5: { cellWidth: 60 },
        6: { cellWidth: 55 },
        7: { cellWidth: 45 },
        8: { cellWidth: 'auto' },
        9: { cellWidth: 48, halign: 'right' },
        10: { cellWidth: 45, halign: 'right' },
        11: { cellWidth: 36, halign: 'center' },
        12: { cellWidth: 42, halign: 'right' },
        13: { cellWidth: 58, halign: 'right' },
      },
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
    })

    // jsPDF-autotable records where the last table ended.
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } })
      .lastAutoTable.finalY
    y = finalY + 24
  }

  doc.save(reportFilename(report, 'pdf', options.filenamePrefix))
}

/**
 * Generates and downloads the grouped report as a flat CSV, plus metadata and a
 * grand-total row. Durations are emitted as both exact HH:MM:SS strings and
 * decimal hours.
 */
export function buildGroupedTimeReportCsv(
  report: BulkReport,
  options: GroupedReportExportOptions = {},
): string {
  const currency = (report.currency || 'PHP').toUpperCase()

  const rows: (string | number | null | undefined)[][] = [
    [reportTitle(options)],
    ['Report detail', reportSubtitle(options)],
    ['Scope', scopeLabel(report)],
    ['Period start', report.startDate],
    ['Period end', report.endDate],
    ['Currency', currency],
    ['Timezone', report.timezone],
    ['Generated', generatedDateLabel()],
    ['Breakdown', breakdownLabel(report)],
    [],
    ['Summary'],
    ...summaryRows(report),
    [],
    [
      'Member',
      'Email',
      'Start Date',
      'Start Time',
      'End Date',
      'End Time',
      'Project',
      'Client',
      'Task',
      'Tags',
      'Description',
      'Duration',
      'Duration (decimal)',
      'Billable',
      'Rate/hr',
      'Amount',
    ],
  ]

  for (const group of report.groups) {
    for (const e of group.entries) {
      rows.push([
        group.label,
        group.email,
        formatReportDate(e.startedAt, report.timezone),
        formatReportTime(e.startedAt, report.timezone),
        formatReportDate(e.endedAt, report.timezone),
        formatReportTime(e.endedAt, report.timezone),
        e.projectName ?? '',
        e.clientName ?? '',
        e.taskName ?? '',
        e.tagNames.join('; '),
        e.description,
        formatHms(e.durationSeconds),
        formatDecimalHours(e.durationSeconds),
        e.billable ? 'Yes' : 'No',
        e.billable ? formatDecimalRate(e.effectiveRate) : '',
        e.billableAmount === null ? '' : e.billableAmount.toFixed(2),
      ])
    }
  }

  const s = report.summary
  const summaryRow = (
    label: string,
    seconds: number,
    description = '',
    amount = '',
  ): string[] => {
    const row = Array<string>(16).fill('')
    row[0] = label
    row[10] = description
    row[11] = formatHms(seconds)
    row[12] = formatDecimalHours(seconds)
    row[15] = amount
    return row
  }
  rows.push(
    [],
    summaryRow(
      'TOTAL',
      s.totalSeconds,
      `${s.entryCount} entries`,
      s.billableAmount.toFixed(2),
    ),
    summaryRow('ACTUAL', s.actualSeconds),
    summaryRow('OVERLAP', s.overlapSeconds),
  )

  return buildCsv(rows)
}

export function downloadGroupedTimeReportCsv(
  report: BulkReport,
  options: GroupedReportExportOptions = {},
): void {
  downloadTextFile(
    buildGroupedTimeReportCsv(report, options),
    reportFilename(report, 'csv', options.filenamePrefix),
    'text/csv;charset=utf-8;',
  )
}

export async function downloadBulkReportPdf(report: BulkReport): Promise<void> {
  await downloadGroupedTimeReportPdf(report, {
    title: 'Workspace Time & Billing Report',
    subtitle:
      'Workspace activity grouped by member with client filters, task detail, rates, and computed billable amounts.',
    filenamePrefix: 'workspace-time-billing-report',
    orientation: 'landscape',
  })
}

export function downloadBulkReportCsv(report: BulkReport): void {
  downloadGroupedTimeReportCsv(report, {
    title: 'Workspace Time & Billing Report',
    subtitle:
      'Workspace activity grouped by member with client filters, task detail, rates, and computed billable amounts.',
    filenamePrefix: 'workspace-time-billing-report',
  })
}
