import type { MemberMonthlyReport } from '#/lib/server/tracker/member-report.server'
import type { BulkReport } from '#/lib/server/tracker/bulk-report.server'
import {
  buildGroupedTimeReportPdf,
  downloadGroupedTimeReportCsv,
  downloadGroupedTimeReportPdf,
} from './bulk-report-export'

function toGroupedReport(report: MemberMonthlyReport): BulkReport {
  return {
    scopeType: 'all',
    scopeLabel: `${report.memberName} (${report.memberEmail})`,
    startDate: report.startDate,
    endDate: report.endDate,
    currency: report.currency,
    timezone: report.timezone,
    groups: [
      {
        key: report.memberId,
        label: report.memberName,
        email: report.memberEmail,
        entries: report.entries,
        subtotal: {
          totalSeconds: report.summary.totalSeconds,
          actualSeconds: report.summary.actualSeconds,
          overlapSeconds: report.summary.overlapSeconds,
          billableSeconds: report.summary.billableSeconds,
          billableAmount: report.summary.totalBillableAmount,
          entryCount: report.summary.entryCount,
        },
      },
    ],
    summary: {
      totalSeconds: report.summary.totalSeconds,
      actualSeconds: report.summary.actualSeconds,
      overlapSeconds: report.summary.overlapSeconds,
      billableSeconds: report.summary.billableSeconds,
      nonBillableSeconds: report.summary.nonBillableSeconds,
      billableAmount: report.summary.totalBillableAmount,
      entryCount: report.summary.entryCount,
    },
  }
}

/**
 * Generates and downloads a landscape PDF report for a single member using the
 * same grouped report renderer as Bulk Export.
 */
export async function downloadMemberReportPdf(
  report: MemberMonthlyReport,
): Promise<void> {
  await downloadGroupedTimeReportPdf(toGroupedReport(report), {
    title: 'Member Time & Billing Report',
    subtitle:
      'Individual member time entries with task detail, client rates, billable status, and computed amounts.',
    filenamePrefix: 'member-time-billing-report',
    orientation: 'landscape',
  })
}

/**
 * Generates and downloads the same member report as a CSV file.
 */
export function downloadMemberReportCsv(report: MemberMonthlyReport): void {
  downloadGroupedTimeReportCsv(toGroupedReport(report), {
    title: 'Member Time & Billing Report',
    subtitle:
      'Individual member time entries with task detail, client rates, billable status, and computed amounts.',
    filenamePrefix: 'member-time-billing-report',
  })
}

/** Server-compatible PDF bytes, sharing the manual export renderer. */
export async function buildWeeklyMemberReportPdf(
  report: MemberMonthlyReport,
  workspaceName: string,
) {
  const doc = await buildGroupedTimeReportPdf(toGroupedReport(report), {
    title: 'Weekly Personal Time Report',
    subtitle: `${workspaceName} - Completed entries only. Running timers are excluded.`,
    orientation: 'landscape',
  })
  return new Uint8Array(doc.output('arraybuffer'))
}
