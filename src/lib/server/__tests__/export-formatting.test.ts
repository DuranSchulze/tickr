import { describe, expect, it } from 'vitest'
import type { BulkReport } from '#/lib/server/tracker/bulk-report.server'
import { buildGroupedTimeReportCsv } from '#/lib/time-tracker/bulk-report-export'
import {
  buildCsv,
  formatDecimalHours,
  formatDecimalRate,
} from '#/lib/time-tracker/export-utils'

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < csv.length; index++) {
    const char = csv[index]
    const next = csv[index + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      index++
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if (char === '\r' && next === '\n' && !quoted) {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      index++
    } else {
      cell += char
    }
  }
  row.push(cell)
  rows.push(row)
  return rows
}

describe('export formatting', () => {
  it('formats hourly rates as two-decimal plain values', () => {
    expect(formatDecimalRate(0)).toBe('0.00')
    expect(formatDecimalRate(10.5)).toBe('10.50')
    expect(formatDecimalRate(1234.567)).toBe('1234.57')
    expect(formatDecimalRate(Number.NaN)).toBe('0.00')
  })

  it('formats durations as decimal hours', () => {
    expect(formatDecimalHours(0)).toBe('0.00')
    expect(formatDecimalHours(210)).toBe('0.06')
    expect(formatDecimalHours(2700)).toBe('0.75')
    expect(formatDecimalHours(5400)).toBe('1.50')
  })

  it('escapes CSV text and neutralizes formula-like values', () => {
    const csv = buildCsv([
      ['Description', 'Tags'],
      ['Hello, "team"\nnext line', '=SUM(A1:A2)'],
      ['@mention', '  +command'],
    ])

    expect(parseCsvRows(csv)).toEqual([
      ['Description', 'Tags'],
      ['Hello, "team"\nnext line', "'=SUM(A1:A2)"],
      ["'@mention", "'  +command"],
    ])
  })

  it('keeps grouped export detail rows aligned with the header', () => {
    const report: BulkReport = {
      scopeType: 'all',
      scopeLabel: 'All workspace activity',
      startDate: '2026-06-19',
      endDate: '2026-06-19',
      currency: 'PHP',
      timezone: 'Asia/Manila',
      groups: [
        {
          key: 'member-1',
          label: 'Admin, Example',
          email: 'admin@example.com',
          entries: [
            {
              id: 'entry-1',
              date: '2026-06-19',
              startedAt: '2026-06-19T15:30:00.000Z',
              endedAt: '2026-06-19T17:00:00.000Z',
              projectName: 'Project "A"',
              clientName: 'Client, Inc.',
              tagNames: ['BP', 'BH'],
              description: '=unsafe\nlong description',
              durationSeconds: 5400,
              billable: true,
              effectiveRate: 150.5,
              billableAmount: 225.75,
            },
            {
              id: 'entry-2',
              date: '2026-06-19',
              startedAt: '2026-06-19T02:00:00.000Z',
              endedAt: '2026-06-19T03:00:00.000Z',
              projectName: null,
              clientName: null,
              tagNames: [],
              description: 'Non-billable',
              durationSeconds: 3600,
              billable: false,
              effectiveRate: 999,
              billableAmount: null,
            },
          ],
          subtotal: {
            totalSeconds: 9000,
            actualSeconds: 9000,
            overlapSeconds: 0,
            billableSeconds: 5400,
            billableAmount: 225.75,
            entryCount: 2,
          },
        },
      ],
      summary: {
        totalSeconds: 9000,
        actualSeconds: 9000,
        overlapSeconds: 0,
        billableSeconds: 5400,
        nonBillableSeconds: 3600,
        billableAmount: 225.75,
        entryCount: 2,
      },
    }

    const rows = parseCsvRows(buildGroupedTimeReportCsv(report))
    const headerIndex = rows.findIndex((row) => row[0] === 'Member')
    const header = rows[headerIndex]
    const billableRow = rows[headerIndex + 1]
    const nonBillableRow = rows[headerIndex + 2]

    expect(header).toHaveLength(15)
    expect(billableRow).toHaveLength(header.length)
    expect(nonBillableRow).toHaveLength(header.length)
    expect(billableRow.slice(2, 6)).toEqual([
      '2026-06-19',
      '11:30 PM',
      '2026-06-20',
      '01:00 AM',
    ])
    expect(billableRow[11]).toBe('1.50')
    expect(billableRow[13]).toBe('150.50')
    expect(billableRow[14]).toBe('225.75')
    expect(nonBillableRow[13]).toBe('')
    expect(nonBillableRow[14]).toBe('')
  })
})
