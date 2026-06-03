import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { MemberMonthlyReport } from '#/lib/server/tracker/member-report.server'
import {
  buildCsv,
  downloadTextFile,
  formatHm,
  formatMoney,
} from './export-utils'

function reportFilename(report: MemberMonthlyReport, ext: string): string {
  const safeName = report.memberName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  return `member-report-${safeName}-${report.startDate}-${report.endDate}.${ext}`
}

/**
 * Generates and downloads a PDF report for a single member, built from the
 * role-scoped `getMemberMonthlyReport` payload.
 *
 * The member's billable rate is shown once in the header (it is constant per
 * member) rather than repeated on every row.
 */
export function downloadMemberReportPdf(report: MemberMonthlyReport): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const margin = 40
  let y = margin

  // The effective rate is the same across all of a member's entries.
  const memberRate =
    report.entries.length > 0 ? report.entries[0].effectiveRate : null

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Member Time Report', margin, y)
  y += 22

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`${report.memberName} (${report.memberEmail})`, margin, y)
  y += 14
  doc.text(`Period: ${report.startDate} to ${report.endDate}`, margin, y)
  y += 14
  if (memberRate !== null) {
    doc.text(
      `Rate: ${formatMoney(memberRate, report.currency)} / hr`,
      margin,
      y,
    )
    y += 14
  }
  doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`, margin, y)
  y += 24

  // Summary block
  const s = report.summary
  doc.setFont('helvetica', 'bold')
  doc.text('Summary', margin, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  const summaryLines = [
    `Total: ${formatHm(s.totalSeconds)}`,
    `Billable: ${formatHm(s.billableSeconds)}`,
    `Non-billable: ${formatHm(s.nonBillableSeconds)}`,
    `Entries: ${s.entryCount}`,
    `Billable amount: ${formatMoney(s.totalBillableAmount, report.currency)}`,
  ]
  // Render each metric in its own column so longer values never overlap.
  const colWidth = 150
  summaryLines.forEach((line, i) => {
    doc.text(line, margin + i * colWidth, y)
  })
  y += 18

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
    body: report.entries.map((e) => [
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
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 56 }, // Date
      1: { cellWidth: 90 }, // Project
      2: { cellWidth: 120 }, // Client
      3: { cellWidth: 75 }, // Tags
      4: { cellWidth: 'auto' }, // Description (takes remaining space)
      5: { cellWidth: 50, halign: 'right' }, // Time
      6: { cellWidth: 50, halign: 'center' }, // Billable
      7: { cellWidth: 90, halign: 'right' }, // Amount
    },
  })

  doc.save(reportFilename(report, 'pdf'))
}

/**
 * Generates and downloads the same member report as a CSV file. Amounts and
 * hours are emitted as plain numbers so they stay calculable in spreadsheets;
 * the currency code lives in the metadata header.
 */
export function downloadMemberReportCsv(report: MemberMonthlyReport): void {
  const memberRate =
    report.entries.length > 0 ? report.entries[0].effectiveRate : null
  const currency = (report.currency || 'PHP').toUpperCase()

  const rows: (string | number | null | undefined)[][] = [
    ['Member Time Report'],
    ['Member', report.memberName],
    ['Email', report.memberEmail],
    ['Period', `${report.startDate} to ${report.endDate}`],
    ['Currency', currency],
    ['Rate/hr', memberRate ?? ''],
    ['Generated', new Date().toISOString().slice(0, 10)],
    [],
    [
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

  for (const e of report.entries) {
    rows.push([
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

  downloadTextFile(
    buildCsv(rows),
    reportFilename(report, 'csv'),
    'text/csv;charset=utf-8;',
  )
}
