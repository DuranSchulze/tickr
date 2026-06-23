import type { BulkReport } from '#/lib/server/tracker/bulk-report.server'
import {
  buildCsv,
  downloadTextFile,
  formatHms,
  formatMoney,
} from './export-utils'

type GroupedReportExportOptions = {
  title?: string
  filenamePrefix?: string
  orientation?: 'portrait' | 'landscape'
}

function reportFilename(
  report: BulkReport,
  ext: string,
  filenamePrefix = 'bulk-report',
): string {
  const safeScope = report.scopeLabel
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
  return `${filenamePrefix}-${safeScope}-${report.startDate}-${report.endDate}.${ext}`
}

/**
 * Generates and downloads a grouped report PDF. Bulk exports use landscape;
 * single-member exports reuse this same renderer in portrait.
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
  let y = margin

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(options.title ?? 'Bulk Time Report', margin, y)
  y += 20

  doc.setFontSize(11)
  doc.text(report.scopeLabel, margin, y)
  y += 16

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Period: ${report.startDate} to ${report.endDate}`, margin, y)
  y += 14
  doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`, margin, y)
  y += 20

  // Grand totals
  const s = report.summary
  doc.setFont('helvetica', 'bold')
  doc.text('Totals', margin, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  const totalsLine = [
    `Total: ${formatHms(s.totalSeconds)}`,
    `Billable: ${formatHms(s.billableSeconds)}`,
    `Non-billable: ${formatHms(s.nonBillableSeconds)}`,
    `Entries: ${s.entryCount}`,
    `Billable amount: ${formatMoney(s.billableAmount, report.currency)}`,
  ]
  const summaryColumnCount = orientation === 'portrait' ? 2 : 5
  const colWidth =
    (doc.internal.pageSize.getWidth() - margin * 2) / summaryColumnCount
  totalsLine.forEach((line, i) => {
    const row = Math.floor(i / summaryColumnCount)
    const col = i % summaryColumnCount
    doc.text(line, margin + col * colWidth, y + row * 14)
  })
  y += orientation === 'portrait' ? 36 : 22

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
      `${formatHms(group.subtotal.totalSeconds)} - ${group.subtotal.entryCount} entries - ${formatMoney(group.subtotal.billableAmount, report.currency)} billable`,
      margin,
      y + 13,
    )
    y += 22

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [
        [
          'Date',
          'Project',
          'Client',
          'Tags',
          'Description',
          'Time',
          'Billable',
          'Amount',
        ],
      ],
      body: group.entries.map((e) => [
        e.date,
        e.projectName ?? '',
        e.clientName ?? '',
        e.tagNames.join('; '),
        e.description,
        formatHms(e.durationSeconds),
        e.billable ? 'Yes' : 'No',
        e.billableAmount === null
          ? ''
          : formatMoney(e.billableAmount, report.currency),
      ]),
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: orientation === 'portrait' ? 54 : 56 },
        1: { cellWidth: orientation === 'portrait' ? 66 : 90 },
        2: { cellWidth: orientation === 'portrait' ? 72 : 120 },
        3: { cellWidth: orientation === 'portrait' ? 58 : 75 },
        4: { cellWidth: 'auto' },
        5: { cellWidth: orientation === 'portrait' ? 56 : 62, halign: 'right' },
        6: { cellWidth: orientation === 'portrait' ? 42 : 50, halign: 'center' },
        7: { cellWidth: orientation === 'portrait' ? 72 : 90, halign: 'right' },
      },
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
 * grand-total row. Durations are emitted as exact HH:MM:SS strings.
 */
export function downloadGroupedTimeReportCsv(
  report: BulkReport,
  options: GroupedReportExportOptions = {},
): void {
  const currency = (report.currency || 'PHP').toUpperCase()

  const rows: (string | number | null | undefined)[][] = [
    [options.title ?? 'Bulk Time Report'],
    ['Scope', report.scopeLabel],
    ['Period', `${report.startDate} to ${report.endDate}`],
    ['Currency', currency],
    ['Generated', new Date().toISOString().slice(0, 10)],
    [],
    [
      'Member',
      'Email',
      'Date',
      'Project',
      'Client',
      'Tags',
      'Description',
      'Duration',
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
        e.date,
        e.projectName ?? '',
        e.clientName ?? '',
        e.tagNames.join('; '),
        e.description,
        formatHms(e.durationSeconds),
        e.billable ? 'Yes' : 'No',
        e.billable ? e.effectiveRate.toFixed(2) : '',
        e.billableAmount === null ? '' : e.billableAmount.toFixed(2),
      ])
    }
  }

  const s = report.summary
  rows.push(
    [],
    [
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      `${s.entryCount} entries`,
      formatHms(s.totalSeconds),
      '',
      '',
      s.billableAmount.toFixed(2),
    ],
  )

  downloadTextFile(
    buildCsv(rows),
    reportFilename(report, 'csv', options.filenamePrefix),
    'text/csv;charset=utf-8;',
  )
}

export async function downloadBulkReportPdf(report: BulkReport): Promise<void> {
  await downloadGroupedTimeReportPdf(report, {
    title: 'Bulk Time Report',
    filenamePrefix: 'bulk-report',
    orientation: 'landscape',
  })
}

export function downloadBulkReportCsv(report: BulkReport): void {
  downloadGroupedTimeReportCsv(report, {
    title: 'Bulk Time Report',
    filenamePrefix: 'bulk-report',
  })
}
