import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { BulkReport } from '#/lib/server/tracker/bulk-report.server'
import {
  buildCsv,
  downloadTextFile,
  formatHm,
  formatMoney,
} from './export-utils'

function bulkFilename(report: BulkReport, ext: string): string {
  const safeScope = report.scopeLabel
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
  return `bulk-report-${safeScope}-${report.startDate}-${report.endDate}.${ext}`
}

/**
 * Generates and downloads a grouped bulk report PDF. Entries are sectioned by
 * member, each with its own subtotal, under a grand-total summary.
 */
export function downloadBulkReportPdf(report: BulkReport): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const margin = 40
  const pageHeight = doc.internal.pageSize.getHeight()
  let y = margin

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Bulk Time Report', margin, y)
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
    `Total: ${formatHm(s.totalSeconds)}`,
    `Billable: ${formatHm(s.billableSeconds)}`,
    `Non-billable: ${formatHm(s.nonBillableSeconds)}`,
    `Entries: ${s.entryCount}`,
    `Billable amount: ${formatMoney(s.billableAmount, report.currency)}`,
  ]
  const colWidth = 150
  totalsLine.forEach((line, i) => {
    doc.text(line, margin + i * colWidth, y)
  })
  y += 22

  if (report.groups.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.text('No time entries match this selection.', margin, y)
    doc.save(bulkFilename(report, 'pdf'))
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
      `${formatHm(group.subtotal.totalSeconds)} · ${group.subtotal.entryCount} entries · ${formatMoney(group.subtotal.billableAmount, report.currency)} billable`,
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
        formatHm(e.durationSeconds),
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
        0: { cellWidth: 56 },
        1: { cellWidth: 90 },
        2: { cellWidth: 120 },
        3: { cellWidth: 75 },
        4: { cellWidth: 'auto' },
        5: { cellWidth: 50, halign: 'right' },
        6: { cellWidth: 50, halign: 'center' },
        7: { cellWidth: 90, halign: 'right' },
      },
    })

    // jsPDF-autotable records where the last table ended.
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } })
      .lastAutoTable.finalY
    y = finalY + 24
  }

  doc.save(bulkFilename(report, 'pdf'))
}

/**
 * Generates and downloads the bulk report as a flat CSV (one row per entry with
 * a Member column), plus metadata and a grand-total row. Kept flat so the data
 * stays easy to pivot/sum in a spreadsheet.
 */
export function downloadBulkReportCsv(report: BulkReport): void {
  const currency = (report.currency || 'PHP').toUpperCase()

  const rows: (string | number | null | undefined)[][] = [
    ['Bulk Time Report'],
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
      'Hours',
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
        (e.durationSeconds / 3600).toFixed(2),
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
      (s.totalSeconds / 3600).toFixed(2),
      '',
      '',
      s.billableAmount.toFixed(2),
    ],
  )

  downloadTextFile(
    buildCsv(rows),
    bulkFilename(report, 'csv'),
    'text/csv;charset=utf-8;',
  )
}
