import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildWeeklyMemberReportPdf } from './member-report-export'
import { buildGroupedTimeReportPdf } from './bulk-report-export'
import type { MemberMonthlyReport } from '#/lib/server/tracker/member-report.server'

export function weeklyPdfFixture(): MemberMonthlyReport {
  return {
    memberId: 'member-one',
    memberName: 'Alex Rivera',
    memberEmail: 'alex@example.com',
    startDate: '2026-10-18',
    endDate: '2026-10-24',
    currency: 'PHP',
    timezone: 'Asia/Manila',
    entries: Array.from({ length: 80 }, (_, i) => ({
      id: `entry-${i}`,
      date: '2026-10-19',
      startedAt: '2026-10-19T01:00:00Z',
      endedAt: '2026-10-19T02:00:00Z',
      projectName: 'Website improvements',
      clientName: 'Example Client',
      taskName: `Task ${i + 1}`,
      tagNames: ['Development'],
      description: `Implement and review weekly reporting task ${i + 1}.`,
      durationSeconds: 3600,
      entrySource: 'MANUAL',
      billable: true,
      effectiveRate: 250,
      billableAmount: 250,
    })),
    summary: {
      totalSeconds: 288000,
      actualSeconds: 3600,
      overlapSeconds: 284400,
      billableSeconds: 288000,
      nonBillableSeconds: 0,
      entryCount: 80,
      totalBillableAmount: 20000,
    },
  }
}
describe('server PDF report output', () => {
  it('generates multi-page bytes without browser globals or a download', async () => {
    expect(typeof document).toBe('undefined')
    const bytes = await buildWeeklyMemberReportPdf(
      weeklyPdfFixture(),
      'Example Workspace',
    )
    const content = new TextDecoder().decode(bytes)
    expect(content.startsWith('%PDF-')).toBe(true)
    expect(content).toContain('Weekly Personal Time Report')
    expect(content).toContain('Example Workspace')
    expect(content).toContain('2026-10-18 to 2026-10-24')
    expect(content).toContain('Running timers are excluded')
    expect((content.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1)
    // Optional local visual QA artifact; never contains real member data.
    if (process.env.WEEKLY_REPORT_PDF_PREVIEW)
      writeFileSync(process.env.WEEKLY_REPORT_PDF_PREVIEW, bytes)
  })
  it('returns a valid document for an empty grouped manual export', async () => {
    const doc = await buildGroupedTimeReportPdf({
      scopeType: 'all',
      scopeLabel: 'Empty',
      startDate: '2026-10-18',
      endDate: '2026-10-24',
      currency: 'PHP',
      timezone: 'Asia/Manila',
      groups: [],
      summary: {
        totalSeconds: 0,
        actualSeconds: 0,
        overlapSeconds: 0,
        billableSeconds: 0,
        nonBillableSeconds: 0,
        billableAmount: 0,
        entryCount: 0,
      },
    })
    expect(doc.output()).toContain('No time entries match this selection.')
  })
})
